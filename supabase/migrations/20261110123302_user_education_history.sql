create schema education_private;
revoke all on schema education_private from public,anon,authenticated;
grant usage on schema education_private to authenticated;
alter default privileges in schema education_private revoke execute on functions from public;

create table public.usuario_formacoes (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 instituicao_id uuid references public.instituicoes_ensino(id) on delete restrict,instituicao_manual text,
 curso_id uuid references public.cursos(id) on delete restrict,curso_manual text,
 cursando_atualmente boolean,origem text not null default 'user' check(origem in ('user','legacy')),posicao integer not null default 0 check(posicao>=0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(user_id,id),
 check((instituicao_id is not null and instituicao_manual is null) or (instituicao_id is null and instituicao_manual is not null and length(trim(instituicao_manual)) between 1 and 500 and instituicao_manual !~ '[[:cntrl:]<>]')),
 check((curso_id is not null and curso_manual is null) or (curso_id is null and curso_manual is not null and length(trim(curso_manual)) between 1 and 500 and curso_manual !~ '[[:cntrl:]<>]')),
 check(origem='legacy' or cursando_atualmente is not null)
);
create index usuario_formacoes_instituicao on public.usuario_formacoes(instituicao_id);
create index usuario_formacoes_curso on public.usuario_formacoes(curso_id);
alter table public.usuario_formacoes enable row level security;
revoke all on public.usuario_formacoes from public,anon,authenticated;
grant select on public.usuario_formacoes to anon,authenticated;
create policy education_visible_profile on public.usuario_formacoes for select to anon,authenticated
 using(exists(select 1 from public.profiles p where p.id=user_id));
alter table public.profiles add column education_primary_id uuid,add column education_revision bigint not null default 0;
alter table public.profiles add constraint profiles_primary_education foreign key(id,education_primary_id)
 references public.usuario_formacoes(user_id,id) deferrable initially deferred;
create index profiles_primary_education on public.profiles(education_primary_id);
grant select(education_primary_id,education_revision) on public.profiles to anon,authenticated;

create table education_private.legacy (
 user_id uuid primary key references public.profiles(id) on delete cascade,original jsonb not null,
 migrated_id uuid references public.usuario_formacoes(id) on delete set null,resolved boolean not null default false,
 created_at timestamptz not null default now()
);
create index education_legacy_formation on education_private.legacy(migrated_id);
create table education_private.migrations(name text primary key,report jsonb not null,created_at timestamptz not null default now());
alter table education_private.legacy enable row level security;
alter table education_private.migrations enable row level security;
revoke all on education_private.legacy,education_private.migrations from public,anon,authenticated;
create policy education_legacy_internal on education_private.legacy as restrictive for all to anon,authenticated using(false) with check(false);
create policy education_migration_internal on education_private.migrations as restrictive for all to anon,authenticated using(false) with check(false);

-- The profile's old columns are a paired projection; current status never selects the primary.
create function education_private.summary(p_user uuid,p_primary uuid)
returns table(course text,course_id uuid,university text,institution_id uuid)
language sql stable security invoker set search_path='' as $$
 select coalesce(c.nome,f.curso_manual),f.curso_id,coalesce(i.nome,f.instituicao_manual),f.instituicao_id
 from public.usuario_formacoes f left join public.cursos c on c.id=f.curso_id left join public.instituicoes_ensino i on i.id=f.instituicao_id
 where f.user_id=p_user and (f.id=p_primary or (p_primary is null and (select count(*) from public.usuario_formacoes where user_id=p_user)=1))
$$;
create function education_private.project() returns trigger language plpgsql security definer set search_path='' as $$
declare summary record;
begin
 select * into summary from education_private.summary(new.id,new.education_primary_id);
 new.course:=summary.course;new.course_id:=summary.course_id;new.university:=summary.university;new.institution_id:=summary.institution_id;
 return new;
end $$;
create trigger zz_education_projection before update of course,course_id,university,institution_id,education_primary_id on public.profiles for each row execute function education_private.project();
create function education_private.refresh(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
declare s record; primary_id uuid;
begin
 select education_primary_id into primary_id from public.profiles where id=p_user;
 select * into s from education_private.summary(p_user,primary_id);
 update public.profiles set course=s.course,course_id=s.course_id,university=s.university,institution_id=s.institution_id
 where id=p_user and row(course,course_id,university,institution_id) is distinct from row(s.course,s.course_id,s.university,s.institution_id);
end $$;
create function education_private.capture(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
declare p public.profiles; fid uuid; original jsonb;
begin
 select * into strict p from public.profiles where id=p_user for update;
 if exists(select 1 from education_private.legacy where user_id=p_user) or exists(select 1 from public.usuario_formacoes where user_id=p_user) then return;end if;
 if p.course_id is null and p.institution_id is null and nullif(trim(p.course),'') is null and nullif(trim(p.university),'') is null then return;end if;
 original:=jsonb_build_object('course',p.course,'course_id',p.course_id,'university',p.university,'institution_id',p.institution_id);
 insert into education_private.legacy(user_id,original) values(p_user,original);
 if (p.institution_id is not null or nullif(trim(p.university),'') is not null) and (p.course_id is not null or nullif(trim(p.course),'') is not null)
 and (p.institution_id is not null or (length(trim(p.university))<=500 and p.university !~ '[[:cntrl:]<>]'))
 and (p.course_id is not null or (length(trim(p.course))<=500 and p.course !~ '[[:cntrl:]<>]')) then
  insert into public.usuario_formacoes(user_id,instituicao_id,instituicao_manual,curso_id,curso_manual,cursando_atualmente,origem)
  values(p_user,p.institution_id,case when p.institution_id is null then p.university end,p.course_id,case when p.course_id is null then p.course end,null,'legacy') returning id into fid;
  update education_private.legacy set migrated_id=fid,resolved=true where user_id=p_user;
 end if;
 perform education_private.refresh(p_user);
end $$;
-- Compatibility for old signup clients: capture their academic metadata without changing Auth.
create function education_private.new_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin perform education_private.capture(new.id);return new;end $$;
create trigger education_capture_signup after insert on public.profiles for each row execute function education_private.new_profile();

create function education_private.apply(p_values jsonb,p_primary uuid,p_revision bigint,p_resolve_legacy boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_revision bigint; r jsonb; fid uuid; previous public.usuario_formacoes; ids uuid[]:='{}'; iid uuid; cid uuid; im text; cm text; studying boolean; old_origin text; affected integer; position_index integer:=0;
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 select education_revision into current_revision from public.profiles where id=actor for update;
 if current_revision is null then raise exception 'Perfil não encontrado.';end if;
 if p_revision is distinct from current_revision then raise exception 'O histórico foi atualizado em outra sessão. Recarregue antes de salvar.' using errcode='40001';end if;
 if p_values is null or jsonb_typeof(p_values)<>'array' or jsonb_array_length(p_values)>20 then raise exception 'Informe até 20 formações completas.' using errcode='22023';end if;
 for r in select * from jsonb_array_elements(p_values) loop
  fid:=nullif(r->>'id','')::uuid;
  if fid is null or fid=any(ids) then raise exception 'Identificador de formação inválido ou repetido.' using errcode='22023';end if;
  select * into previous from public.usuario_formacoes where id=fid;
  if previous.id is not null and previous.user_id<>actor then raise exception 'Acesso não permitido.' using errcode='42501';end if;
  iid:=nullif(r->>'instituicao_id','')::uuid;cid:=nullif(r->>'curso_id','')::uuid;
  im:=nullif(trim(r->>'instituicao_manual'),'');cm:=nullif(trim(r->>'curso_manual'),'');
  studying:=(r->>'cursando_atualmente')::boolean;old_origin:=coalesce(previous.origem,'user');
  if (iid is null)=(im is null) or (cid is null)=(cm is null) then raise exception 'Cada formação precisa de instituição e curso, oficiais ou manuais.' using errcode='22023';end if;
  if iid is not null and not exists(select 1 from public.instituicoes_ensino where id=iid) then raise exception 'Instituição indisponível.' using errcode='22023';end if;
  if cid is not null and not exists(select 1 from public.cursos where id=cid and status_validacao='validado') then raise exception 'Curso indisponível.' using errcode='22023';end if;
  if old_origin='user' and studying is null then raise exception 'Informe a situação atual da nova formação.' using errcode='22023';end if;
  if previous.id is null and exists(select 1 from public.usuario_formacoes f where f.user_id=actor and f.instituicao_id is not distinct from iid and f.curso_id is not distinct from cid
   and lower(coalesce(trim(f.instituicao_manual),''))=lower(coalesce(im,'')) and lower(coalesce(trim(f.curso_manual),''))=lower(coalesce(cm,'')))
   and not coalesce((r->>'duplicate_ack')::boolean,false) then raise exception 'Já existe uma formação com esse par. Confirme se representa outro episódio.' using errcode='22023';end if;
  insert into public.usuario_formacoes(id,user_id,instituicao_id,instituicao_manual,curso_id,curso_manual,cursando_atualmente,origem,posicao)
  values(fid,actor,iid,im,cid,cm,studying,old_origin,position_index)
  on conflict(id) do update set instituicao_id=excluded.instituicao_id,instituicao_manual=excluded.instituicao_manual,curso_id=excluded.curso_id,curso_manual=excluded.curso_manual,
   cursando_atualmente=excluded.cursando_atualmente,posicao=excluded.posicao,updated_at=now() where usuario_formacoes.user_id=actor;
  get diagnostics affected=row_count;
  if affected<>1 then raise exception 'Formação indisponível. Recarregue antes de salvar.' using errcode='40001';end if;
  ids:=array_append(ids,fid);
  position_index:=position_index+1;
 end loop;
 if p_primary is not null and not(p_primary=any(ids)) then raise exception 'A formação principal deve pertencer ao histórico informado.' using errcode='22023';end if;
 update public.profiles set education_primary_id=p_primary,education_revision=education_revision+1 where id=actor;
 delete from public.usuario_formacoes where user_id=actor and not(id=any(ids));
 perform education_private.refresh(actor);
 if p_resolve_legacy then update education_private.legacy set resolved=true where user_id=actor;end if;
end $$;
create function education_private.my_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 select jsonb_build_object('revision',p.education_revision,'primary_id',p.education_primary_id,
 'formations',(select coalesce(jsonb_agg(to_jsonb(f)||jsonb_build_object('institution_name',coalesce(i.nome,f.instituicao_manual),'institution_acronym',i.sigla,'course_name',coalesce(c.nome,f.curso_manual)) order by f.posicao,f.created_at,f.id),'[]') from public.usuario_formacoes f left join public.instituicoes_ensino i on i.id=f.instituicao_id left join public.cursos c on c.id=f.curso_id where f.user_id=actor),
 'legacy',(select original from education_private.legacy where user_id=actor and not resolved)) into result from public.profiles p where p.id=actor;
 return result;
end $$;
create function public.get_my_education() returns jsonb language sql stable security invoker set search_path='' as $$select education_private.my_state()$$;

create function education_private.migrate() returns jsonb language plpgsql security invoker set search_path='' as $$
declare report jsonb; r record;
begin
 perform pg_advisory_xact_lock(hashtextextended('education-initial-migration',0));
 select m.report into report from education_private.migrations m where name='initial';if found then return report;end if;
 for r in select id from public.profiles order by id loop perform education_private.capture(r.id);end loop;
 select jsonb_build_object('migrated_formations',count(*)filter(where migrated_id is not null),'incomplete_preserved',count(*)filter(where migrated_id is null),'errors',0) into report from education_private.legacy;
 insert into education_private.migrations(name,report) values('initial',report);return report;
end $$;

-- Existing profile edits retain their allowed columns, but academic projections are server-owned.
do $$ declare columns text;begin
 if has_table_privilege('authenticated','public.profiles','UPDATE') then
  select string_agg(quote_ident(column_name),',') into columns from information_schema.columns where table_schema='public' and table_name='profiles'
   and column_name not in ('course','course_id','university','institution_id','education_primary_id','education_revision');
  revoke update on public.profiles from authenticated;execute 'grant update('||columns||') on public.profiles to authenticated';
 end if;
 revoke update(course,course_id,university,institution_id,education_primary_id,education_revision) on public.profiles from authenticated;
end $$;
create or replace function public.save_profile_concepts(p_profile jsonb,p_skills jsonb,p_interests jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); s jsonb; i jsonb; previous record;
begin
 select course,course_id,university,institution_id into previous from public.profiles where id=actor;
 if ((p_profile?'course') and nullif(p_profile->>'course','') is distinct from previous.course)
 or ((p_profile?'course_id') and nullif(p_profile->>'course_id','')::uuid is distinct from previous.course_id)
 or ((p_profile?'university') and nullif(p_profile->>'university','') is distinct from previous.university)
 or ((p_profile?'institution_id') and nullif(p_profile->>'institution_id','')::uuid is distinct from previous.institution_id) then
  raise exception 'Atualize a página e utilize Formação acadêmica para alterar instituição e curso.' using errcode='22023';
 end if;
 s:=concept_private.prepare('skill',actor,p_skills);i:=concept_private.prepare('interest',actor,p_interests);
 update public.profiles set full_name=p_profile->>'full_name',bio=nullif(p_profile->>'bio',''),skills=concept_private.labels(s),interests=concept_private.labels(i) where id=actor;
 if not found then raise exception 'Não foi possível salvar o perfil.';end if;
 perform concept_private.apply_choices('skill',actor,s);perform concept_private.apply_choices('interest',actor,i);return actor;
end $$;
create function public.save_profile_with_education(p_profile jsonb,p_skills jsonb,p_interests jsonb,p_formations jsonb,p_primary uuid,p_revision bigint,p_resolve_legacy boolean default false) returns uuid
language plpgsql security invoker set search_path='' as $$
begin
 perform education_private.apply(p_formations,p_primary,p_revision,p_resolve_legacy);
 return public.save_profile_concepts(p_profile-'course'-'course_id'-'university'-'institution_id',p_skills,p_interests);
end $$;
revoke all on all functions in schema education_private from public,anon,authenticated;
grant execute on function education_private.apply(jsonb,uuid,bigint,boolean),education_private.my_state() to authenticated;
revoke all on function public.get_my_education(),public.save_profile_with_education(jsonb,jsonb,jsonb,jsonb,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.get_my_education(),public.save_profile_with_education(jsonb,jsonb,jsonb,jsonb,uuid,bigint,boolean) to authenticated;

-- Atomic initial backfill: retain exact originals and abort on any unrelated change.
do $$
declare before_profiles jsonb; after_profiles jsonb; snapshots jsonb:='{}'; digest text; r record; report jsonb;
begin
 lock table public.profiles in share row exclusive mode;
 select coalesce(jsonb_object_agg(id,to_jsonb(p)),'{}') into before_profiles from public.profiles p;
 for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind='r' and ((n.nspname='public' and c.relname not in ('profiles','usuario_formacoes'))
 or n.nspname in ('institution_private','course_private')) order by n.nspname,c.relname loop
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from %I.%I t',r.nspname,r.relname) into digest;
  snapshots:=snapshots||jsonb_build_object(r.nspname||'.'||r.relname,digest);
 end loop;
 report:=education_private.migrate();
 select coalesce(jsonb_object_agg(id,to_jsonb(p)),'{}') into after_profiles from public.profiles p;
 if (select count(*) from jsonb_each(before_profiles))<>(select count(*) from jsonb_each(after_profiles))
 or exists(select 1 from jsonb_each(before_profiles) b where
  (b.value-'course'-'course_id'-'university'-'institution_id'-'updated_at'-'education_primary_id'-'education_revision')
  is distinct from ((after_profiles->b.key)-'course'-'course_id'-'university'-'institution_id'-'updated_at'-'education_primary_id'-'education_revision')) then
  raise exception 'Academic migration changed unrelated profile data; transaction aborted.';
 end if;
 if exists(select 1 from jsonb_each(before_profiles) b where
  (nullif(trim(b.value->>'course'),'') is not null or b.value->>'course_id' is not null or nullif(trim(b.value->>'university'),'') is not null or b.value->>'institution_id' is not null)
  and not exists(select 1 from education_private.legacy l where l.user_id=b.key::uuid and l.original=jsonb_build_object('course',b.value->'course','course_id',b.value->'course_id','university',b.value->'university','institution_id',b.value->'institution_id'))) then
  raise exception 'An academic original was not preserved; transaction aborted.';
 end if;
 for r in select key,value#>>'{}' expected from jsonb_each(snapshots) loop
  execute format('select md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),'''')) from %I.%I t',split_part(r.key,'.',1),split_part(r.key,'.',2)) into digest;
  if digest is distinct from r.expected then raise exception 'Unrelated data changed in %; transaction aborted.',r.key;end if;
 end loop;
 if coalesce((report->>'errors')::integer,0)<>0 then raise exception 'Academic migration reported errors; transaction aborted.';end if;
end $$;
