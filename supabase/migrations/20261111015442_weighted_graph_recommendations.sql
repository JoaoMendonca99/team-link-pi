-- P42: complementary weights and opt-in social paths; catalogs and private policies stay intact.
create schema if not exists recommendation_private;
revoke all on schema recommendation_private from public,anon,authenticated;
grant usage on schema recommendation_private to authenticated;
alter table public.conceitos_vinculos add column peso smallint not null default 3 check(peso between 1 and 5);
alter table public.project_required_skills add column peso smallint not null default 3 check(peso between 1 and 5);
create table public.graph_preferences(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 share_connections boolean not null default false
);
alter table public.graph_preferences enable row level security;
revoke all on public.graph_preferences from public,anon,authenticated;
grant select,insert,update on public.graph_preferences to authenticated;
create policy graph_preferences_own on public.graph_preferences for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

-- Canonical metadata is used only when its reviewed name is already explicitly public.
-- Unreviewed/ambiguous free text is not disclosed or guessed.
create function recommendation_private.concepts(kind text,target uuid,labels text[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 with found as (
  select c.id,c.nome label,c.nome raw from public.conceitos_vinculos v join public.conceitos c on c.id=v.conceito_id
  where v.tipo=kind and v.target_id=target and c.status='validado' and c.nome=any(coalesce(labels,'{}'))
  union
  select c.id,c.nome,t.label from unnest(coalesce(labels,'{}')) t(label)
  join public.conceitos c on c.id=concept_private.resolve_exact(t.label)
 ), unique_refs as (select distinct on(id) id,label,raw from found order by id,(raw=label) desc,raw)
 select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]') from unique_refs r
$$;
revoke all on function recommendation_private.concepts(text,uuid,text[]) from public,anon,authenticated;

create function recommendation_private.requirements(pid uuid,vid uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',r.id,'concept',r.concept,'label',r.label,'weight',r.peso,'source',case when vid is null then 'project' else 'vacancy' end) order by r.id),'[]') from (
  select id,coalesce(conceito_id,concept_private.resolve_exact(skill)) concept,skill label,peso from public.project_required_skills where project_id=pid and vid is null
  union all
  select v.id,case when c.status='validado' then c.id else concept_private.resolve_exact(v.texto_original) end,
   coalesce(c.nome,v.texto_original),v.peso from public.conceitos_vinculos v left join public.conceitos c on c.id=v.conceito_id
   where v.project_id=pid and v.vacancy_id=vid and v.tipo='requirement'
 )r
$$;
revoke all on function recommendation_private.requirements(uuid,uuid) from public,anon,authenticated;

create function recommendation_private.context(mode text,pid uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare actor uuid:=auth.uid(); user_ids uuid[]; project_ids uuid[]; seed uuid[]; broad uuid[]; result jsonb; actor_courses uuid[];actor_institutions uuid[];
begin
 if actor is null or mode is null or mode not in ('collaborators','opportunities','friends') or (mode='collaborators' and (pid is null or not public.is_project_join_manager(pid))) or (mode<>'collaborators' and pid is not null) then raise exception 'Acesso não permitido.' using errcode='42501';end if;
 if mode='collaborators' then
  select array_agg(distinct conceito_id) into seed from public.conceitos_vinculos where project_id=pid and conceito_id is not null;
  seed:=coalesce(seed,'{}')||coalesce((select array_agg(coalesce(conceito_id,concept_private.resolve_exact(skill))) from public.project_required_skills where project_id=pid),'{}');
 else
  select array_agg(distinct conceito_id) into seed from public.conceitos_vinculos where user_id=actor and conceito_id is not null;
 end if;
 -- Exactly one validated semantic hop expands the indexed database selection.
 select coalesce(array_agg(distinct id),'{}') into broad from (
  select unnest(seed) id union select case when origem_id=any(seed) then destino_id else origem_id end from public.conceitos_relacoes
   where validado and (origem_id=any(seed) or destino_id=any(seed))
 )s where id is not null;
 select array_agg(distinct curso_id),array_agg(distinct instituicao_id) into actor_courses,actor_institutions from public.usuario_formacoes where user_id=actor;
 select array_agg(id) into user_ids from (
  select p.id from public.profiles p where p.id<>actor and (
    exists(select 1 from public.conceitos_vinculos v where v.user_id=p.id and v.conceito_id=any(broad))
    or mode='friends' and exists(select 1 from public.usuario_formacoes e left join public.cursos c on c.id=e.curso_id where e.user_id=p.id and
      (e.instituicao_id=any(actor_institutions) or e.curso_id=any(actor_courses) or exists(select 1 from public.cursos own where own.id=any(actor_courses) and own.codigo_cine is not null and left(own.codigo_cine,2)=left(c.codigo_cine,2))))
    or mode='friends' and exists(select 1 from public.friendships f join public.friendships g on f.state='accepted' and g.state='accepted' and
      (case when f.user_low=actor then f.user_high else f.user_low end) in (g.user_low,g.user_high)
      join public.graph_preferences a on a.user_id=f.user_low and a.share_connections
      join public.graph_preferences b on b.user_id=f.user_high and b.share_connections
      join public.graph_preferences c on c.user_id=g.user_low and c.share_connections
      join public.graph_preferences d on d.user_id=g.user_high and d.share_connections
      where actor in(f.user_low,f.user_high) and p.id in(g.user_low,g.user_high))
    or mode='friends' and exists(select 1 from public.project_members m join public.project_members own on own.project_id=m.project_id join public.projects pr on pr.id=m.project_id
      where m.user_id=p.id and m.status='active' and own.user_id=actor and own.status='active' and pr.visibility='public' and pr.status<>'archived')
  ) order by p.id limit 120
 )q;
 user_ids:=array_prepend(actor,coalesce(user_ids,'{}'));
 select array_agg(id) into project_ids from (
  select p.id from public.projects p where (mode='collaborators' and p.id=pid) or (mode<>'collaborators' and p.visibility='public' and p.status in('open','in_progress') and (
   exists(select 1 from public.conceitos_vinculos v where v.project_id=p.id and v.conceito_id=any(broad))
   or exists(select 1 from public.project_required_skills r where r.project_id=p.id and coalesce(r.conceito_id,concept_private.resolve_exact(r.skill))=any(broad))
   or exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=actor and m.status='active')
  )) order by p.id limit 48
 )q;
 with person_data as (
  select p.id,coalesce(nullif(trim(p.full_name),''),'Pessoa Team Link') name,p.avatar_url avatar,
   recommendation_private.concepts('skill',p.id,p.skills) skills,recommendation_private.concepts('interest',p.id,p.interests) interests,
   coalesce((select jsonb_agg(jsonb_build_object('course',e.curso_id,'institution',e.instituicao_id,'current',e.cursando_atualmente,'status',e.situacao,'primary',e.id=p.education_primary_id) order by e.posicao,e.id) from public.usuario_formacoes e where e.user_id=p.id),'[]') educations,
   mode='collaborators' and exists(select 1 from public.join_requests j where j.project_id=pid and j.user_id=p.id and j.status='pending') excluded
  from public.profiles p where p.id=any(user_ids)
 ), projects_data as (
  select p.id,p.slug,p.title,p.category,p.academic_course_id "academicCourse",p.academic_institution_id "academicInstitution",
   recommendation_private.concepts('tag',p.id,array(select tag from public.project_tags where project_id=p.id)) tags,
   recommendation_private.requirements(p.id,null) requirements,
   exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=actor and m.status='active') joined,
   exists(select 1 from public.join_requests j where j.project_id=p.id and j.user_id=actor and j.status='pending') pending,
   p.visibility='public' and p.status in('open','in_progress') open
  from public.projects p where p.id=any(project_ids)
 ), vacancy_data as (
  select v.id,v.project_id project,v.title,v.open,
   greatest(0,v.positions-(select count(*) from public.join_request_vacancies j where j.vacancy_id=v.id and j.approved_at is not null and j.released_at is null)) available,
   recommendation_private.requirements(v.project_id,v.id) requirements
  from public.project_vacancies v where v.project_id=any(project_ids) and v.open order by v.id limit 160
 ), all_concepts as (
  select (c->>'id')::uuid id from person_data p,jsonb_array_elements(p.skills||p.interests)c
  union select (c->>'id')::uuid from projects_data p,jsonb_array_elements(p.tags)c
  union select (c->>'concept')::uuid from projects_data p,jsonb_array_elements(p.requirements)c where c->>'concept' is not null
  union select (c->>'concept')::uuid from vacancy_data v,jsonb_array_elements(v.requirements)c where c->>'concept' is not null
 ), course_data as (
  select c.id,c.nome label,c.codigo_cine cine from public.cursos c where c.id in(select e.curso_id from public.usuario_formacoes e where e.user_id=any(user_ids) union select academic_course_id from public.projects where id=any(project_ids))
 ), area_data as (
  select c.codigo id,c.nome label,c.area_detalhada parent from public.cursos_cine c where c.codigo in(select cine from course_data)
  union select a.codigo,a.nome,a.pai_codigo from public.cursos_cine_areas a where exists(select 1 from course_data c where c.cine like a.codigo||'%')
 ), institution_data as (
  select i.id,i.nome label from public.instituicoes_ensino i where i.id in(select e.instituicao_id from public.usuario_formacoes e where e.user_id=any(user_ids) union select academic_institution_id from public.projects where id=any(project_ids))
 ), allowed_friends as (
  select f.user_low a,f.user_high b from public.friendships f where f.state='accepted' and f.user_low=any(user_ids) and f.user_high=any(user_ids)
   and exists(select 1 from public.graph_preferences a where a.user_id=f.user_low and a.share_connections)
   and exists(select 1 from public.graph_preferences b where b.user_id=f.user_high and b.share_connections)
 )
 select jsonb_build_object('actor',actor,'people',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from person_data p),
  'projects',(select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') from projects_data p),'vacancies',(select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]') from vacancy_data v),
  'concepts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'label',c.nome) order by c.id),'[]') from public.conceitos c where c.id in(select id from all_concepts)),
  'relations',(select coalesce(jsonb_agg(jsonb_build_object('from',r.origem_id,'to',r.destino_id,'type',r.tipo) order by r.origem_id,r.destino_id),'[]') from public.conceitos_relacoes r where r.validado and r.origem_id in(select id from all_concepts) and r.destino_id in(select id from all_concepts)),
  'courses',(select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]') from course_data c),'areas',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]') from area_data a),
  'institutions',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]') from institution_data i),
  'offers',(select coalesce(jsonb_agg(to_jsonb(o)),'[]') from (select distinct curso_id course,instituicao_id institution from public.cursos_ofertas where curso_id in(select id from course_data) and instituicao_id in(select id from institution_data) order by curso_id,instituicao_id limit 300)o),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('user',m.user_id,'project',m.project_id) order by m.project_id,m.user_id),'[]') from public.project_members m where m.status='active' and m.project_id=any(project_ids) and m.user_id=any(user_ids)),
  'friends',(select coalesce(jsonb_agg(to_jsonb(f) order by f.a,f.b),'[]') from allowed_friends f),
  'excludedFriends',(select coalesce(jsonb_agg(case when user_low=actor then user_high else user_low end),'[]') from public.friendships where actor in(user_low,user_high)),
  'sharing',coalesce((select share_connections from public.graph_preferences where user_id=actor),false),
  'limited',cardinality(user_ids)>=121 or cardinality(project_ids)>=48 or (select count(*)>=160 from vacancy_data)
 ) into result;
 return result;
