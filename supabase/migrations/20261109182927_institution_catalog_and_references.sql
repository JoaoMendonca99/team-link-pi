create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create schema institution_private;
revoke all on schema institution_private from public,anon,authenticated;
grant usage on schema institution_private to authenticated;

-- Unicode normalization changes only the search key, never the official name.
create function institution_private.normalize(value text) returns text
language sql immutable parallel safe set search_path='' as $$
 select btrim(regexp_replace(regexp_replace(lower(normalize(coalesce(value,''),NFD)),U&'[\0300-\036f]','','g'),'[^[:alnum:]]+',' ','g'))
$$;
revoke all on function institution_private.normalize(text) from public,anon;
grant execute on function institution_private.normalize(text) to authenticated;

create table public.instituicoes_ensino (
 id uuid primary key default gen_random_uuid(), codigo_inep integer not null unique check(codigo_inep between 1 and 99999999),
 nome text not null check(length(btrim(nome)) between 1 and 500), sigla text, municipio text, codigo_municipio integer,
 uf text not null check(uf in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
 tipo_organizacao smallint not null check(tipo_organizacao between 1 and 5),
 categoria_administrativa smallint not null check(categoria_administrativa between 1 and 9), rede smallint not null check(rede in (1,2)),
 ano_referencia smallint not null check(ano_referencia between 1900 and 2200),
 fonte text not null default 'Inep — Censo da Educação Superior',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table public.instituicoes_aliases (
 id uuid primary key default gen_random_uuid(), instituicao_id uuid not null references public.instituicoes_ensino on delete restrict,
 nome_alternativo text not null, normalizado text not null, origem text not null, validado boolean not null default false,
 unique(instituicao_id,normalizado,origem)
);
create index instituicoes_aliases_search on public.instituicoes_aliases using gin(normalizado extensions.gin_trgm_ops) where validado;
create index instituicoes_aliases_prefix on public.instituicoes_aliases(normalizado text_pattern_ops) where validado;
create index instituicoes_nome_search on public.instituicoes_ensino using gin(nome extensions.gin_trgm_ops);
alter table public.instituicoes_ensino enable row level security;
alter table public.instituicoes_aliases enable row level security;
revoke all on public.instituicoes_ensino,public.instituicoes_aliases from public,anon,authenticated;
grant select on public.instituicoes_ensino,public.instituicoes_aliases to authenticated;
create policy instituicoes_read on public.instituicoes_ensino for select to authenticated using(true);
create policy instituicoes_aliases_read on public.instituicoes_aliases for select to authenticated using(validado);

create function public.search_institutions(p_query text,p_limit integer default 12)
returns table(id uuid,codigo_inep integer,nome text,sigla text,municipio text,uf text)
language sql stable security invoker set search_path='' as $$
 with q as(select institution_private.normalize(left(p_query,120)) term), matched as (
  select a.instituicao_id,min(case when a.normalizado=q.term then 0 when a.normalizado like q.term||'%' then 1 else 2 end) rank
  from public.instituicoes_aliases a cross join q
  where length(q.term)>=2 and a.validado and a.normalizado like '%'||q.term||'%'
  group by a.instituicao_id
 ) select i.id,i.codigo_inep,i.nome,i.sigla,i.municipio,i.uf from matched m join public.instituicoes_ensino i on i.id=m.instituicao_id
 order by m.rank,i.nome,i.uf,i.codigo_inep limit greatest(1,least(coalesce(p_limit,12),15))
$$;
revoke all on function public.search_institutions(text,integer) from public,anon;
grant execute on function public.search_institutions(text,integer) to authenticated;

-- Administrative import only. Conflict keys are official codes, not names/siglas.
create function institution_private.import_batch(p_rows jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare r record; institution uuid; alias text; total integer:=0;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>200 then raise exception 'Invalid import batch'; end if;
 for r in select * from jsonb_to_recordset(p_rows) x(codigo_inep integer,nome text,sigla text,municipio text,codigo_municipio integer,uf text,tipo_organizacao smallint,categoria_administrativa smallint,rede smallint,ano_referencia smallint) loop
  insert into public.instituicoes_ensino as target(codigo_inep,nome,sigla,municipio,codigo_municipio,uf,tipo_organizacao,categoria_administrativa,rede,ano_referencia)
  values(r.codigo_inep,r.nome,nullif(btrim(r.sigla),''),r.municipio,r.codigo_municipio,r.uf,r.tipo_organizacao,r.categoria_administrativa,r.rede,r.ano_referencia)
  on conflict(codigo_inep) do update set nome=excluded.nome,sigla=excluded.sigla,municipio=excluded.municipio,codigo_municipio=excluded.codigo_municipio,
   uf=excluded.uf,tipo_organizacao=excluded.tipo_organizacao,categoria_administrativa=excluded.categoria_administrativa,rede=excluded.rede,ano_referencia=excluded.ano_referencia,updated_at=now()
  where excluded.ano_referencia>=target.ano_referencia and
   row(target.nome,target.sigla,target.municipio,target.codigo_municipio,target.uf,target.tipo_organizacao,target.categoria_administrativa,target.rede,target.ano_referencia)
   is distinct from row(excluded.nome,excluded.sigla,excluded.municipio,excluded.codigo_municipio,excluded.uf,excluded.tipo_organizacao,excluded.categoria_administrativa,excluded.rede,excluded.ano_referencia);
  select id into institution from public.instituicoes_ensino where codigo_inep=r.codigo_inep;
  -- Aliases are sourced solely from official fields; no fuzzy equivalences.
  foreach alias in array array[r.nome,r.sigla,case when nullif(btrim(r.sigla),'') is not null then r.nome||' ('||r.sigla||')' end] loop
   if nullif(btrim(alias),'') is not null then
    insert into public.instituicoes_aliases(instituicao_id,nome_alternativo,normalizado,origem,validado)
    values(institution,btrim(alias),institution_private.normalize(alias),'inep:'||r.ano_referencia,true) on conflict do nothing;
   end if;
  end loop;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function institution_private.import_batch(jsonb) from public,anon,authenticated;

alter table public.profiles add column institution_id uuid references public.instituicoes_ensino on delete restrict;
alter table public.profiles drop constraint profiles_university_check,
 add constraint profiles_university_check check(char_length(university)<=500);
grant select(institution_id),update(institution_id) on public.profiles to authenticated;
grant select(institution_id) on public.profiles to anon;
create index profiles_institution on public.profiles(institution_id) where institution_id is not null;
alter table public.projects add column academic_institution_id uuid references public.instituicoes_ensino on delete restrict;
create index projects_institution on public.projects(academic_institution_id) where academic_institution_id is not null;

create function institution_private.profile_reference() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.institution_id is not null then
  select nome into strict new.university from public.instituicoes_ensino where id=new.institution_id;
 else new.university:=nullif(btrim(new.university),''); end if;
 return new;
end $$;
create trigger profile_institution_reference before insert or update of institution_id,university on public.profiles for each row execute function institution_private.profile_reference();
create function institution_private.project_reference() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.academic_institution_id is not null then
  select nome into strict new.academic_institution from public.instituicoes_ensino where id=new.academic_institution_id;
 end if;
 return new;
end $$;
create trigger academic_institution_reference before insert or update of academic_institution_id,academic_institution on public.projects for each row execute function institution_private.project_reference();
revoke all on function institution_private.profile_reference(),institution_private.project_reference() from public,anon,authenticated;

create or replace function public.get_project_academics(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.projects; begin
 select * into p from public.projects where id=p_project;
 if auth.uid() is null or p.id is null or not (p.owner_id=auth.uid() or public.is_project_join_manager(p_project) or
 exists(select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active')) then
 raise exception 'Acesso indisponível.'; end if;
 return jsonb_build_object('context',p.project_context,'revision',p.academic_revision,
 'defaults',jsonb_build_object('institution_id',p.academic_institution_id,'institution',coalesce(p.academic_institution,''),'course',coalesce(p.academic_course,''),'city',coalesce(p.academic_city,'')),
 'periods',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('task_count',(select count(*) from public.activity_tasks where period_id=r.id),'goal_count',(select count(*) from public.activity_goals where period_id=r.id)) order by r.is_active desc,r.created_at desc,r.id) from public.activity_periods r where r.project_id=p_project),'[]'::jsonb));
end $$;

-- Trigger covers direct project writes too; an old revision can never mask a change.
create or replace function academic_private.project_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.project_context,new.academic_institution_id,new.academic_institution,new.academic_course,new.academic_city) is distinct from
    row(old.project_context,old.academic_institution_id,old.academic_institution,old.academic_course,old.academic_city) then
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
 academic_course=nullif(btrim(p_defaults->>'course'),''),academic_city=nullif(btrim(p_defaults->>'city'),'') where id=p_project;
 for entry in select value from jsonb_array_elements(p_periods) loop
   if nullif(entry->>'id','') is null and exists(select 1 from public.activity_periods where project_id=p_project) then raise exception 'Utilize os períodos existentes. Crie novos em Gerenciar períodos.'; end if;
   -- Setup must preserve active period, even if a client sends an activation flag.
   perform academic_private.write_period(p_project,(entry-'activate')||jsonb_build_object('activate',false));
 end loop;
 insert into public.activity_updates(project_id) values(p_project) on conflict(project_id) do update set changed_at=clock_timestamp();
 return public.get_project_academics(p_project);
end $$;

