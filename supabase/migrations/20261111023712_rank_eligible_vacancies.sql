-- Preserve existing eligibility, filters, wrappers and ACLs.
create or replace function vacancy_private.explore(p_options jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); query text:=left(trim(coalesce(p_options->>'search','')),120);
 category_filter text:=left(coalesce(p_options->>'category',''),120); skill uuid:=nullif(p_options->>'skill','')::uuid;
 ordering text:=coalesce(p_options->>'sort','recent'); page integer:=greatest(0,least(coalesce((p_options->>'page')::integer,0),10000));
 size integer:=greatest(1,least(coalesce((p_options->>'size')::integer,12),24)); result jsonb; pattern text; ranked uuid[] := '{}';
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 -- The bounded list only affects order. It cannot grant access to any vacancy.
 if jsonb_typeof(p_options->'recommendation_order')='array' then
  if jsonb_array_length(p_options->'recommendation_order')<=160 then
   select coalesce(array_agg(value::uuid order by ordinality),'{}') into ranked
   from jsonb_array_elements_text(p_options->'recommendation_order') with ordinality
   where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  end if;
 end if;
 pattern:='%'||replace(replace(replace(lower(query),'\','\\'),'%','\%'),'_','\_')||'%';
 with filtered as materialized (
  select v.id,v.project_id,v.slug,v.title,left(v.description,240) description,v.skills,v.available,
   v.project_title,v.category,v.project_status,v.created_at,case when ordering='recommended' then array_position(ranked,v.id) end priority from vacancy_private.public_vacancies v
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
  select * from filtered order by priority nulls last,case when ordering='name' then lower(title) end,
   case when ordering<>'name' then created_at end desc,id limit size offset page*size
 ) select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
  'id',id,'project_id',project_id,'slug',slug,'title',title,'description',left(description,240),'skills',skills,
  'available',available,'project_title',project_title,'category',category,'project_status',project_status
 ) order by priority nulls last,case when ordering='name' then lower(title) end,case when ordering<>'name' then created_at end desc,id) from selected),'[]'),
 'total',(select count(*) from filtered),'page',page,'size',size) into result;
 return result;
end $$;