end $$;
revoke all on function recommendation_private.context(text,uuid) from public,anon,authenticated;
grant execute on function recommendation_private.context(text,uuid) to authenticated;
create function public.get_recommendation_context(p_mode text,p_project uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$ select recommendation_private.context(p_mode,p_project) $$;
revoke all on function public.get_recommendation_context(text,uuid) from public,anon;
grant execute on function public.get_recommendation_context(text,uuid) to authenticated;

create function recommendation_private.weights(pid uuid,changes jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; n int;
begin
 if auth.uid() is null or not public.is_project_join_manager(pid) then raise exception 'Acesso não permitido.' using errcode='42501';end if;
 if changes is not null then
  if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>60 then raise exception 'Pesos inválidos.' using errcode='23514';end if;
  perform 1 from public.projects where id=pid for update;
  for r in select * from jsonb_array_elements(changes) loop
   if coalesce(jsonb_typeof(r->'weight'),'')<>'number' or (r->>'weight')::numeric<>trunc((r->>'weight')::numeric) or (r->>'weight')::int not between 1 and 5 or coalesce(r->>'source','') not in ('project','vacancy') then raise exception 'Pesos inválidos.' using errcode='23514';end if;
   if r->>'source'='project' then update public.project_required_skills set peso=(r->>'weight')::int where id=(r->>'key')::uuid and project_id=pid;
   else update public.conceitos_vinculos set peso=(r->>'weight')::int where id=(r->>'key')::uuid and project_id=pid and tipo='requirement';end if;
   get diagnostics n=row_count;if n<>1 then raise exception 'Requisito indisponível.' using errcode='42501';end if;
  end loop;
 end if;
 return jsonb_build_object('project',recommendation_private.requirements(pid,null),'vacancies',
  (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'requirements',recommendation_private.requirements(pid,v.id)) order by v.created_at,v.id),'[]') from public.project_vacancies v where v.project_id=pid));
