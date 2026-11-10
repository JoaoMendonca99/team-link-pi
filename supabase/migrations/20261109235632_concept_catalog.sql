-- Shared vocabulary. No account data is exposed by catalog searches.
create schema if not exists concept_private;
revoke all on schema concept_private from public, anon, authenticated;
grant usage on schema concept_private to anon, authenticated;
alter default privileges in schema concept_private revoke execute on functions from public;

create function concept_private.key(p_text text) returns text
language sql immutable strict set search_path = '' as $$
 select trim(regexp_replace(translate(lower(p_text),
 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ','aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9+#.]+', ' ', 'g'))
$$;
create function concept_private.search_key(p_text text) returns text
language sql immutable strict set search_path = '' as $$
 select trim(regexp_replace(replace(concept_private.key(p_text),'.',' '),' +',' ','g'))
$$;

create table public.conceitos (
 id uuid primary key default gen_random_uuid(), source_key text unique,
 nome text not null check(length(nome) between 1 and 120),
 nome_normalizado text generated always as (concept_private.key(nome)) stored,
 descricao text check(length(descricao)<=400), dominio text not null check(length(dominio) between 1 and 80),
 status text not null check(status in ('validado','provisorio','inativo')),
 origem text not null, consolidado_em uuid references public.conceitos(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(consolidado_em is null or (consolidado_em<>id and status='inativo'))
);
create table public.conceitos_aliases (
 id uuid primary key default gen_random_uuid(), conceito_id uuid not null references public.conceitos(id),
 nome text not null check(length(nome) between 1 and 120),
 chave text generated always as (concept_private.key(nome)) stored,
 pesquisa text generated always as (concept_private.search_key(nome)) stored,
 origem text not null, validado boolean not null default false,
 exige_confirmacao boolean not null default false, created_at timestamptz not null default now(),
 unique(conceito_id,chave)
);
create index conceitos_aliases_chave on public.conceitos_aliases(chave);
create index conceitos_aliases_prefix on public.conceitos_aliases(pesquisa text_pattern_ops);
-- pg_trgm is already installed by the academic catalogs; reuse it for bounded infix searches.
create index conceitos_aliases_search on public.conceitos_aliases using gin(pesquisa extensions.gin_trgm_ops);
create index conceitos_estado on public.conceitos(status,dominio);
create table public.conceitos_relacoes (
 origem_id uuid not null references public.conceitos(id), destino_id uuid not null references public.conceitos(id),
 tipo text not null default 'relacionado_a' check(tipo='relacionado_a'),
 fonte text not null, validado boolean not null default false, created_at timestamptz not null default now(),
 primary key(origem_id,destino_id,tipo), check(origem_id<destino_id)
);
create index conceitos_relacoes_destino on public.conceitos_relacoes(destino_id);
create table concept_private.propostas (
 id uuid primary key references public.conceitos(id), autor uuid not null references auth.users(id) on delete cascade,
 chave text not null, dominio text not null, created_at timestamptz not null default now(),
 unique(autor,chave,dominio)
);
create index propostas_quota on concept_private.propostas(autor,created_at);
create table concept_private.revisoes (
 id bigint generated always as identity primary key, conceito_id uuid not null references public.conceitos(id),
 destino_id uuid references public.conceitos(id), acao text not null, nota text not null,
 anterior jsonb not null, created_at timestamptz not null default now()
);
alter table public.conceitos enable row level security;
alter table public.conceitos_aliases enable row level security;
alter table public.conceitos_relacoes enable row level security;
alter table concept_private.propostas enable row level security;
alter table concept_private.revisoes enable row level security;
revoke all on public.conceitos,public.conceitos_aliases,public.conceitos_relacoes from anon,authenticated;
revoke all on concept_private.propostas,concept_private.revisoes from public,anon,authenticated;
grant select on public.conceitos,public.conceitos_aliases,public.conceitos_relacoes to anon,authenticated;
create policy conceitos_catalogo on public.conceitos for select to anon,authenticated using (true);
create policy conceitos_aliases_catalogo on public.conceitos_aliases for select to anon,authenticated using (true);
create policy conceitos_relacoes_catalogo on public.conceitos_relacoes for select to anon,authenticated using (validado);

create function public.search_concepts(p_query text,p_limit integer default 12)
returns table(id uuid,nome text,dominio text,status text,descricao text,alias text,confirmacao boolean)
language sql stable security invoker set search_path='' as $$
 with q as (select concept_private.search_key(left(trim(p_query),120)) v), hits as (
 select distinct on (c.id) c.id,c.nome,c.dominio,c.status,c.descricao,a.nome alias,a.exige_confirmacao confirmacao,
 case when a.chave=concept_private.key(left(p_query,120)) then 0 when a.pesquisa like q.v||'%' then 1 else 2 end rank
 from public.conceitos c join public.conceitos_aliases a on a.conceito_id=c.id cross join q
 where c.status<>'inativo' and length(q.v)>0 and a.pesquisa like '%'||q.v||'%'
 order by c.id,rank,a.validado desc,a.nome
 ) select id,nome,dominio,status,descricao,alias,confirmacao from hits order by rank,status='validado' desc,nome,id
 limit greatest(1,least(coalesce(p_limit,12),20))
$$;

-- Owner-only import. A reviewed source key, not spelling, determines seed identity.
create function concept_private.import_seed(p_rows jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb; a jsonb; cid uuid;
begin
 for r in select * from jsonb_array_elements(p_rows) loop
  insert into public.conceitos(source_key,nome,descricao,dominio,status,origem)
  values(r->>'key',r->>'name',r->>'description',r->>'domain',r->>'status',r->>'source')
  on conflict(source_key) do nothing returning id into cid;
  if cid is null then select id into cid from public.conceitos where source_key=r->>'key'; end if;
  for a in select * from jsonb_array_elements(jsonb_build_array(jsonb_build_object('name',r->>'name','confirm',r->'confirm'))||coalesce(r->'aliases','[]')) loop
   insert into public.conceitos_aliases(conceito_id,nome,origem,validado,exige_confirmacao)
   values(cid,a->>'name',coalesce(a->>'source',r->>'source'),r->>'status'='validado',coalesce((a->>'confirm')::boolean,false))
   on conflict(conceito_id,chave) do nothing;
  end loop;
 end loop;
end $$;
create function concept_private.resolve_exact(p_text text) returns uuid
language sql stable security invoker set search_path='' as $$
 select case when count(distinct c.id)=1 and not bool_or(a.exige_confirmacao) then min(c.id::text)::uuid end
 from public.conceitos_aliases a join public.conceitos c on c.id=a.conceito_id
 where a.chave=concept_private.key(p_text) and a.validado and c.status='validado'
$$;
create function concept_private.propose(p_name text,p_domain text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); label text:=trim(regexp_replace(p_name,'[[:space:]]+',' ','g')); cid uuid; dom text:=trim(p_domain);
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501'; end if;
 if label is null or length(label) not between 1 and 120 or label !~ '[[:alnum:]]' or label ~ '[[:cntrl:]<>@]' or label ~* '(https?://|www\.)'
 or dom not in ('Tecnologia','Engenharia','Educação','Saúde','Administração','Comunicação','Ciências','Artes','Design','Negócios','Meio ambiente','Geral') or dom is null then
  raise exception 'Informe um conceito válido de até 120 caracteres e um domínio.' using errcode='22023';
 end if;
 cid:=concept_private.resolve_exact(label);
 if cid is not null and exists(select 1 from public.conceitos where id=cid and dominio=dom) then return cid; end if;
 perform pg_advisory_xact_lock(hashtextextended('concept-proposal:'||actor::text,0));
 select id into cid from concept_private.propostas where autor=actor and chave=concept_private.key(label) and dominio=dom;
 if cid is not null then return cid; end if;
 if (select count(*) from concept_private.propostas where autor=actor and created_at>now()-interval '1 minute')>=40
 or (select count(*) from concept_private.propostas where autor=actor and created_at>now()-interval '1 day')>=100
 or (select count(*) from concept_private.propostas p join public.conceitos c on c.id=p.id where p.autor=actor and c.status='provisorio')>=200 then
  raise exception 'Limite de novas sugestões atingido. Tente novamente mais tarde.' using errcode='P0001';
 end if;
 insert into public.conceitos(nome,dominio,status,origem) values(label,dom,'provisorio','Sugestão de usuário') returning id into cid;
 insert into public.conceitos_aliases(conceito_id,nome,origem) values(cid,label,'Sugestão de usuário');
 insert into concept_private.propostas(id,autor,chave,dominio) values(cid,actor,concept_private.key(label),dom);
 return cid;
end $$;
-- Default privileges can differ between projects: explicitly close every new routine.
revoke all on all functions in schema concept_private from public,anon,authenticated;
grant execute on function concept_private.key(text),concept_private.search_key(text) to anon,authenticated;
grant execute on function concept_private.propose(text,text) to authenticated;
revoke all on function public.search_concepts(text,integer) from public,anon,authenticated;
grant execute on function public.search_concepts(text,integer) to anon,authenticated;
