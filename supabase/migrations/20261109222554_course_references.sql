alter table public.profiles add column course_id uuid references public.cursos on delete restrict;
grant select(course_id),update(course_id) on public.profiles to authenticated;
grant select(course_id) on public.profiles to anon;
create index profiles_course on public.profiles(course_id) where course_id is not null;
alter table public.projects add column academic_course_id uuid references public.cursos on delete restrict;
create index projects_course on public.projects(academic_course_id) where academic_course_id is not null;

create function course_private.profile_reference() returns trigger language plpgsql security invoker set search_path='' as $$
declare canonical text;
begin
 -- Older clients that edit only the text must not retain an unrelated stale ID.
 if tg_op='UPDATE' and new.course is distinct from old.course and new.course_id is not distinct from old.course_id then
  if not exists(select 1 from public.cursos_aliases where curso_id=new.course_id and validado and normalizado=course_private.normalize(new.course)) then new.course_id:=null; end if;
 end if;
 if new.course_id is not null then
  select nome into canonical from public.cursos where id=new.course_id and status_validacao='validado';
  if not found then raise exception 'Curso indisponível.'; end if;
  -- A reviewed legacy link preserves the original text. Public readers join the
  -- canonical name; an explicit new selection stores the canonical cache.
  if tg_op='UPDATE' and old.course_id is null and new.course is not distinct from old.course and
   exists(select 1 from public.cursos_aliases where curso_id=new.course_id and validado and normalizado=course_private.normalize(new.course)) then return new; end if;
  new.course:=canonical;
 else new.course:=nullif(btrim(new.course),''); end if;
 return new;
end $$;
create trigger profile_course_reference before insert or update of course_id,course on public.profiles for each row execute function course_private.profile_reference();

create function course_private.project_reference() returns trigger language plpgsql security invoker set search_path='' as $$
declare canonical text;
begin
 if tg_op='UPDATE' and new.academic_course is distinct from old.academic_course and new.academic_course_id is not distinct from old.academic_course_id then
  if not exists(select 1 from public.cursos_aliases where curso_id=new.academic_course_id and validado and normalizado=course_private.normalize(new.academic_course)) then new.academic_course_id:=null; end if;
 end if;
 if new.academic_course_id is not null then
  select nome into canonical from public.cursos where id=new.academic_course_id and status_validacao='validado';
  if not found then raise exception 'Curso indisponível.'; end if;
  if tg_op='UPDATE' and old.academic_course_id is null and new.academic_course is not distinct from old.academic_course and
   exists(select 1 from public.cursos_aliases where curso_id=new.academic_course_id and validado and normalizado=course_private.normalize(new.academic_course)) then return new; end if;
  new.academic_course:=canonical;
 else new.academic_course:=nullif(btrim(new.academic_course),''); end if;
 return new;
end $$;
create trigger academic_course_reference before insert or update of academic_course_id,academic_course on public.projects for each row execute function course_private.project_reference();
revoke all on function course_private.profile_reference(),course_private.project_reference() from public,anon,authenticated;

create table course_private.link_migration (
 key text primary key,completed_at timestamptz not null,profiles integer not null,projects integer not null
);
alter table course_private.link_migration enable row level security;
revoke all on course_private.link_migration from public,anon,authenticated;

create function course_private.link_existing_courses() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p integer; j integer; done course_private.link_migration;
begin
 perform pg_advisory_xact_lock(31312024);
 select * into done from course_private.link_migration where key='inep2024_initial';
 if found then return jsonb_build_object('already_completed',true,'profiles',done.profiles,'projects',done.projects); end if;
 if (select count(*) from public.cursos)<>1743 or (select count(*) from public.cursos_cine)<>353 or (select count(*) from public.cursos_ofertas where ano_referencia=2024)<>46150 then raise exception 'Validate the complete course catalog before linking existing text'; end if;
 with candidates as (
  select p.id,p.course original,(array_agg(distinct a.curso_id))[1] course_id from public.profiles p
  join public.cursos_aliases a on a.validado and a.normalizado=course_private.normalize(p.course)
  join public.cursos c on c.id=a.curso_id and c.status_validacao='validado'
  where p.course_id is null and nullif(btrim(p.course),'') is not null group by p.id,p.course having count(distinct a.curso_id)=1
 ) update public.profiles target set course_id=source.course_id from candidates source
  where target.id=source.id and target.course_id is null and target.course is not distinct from source.original;
 get diagnostics p=row_count;
 with candidates as (
  select p.id,p.academic_course original,(array_agg(distinct a.curso_id))[1] course_id from public.projects p
  join public.cursos_aliases a on a.validado and a.normalizado=course_private.normalize(p.academic_course)
  join public.cursos c on c.id=a.curso_id and c.status_validacao='validado'
  where p.academic_course_id is null and nullif(btrim(p.academic_course),'') is not null group by p.id,p.academic_course having count(distinct a.curso_id)=1
 ) update public.projects target set academic_course_id=source.course_id from candidates source
  where target.id=source.id and target.academic_course_id is null and target.academic_course is not distinct from source.original;
 get diagnostics j=row_count;
 insert into course_private.link_migration(key,completed_at,profiles,projects) values('inep2024_initial',clock_timestamp(),p,j);
 return jsonb_build_object('already_completed',false,'profiles',p,'projects',j);
