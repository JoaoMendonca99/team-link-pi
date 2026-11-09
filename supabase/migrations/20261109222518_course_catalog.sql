create schema course_private;
revoke all on schema course_private from public,anon,authenticated;
grant usage on schema course_private to anon,authenticated;
create function course_private.normalize(value text) returns text
language sql immutable parallel safe set search_path='' as $$
 select btrim(regexp_replace(regexp_replace(lower(normalize(coalesce(value,''),NFD)),U&'[\0300-\036f]','','g'),'[^[:alnum:]]+',' ','g'))
$$;
revoke all on function course_private.normalize(text) from public;
grant execute on function course_private.normalize(text) to anon,authenticated;

create table public.cursos_cine_areas (
 codigo text primary key, nivel smallint not null, nome text not null check(length(btrim(nome)) between 1 and 500),
 pai_codigo text references public.cursos_cine_areas on delete restrict,
 fonte text not null default 'Inep — Cine Brasil', ano_referencia smallint not null,
 check(nivel between 1 and 3 and length(codigo)=nivel+1 and codigo ~ '^[0-9]+$'),
 check((nivel=1 and pai_codigo is null) or (nivel>1 and pai_codigo is not null and length(pai_codigo)=nivel and left(codigo,nivel)=pai_codigo))
);
create index cursos_cine_areas_parent on public.cursos_cine_areas(pai_codigo) where pai_codigo is not null;
create table public.cursos_cine (
 codigo text primary key check(codigo ~ '^[0-9]{4}[A-Z][0-9]{2}$'),
 nome text not null check(length(btrim(nome)) between 1 and 500),
 area_detalhada text not null references public.cursos_cine_areas on delete restrict,
 fonte text not null default 'Inep — Cine Brasil',ano_referencia smallint not null,
 check(length(area_detalhada)=4 and left(codigo,4)=area_detalhada)
);
create index cursos_cine_area on public.cursos_cine(area_detalhada);
create table public.cursos (
 id uuid primary key default gen_random_uuid(), identidade text not null unique check(identidade ~ '^[0-9a-f]{32}$'),
 nome text not null check(length(btrim(nome)) between 1 and 500),
 nome_normalizado text generated always as (course_private.normalize(nome)) stored,
 codigo_cine text references public.cursos_cine on delete restrict,
 grau_academico smallint check(grau_academico between 1 and 4),nivel_academico smallint not null check(nivel_academico in (1,2)),
 origem text not null default 'Inep — Censo da Educação Superior 2024; identidade composta revisada',
 status_validacao text not null default 'validado' check(status_validacao in ('validado','pendente')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique nulls not distinct(nome_normalizado,codigo_cine,grau_academico,nivel_academico)
);
create index cursos_cine_link on public.cursos(codigo_cine) where codigo_cine is not null;
create table public.cursos_aliases (
 id uuid primary key default gen_random_uuid(),curso_id uuid not null references public.cursos on delete restrict,
 nome_alternativo text not null,normalizado text not null,origem text not null,validado boolean not null default false,
 unique(curso_id,normalizado)
);
create index cursos_aliases_search on public.cursos_aliases using gin(normalizado extensions.gin_trgm_ops) where validado;
create index cursos_aliases_prefix on public.cursos_aliases(normalizado text_pattern_ops) where validado;
create table public.cursos_ofertas (
 id uuid primary key default gen_random_uuid(),codigo_inep integer not null unique check(codigo_inep between 1 and 99999999),
 codigo_ies_original integer not null, instituicao_id uuid references public.instituicoes_ensino on delete restrict,
 curso_id uuid references public.cursos on delete restrict,codigo_cine text references public.cursos_cine on delete restrict,
 nome_original text not null,modalidade smallint not null check(modalidade in (1,2)),
 grau_academico smallint check(grau_academico between 1 and 4),nivel_academico smallint not null check(nivel_academico in (1,2)),
 ano_referencia smallint not null,dimensoes smallint[] not null check(cardinality(dimensoes)>0 and dimensoes <@ array[1,2,3,4]::smallint[]),
 fonte text not null default 'Inep — Censo da Educação Superior',
 status_vinculo text generated always as (case when instituicao_id is null then 'instituicao_pendente' else 'vinculado' end) stored,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index cursos_ofertas_institution on public.cursos_ofertas(instituicao_id) where instituicao_id is not null;
create index cursos_ofertas_course on public.cursos_ofertas(curso_id) where curso_id is not null;
create index cursos_ofertas_cine on public.cursos_ofertas(codigo_cine) where codigo_cine is not null;

alter table public.cursos_cine_areas enable row level security;
alter table public.cursos_cine enable row level security;
alter table public.cursos enable row level security;
alter table public.cursos_aliases enable row level security;
alter table public.cursos_ofertas enable row level security;
revoke all on public.cursos_cine_areas,public.cursos_cine,public.cursos,public.cursos_aliases,public.cursos_ofertas from public,anon,authenticated;
-- The signup form can search public official course names before authentication.
-- This grants no access to profiles, email addresses or administrative importers.
grant select on public.cursos_cine_areas,public.cursos_cine,public.cursos,public.cursos_aliases to anon,authenticated;
grant select on public.cursos_ofertas to authenticated;
create policy cursos_areas_read on public.cursos_cine_areas for select to anon,authenticated using(true);
create policy cursos_cine_read on public.cursos_cine for select to anon,authenticated using(true);
create policy cursos_read on public.cursos for select to anon,authenticated using(status_validacao='validado');
create policy cursos_aliases_read on public.cursos_aliases for select to anon,authenticated using(validado);
create policy cursos_ofertas_read on public.cursos_ofertas for select to authenticated using(true);

create function public.search_courses(p_query text,p_limit integer default 12)
returns table(id uuid,nome text,codigo_cine text,grau_academico smallint,nivel_academico smallint,cine_nome text)
language sql stable security invoker set search_path='' as $$
 with q as(select course_private.normalize(left(p_query,120)) term), matches as (
  select a.curso_id,min(case when a.normalizado=q.term then 0 when a.normalizado like q.term||'%' then 1 else 2 end) rank
  from public.cursos_aliases a cross join q where length(q.term)>=2 and a.validado and a.normalizado like '%'||q.term||'%' group by a.curso_id
 ) select c.id,c.nome,c.codigo_cine,c.grau_academico,c.nivel_academico,cl.nome
 from matches m join public.cursos c on c.id=m.curso_id left join public.cursos_cine cl on cl.codigo=c.codigo_cine
 where c.status_validacao='validado' order by m.rank,c.nome,c.grau_academico nulls last,c.codigo_cine,c.id
 limit greatest(1,least(coalesce(p_limit,12),15))
$$;
revoke all on function public.search_courses(text,integer) from public;
grant execute on function public.search_courses(text,integer) to anon,authenticated;

-- Payloads contain only reviewed identification data; no statistical indicators.
create function course_private.import_batch(p_kind text,p_rows jsonb) returns integer
language plpgsql security invoker set search_path='' as $$
declare r jsonb; total integer:=0; course uuid; ies uuid; item jsonb; alias text; signature text; degree smallint; level smallint; cine text; dims smallint[];
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>1000 or p_kind not in ('cine','courses','offers') then raise exception 'Invalid course import batch'; end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if p_kind='cine' then
   insert into public.cursos_cine_areas(codigo,nome,nivel,pai_codigo,ano_referencia) values(r->>2,r->>3,1,null,(r->>8)::smallint)
   on conflict(codigo) do update set nome=excluded.nome,ano_referencia=excluded.ano_referencia where excluded.ano_referencia>=cursos_cine_areas.ano_referencia;
   insert into public.cursos_cine_areas(codigo,nome,nivel,pai_codigo,ano_referencia) values(r->>4,r->>5,2,r->>2,(r->>8)::smallint)
   on conflict(codigo) do update set nome=excluded.nome,pai_codigo=excluded.pai_codigo,ano_referencia=excluded.ano_referencia where excluded.ano_referencia>=cursos_cine_areas.ano_referencia;
   insert into public.cursos_cine_areas(codigo,nome,nivel,pai_codigo,ano_referencia) values(r->>6,r->>7,3,r->>4,(r->>8)::smallint)
   on conflict(codigo) do update set nome=excluded.nome,pai_codigo=excluded.pai_codigo,ano_referencia=excluded.ano_referencia where excluded.ano_referencia>=cursos_cine_areas.ano_referencia;
   insert into public.cursos_cine(codigo,nome,area_detalhada,ano_referencia) values(r->>0,r->>1,r->>6,(r->>8)::smallint)
   on conflict(codigo) do update set nome=excluded.nome,area_detalhada=excluded.area_detalhada,ano_referencia=excluded.ano_referencia where excluded.ano_referencia>=cursos_cine.ano_referencia;
  elsif p_kind='courses' then
   degree:=(r->>3)::smallint; level:=(r->>4)::smallint; cine:=r->>2;
   signature:=md5(course_private.normalize(r->>1)||chr(31)||coalesce(cine,'')||chr(31)||coalesce(degree::text,'')||chr(31)||level::text);
   if signature is distinct from r->>0 then raise exception 'Course identity mismatch'; end if;
   insert into public.cursos(identidade,nome,codigo_cine,grau_academico,nivel_academico) values(signature,r->>1,cine,degree,level)
   on conflict(identidade) do nothing;
   select id into strict course from public.cursos where identidade=signature;
   for item in select value from jsonb_array_elements(r->5) loop
    alias:=item#>>'{}';
    insert into public.cursos_aliases(curso_id,nome_alternativo,normalizado,origem,validado)
     values(course,alias,course_private.normalize(alias),case when course_private.normalize(alias)='eng de computacao' and cine='0714E04' and degree=1 and level=1 then 'curadoria:0714E04:2024' else 'inep:2024' end,true)
     on conflict(curso_id,normalizado) do nothing;
   end loop;
  else
   select id into strict course from public.cursos where identidade=r->>2;
   if not exists(select 1 from public.cursos c where c.id=course and c.codigo_cine is not distinct from r->>3 and c.grau_academico is not distinct from (r->>5)::smallint and c.nivel_academico=(r->>6)::smallint) then raise exception 'Offer/course classification mismatch'; end if;
   select id into ies from public.instituicoes_ensino where codigo_inep=(r->>1)::integer;
   select array_agg(v::smallint order by v::smallint) into dims from jsonb_array_elements_text(r->8) v;
   insert into public.cursos_ofertas as target(codigo_inep,codigo_ies_original,instituicao_id,curso_id,codigo_cine,modalidade,grau_academico,nivel_academico,ano_referencia,dimensoes,nome_original)
    values((r->>0)::integer,(r->>1)::integer,ies,course,r->>3,(r->>4)::smallint,(r->>5)::smallint,(r->>6)::smallint,(r->>7)::smallint,dims,r->>9)
    on conflict(codigo_inep) do update set codigo_ies_original=excluded.codigo_ies_original,instituicao_id=excluded.instituicao_id,curso_id=excluded.curso_id,codigo_cine=excluded.codigo_cine,modalidade=excluded.modalidade,
     grau_academico=excluded.grau_academico,nivel_academico=excluded.nivel_academico,ano_referencia=excluded.ano_referencia,dimensoes=excluded.dimensoes,nome_original=excluded.nome_original,updated_at=now()
    where excluded.ano_referencia>=target.ano_referencia and
     row(target.codigo_ies_original,target.instituicao_id,target.curso_id,target.codigo_cine,target.modalidade,target.grau_academico,target.nivel_academico,target.ano_referencia,target.dimensoes,target.nome_original)
     is distinct from row(excluded.codigo_ies_original,excluded.instituicao_id,excluded.curso_id,excluded.codigo_cine,excluded.modalidade,excluded.grau_academico,excluded.nivel_academico,excluded.ano_referencia,excluded.dimensoes,excluded.nome_original);
  end if;
  total:=total+1;
 end loop;
 return total;
end $$;
revoke all on function course_private.import_batch(text,jsonb) from public,anon,authenticated;
