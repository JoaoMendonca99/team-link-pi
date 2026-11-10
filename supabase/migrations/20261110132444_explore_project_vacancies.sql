create schema vacancy_private;
revoke all on schema vacancy_private from public,anon,authenticated;
grant usage on schema vacancy_private to authenticated;
alter default privileges in schema vacancy_private revoke execute on functions from public;

-- Private read model. No application role can query it directly. Occupancy uses the
-- same unreleased approvals and public/open/in_progress guards as recruitment RPCs.
create view vacancy_private.public_vacancies with(security_invoker=true) as
 select v.id,v.project_id,v.title,v.description,v.skills,v.positions,v.open,v.created_at,
 p.slug,p.title project_title,p.short_description,p.description project_description,p.category,
 p.secondary_categories,p.status project_status,p.owner_id,
 v.positions-(select count(*) from public.join_request_vacancies x
   where x.vacancy_id=v.id and x.approved_at is not null and x.released_at is null) available
 from public.project_vacancies v join public.projects p on p.id=v.project_id
 where p.visibility='public' and p.status in ('open','in_progress');
revoke all on vacancy_private.public_vacancies from public,anon,authenticated;

create index project_vacancies_open_recent on public.project_vacancies(created_at desc,id) where open;
create index project_vacancies_search on public.project_vacancies using gin
 ((lower(title||' '||coalesce(description,''))) extensions.gin_trgm_ops);

create function vacancy_private.explore(p_options jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); query text:=left(trim(coalesce(p_options->>'search','')),120);
 category_filter text:=left(coalesce(p_options->>'category',''),120); skill uuid:=nullif(p_options->>'skill','')::uuid;
 ordering text:=coalesce(p_options->>'sort','recent'); page integer:=greatest(0,least(coalesce((p_options->>'page')::integer,0),10000));
 size integer:=greatest(1,least(coalesce((p_options->>'size')::integer,12),24)); result jsonb; pattern text;
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 pattern:='%'||replace(replace(replace(lower(query),'\','\\'),'%','\%'),'_','\_')||'%';
 with filtered as materialized (
  select v.id,v.project_id,v.slug,v.title,left(v.description,240) description,v.skills,v.available,
   v.project_title,v.category,v.project_status,v.created_at from vacancy_private.public_vacancies v
  where v.open and v.available>0 and v.owner_id<>actor
   and not exists(select 1 from public.project_members m where m.project_id=v.project_id and m.user_id=actor and m.status='active')
   and (category_filter='' or v.category=category_filter or category_filter=any(v.secondary_categories))
   and (query='' or lower(v.title||' '||coalesce(v.description,'')) like pattern
    or lower(v.project_title) like pattern or lower(coalesce(v.category,'')) like pattern
    or exists(select 1 from unnest(v.skills) s where lower(s) like pattern))
   and (skill is null or exists(select 1 from public.conceitos_vinculos c where c.vacancy_id=v.id and c.tipo='requirement' and c.conceito_id=skill)
    or exists(select 1 from unnest(v.skills) s where concept_private.resolve_exact(s)=skill
     and not exists(select 1 from public.conceitos_vinculos c where c.vacancy_id=v.id and c.tipo='requirement' and c.texto_original=s and c.conceito_id is not null)))
 ), selected as (
  select * from filtered order by case when ordering='name' then lower(title) end,
   case when ordering<>'name' then created_at end desc,id limit size offset page*size
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'project_id',project_id,'slug',slug,'title',title,'description',left(description,240),'skills',skills,
  'available',available,'project_title',project_title,'category',category,'project_status',project_status
 ) order by case when ordering='name' then lower(title) end,case when ordering<>'name' then created_at end desc,id) from selected),'[]'),
 'total',(select count(*) from filtered),'page',page,'size',size) into result;
 return result;
end $$;

create function vacancy_private.preview(p_vacancy uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); v record; result jsonb;
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 select * into v from vacancy_private.public_vacancies where id=p_vacancy;
 if not found then return null;end if;
 result:=jsonb_build_object('vacancy',jsonb_build_object('id',v.id,'title',v.title,'description',v.description,'skills',v.skills,
  'positions',v.positions,'available',v.available,'open',v.open),
 'project',jsonb_build_object('id',v.project_id,'slug',v.slug,'title',v.project_title,'short_description',v.short_description,
  'description',v.project_description,'category',v.category,'secondary_categories',v.secondary_categories,'status',v.project_status,
  'tags',(select coalesce(jsonb_agg(tag order by created_at,id),'[]') from public.project_tags where project_id=v.project_id),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',m.full_name,'avatar',m.avatar_url,'display_role',m.display_role)),'[]')
   from (select user_id,full_name,avatar_url,display_role from public.project_public_members where project_id=v.project_id order by joined_at,user_id limit 8)m)),
 'member',v.owner_id=actor or exists(select 1 from public.project_members where project_id=v.project_id and user_id=actor and status='active'),
 'vacancies',(select coalesce(jsonb_agg(item),'[]') from jsonb_array_elements(public.recruitment_vacancies(v.project_id))item where (item->>'open')::boolean));
 return result;
end $$;

create function public.explore_project_vacancies(p_options jsonb default '{}') returns jsonb
language sql stable security invoker set search_path='' as $$select vacancy_private.explore(p_options)$$;
create function public.preview_project_vacancy(p_vacancy uuid) returns jsonb
language sql stable security invoker set search_path='' as $$select vacancy_private.preview(p_vacancy)$$;
revoke all on all functions in schema vacancy_private from public,anon,authenticated;
grant execute on function vacancy_private.explore(jsonb),vacancy_private.preview(uuid) to authenticated;
revoke all on function public.explore_project_vacancies(jsonb),public.preview_project_vacancy(uuid) from public,anon,authenticated;
grant execute on function public.explore_project_vacancies(jsonb),public.preview_project_vacancy(uuid) to authenticated;