end $$;
revoke all on function course_private.link_existing_courses() from public,anon,authenticated;

create or replace function public.get_project_academics(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.projects; begin
 select * into p from public.projects where id=p_project;
 if auth.uid() is null or p.id is null or not (p.owner_id=auth.uid() or public.is_project_join_manager(p_project) or
 exists(select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active')) then
 raise exception 'Acesso indisponível.'; end if;
 return jsonb_build_object('context',p.project_context,'revision',p.academic_revision,
 'defaults',jsonb_build_object('institution_id',p.academic_institution_id,'course_id',p.academic_course_id,'institution',coalesce(p.academic_institution,''),'course',coalesce((select nome from public.cursos where id=p.academic_course_id),p.academic_course,''),'city',coalesce(p.academic_city,'')),
 'periods',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('task_count',(select count(*) from public.activity_tasks where period_id=r.id),'goal_count',(select count(*) from public.activity_goals where period_id=r.id)) order by r.is_active desc,r.created_at desc,r.id) from public.activity_periods r where r.project_id=p_project),'[]'::jsonb));
end $$;

-- Trigger covers direct project writes too; an old revision can never mask a change.
create or replace function academic_private.project_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.project_context,new.academic_institution_id,new.academic_institution,new.academic_course_id,new.academic_course,new.academic_city) is distinct from
    row(old.project_context,old.academic_institution_id,old.academic_institution,old.academic_course_id,old.academic_course,old.academic_city) then
   new.academic_revision:=old.academic_revision+1;
 else new.academic_revision:=old.academic_revision; end if;
 return new;
end $$;


create or replace function public.save_project_academics(p_project uuid,p_revision integer,p_context text,p_defaults jsonb,p_periods jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects; entry jsonb; begin
 select * into p from public.projects where id=p_project for update;
 if auth.uid() is null or p.id is null or not public.is_project_join_manager(p_project) then raise exception 'Somente Líderes ou Gestores podem configurar informações acadêmicas.'; end if;
 if p.academic_revision is distinct from p_revision then raise exception 'Configuração alterada. Recarregue antes de salvar.'; end if;
 if p_context not in ('academic','general') or p_context is null or jsonb_typeof(p_defaults) is distinct from 'object' or jsonb_typeof(p_periods) is distinct from 'array' or jsonb_array_length(p_periods)>150 then raise exception 'Configuração inválida.'; end if;
 if (select count(*) from jsonb_array_elements(p_periods) e where nullif(e->>'id','') is not null) <>
    (select count(distinct e->>'id') from jsonb_array_elements(p_periods) e where nullif(e->>'id','') is not null) then raise exception 'Períodos duplicados.'; end if;
 update public.projects set project_context=p_context,academic_institution_id=case when p_defaults ? 'institution_id' then nullif(p_defaults->>'institution_id','')::uuid when nullif(btrim(p_defaults->>'institution'),'') is not distinct from p.academic_institution then p.academic_institution_id else null end,academic_institution=nullif(btrim(p_defaults->>'institution'),''),
 academic_course_id=case when p_defaults ? 'course_id' then nullif(p_defaults->>'course_id','')::uuid when nullif(btrim(p_defaults->>'course'),'') is not distinct from p.academic_course then p.academic_course_id else null end,academic_course=nullif(btrim(p_defaults->>'course'),''),academic_city=nullif(btrim(p_defaults->>'city'),'') where id=p_project;
 for entry in select value from jsonb_array_elements(p_periods) loop
   if nullif(entry->>'id','') is null and exists(select 1 from public.activity_periods where project_id=p_project) then raise exception 'Utilize os períodos existentes. Crie novos em Gerenciar períodos.'; end if;
   -- Setup must preserve active period, even if a client sends an activation flag.
   perform academic_private.write_period(p_project,(entry-'activate')||jsonb_build_object('activate',false));
 end loop;
 insert into public.activity_updates(project_id) values(p_project) on conflict(project_id) do update set changed_at=clock_timestamp();
 return public.get_project_academics(p_project);
end $$;