end $$;
revoke all on function recommendation_private.weights(uuid,jsonb) from public,anon,authenticated;
grant execute on function recommendation_private.weights(uuid,jsonb) to authenticated;
create function public.graph_requirement_weights(p_project uuid,p_changes jsonb default null) returns jsonb language sql security invoker set search_path='' as $$ select recommendation_private.weights(p_project,p_changes) $$;
revoke all on function public.graph_requirement_weights(uuid,jsonb) from public,anon;
grant execute on function public.graph_requirement_weights(uuid,jsonb) to authenticated;

create or replace function concept_private.replace_refs(p_type text,p_target uuid,p_values jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb; n integer:=0; cid uuid; pid uuid; old public.conceitos_vinculos[];
begin
 select array_agg(v) into old from public.conceitos_vinculos v where tipo=p_type and target_id=p_target;
 delete from public.conceitos_vinculos where tipo=p_type and target_id=p_target;
 if p_type='requirement' then select project_id into pid from public.project_vacancies where id=p_target; elsif p_type='tag' then pid:=p_target; end if;
 for r in select * from jsonb_array_elements(p_values) loop
  cid:=nullif(r->>'id','')::uuid;
  insert into public.conceitos_vinculos(id,tipo,user_id,project_id,vacancy_id,conceito_id,texto_original,posicao,pendencia,created_at,peso)
  select coalesce(o.id,gen_random_uuid()),p_type,case when p_type in ('skill','interest') then p_target end,pid,
   case when p_type='requirement' then p_target end,cid,coalesce(r->>'raw',r->>'label',''),n,
   case when cid is null then coalesce(r->>'pending','unreviewed') end,coalesce(o.created_at,now()),coalesce(o.peso,3)
  from (select 1) x left join lateral(select t.id,t.created_at,t.peso from unnest(old) t
    where (cid is not null and t.conceito_id=cid) or (cid is null and t.conceito_id is null and t.texto_original=coalesce(r->>'raw',r->>'label','')) limit 1) o on true
  on conflict do nothing;
  n:=n+1;
 end loop;
end $$;
