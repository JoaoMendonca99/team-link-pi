-- External identifiers complement the existing catalog; reviewed internal UUIDs remain stable.
create table public.conceitos_fontes (
 identificador text primary key, conceito_id uuid not null references public.conceitos(id),
 fonte text not null, versao text not null, licenca text not null, rotulo_original text not null,
 retrieved_at timestamptz not null default now()
);
create index conceitos_fontes_conceito on public.conceitos_fontes(conceito_id);
alter table public.conceitos_fontes enable row level security;
revoke all on public.conceitos_fontes from public,anon,authenticated;
grant select on public.conceitos_fontes to anon,authenticated;
create policy concept_sources_read on public.conceitos_fontes for select to anon,authenticated using(true);

alter table public.conceitos_relacoes drop constraint conceitos_relacoes_tipo_check,drop constraint conceitos_relacoes_check;
alter table public.conceitos_relacoes add constraint conceitos_relacoes_tipo_check check(tipo in ('relacionado_a','mais_especifico_que')),
 add constraint conceitos_relacoes_direction check(origem_id<>destino_id and (tipo<>'relacionado_a' or origem_id<destino_id));
create function concept_private.check_hierarchy() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.tipo='mais_especifico_que' then
  perform pg_advisory_xact_lock(hashtextextended('concept-hierarchy',0));
  if exists(with recursive ancestors(id) as (
   select new.destino_id union select r.destino_id from public.conceitos_relacoes r join ancestors a on a.id=r.origem_id
   where r.tipo='mais_especifico_que' and not(tg_op='UPDATE' and r.origem_id=old.origem_id and r.destino_id=old.destino_id and r.tipo=old.tipo)
  ) select 1 from ancestors where id=new.origem_id) then raise exception 'Relação hierárquica cíclica não permitida.' using errcode='23514'; end if;
 end if;
 return new;
end $$;
create trigger concept_hierarchy_guard before insert or update on public.conceitos_relacoes for each row execute function concept_private.check_hierarchy();

create function concept_private.import_enrichment(p_rows jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r jsonb; a jsonb; cid uuid; previous uuid; added integer:=0; reused integer:=0;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>100 then raise exception 'Importação requer lote revisado de até 100 conceitos.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('concept-enrichment',0));
 for r in select * from jsonb_array_elements(p_rows) loop
  if not coalesce((r->>'reviewed')::boolean,false) or r->>'license'<>'CC BY 4.0' or r->>'external_id' !~ '^http://data[.]europa[.]eu/esco/skill/[0-9a-f-]{36}$' then raise exception 'Fonte não revisada ou identificador inválido.'; end if;
  cid:=null;
  select conceito_id into cid from public.conceitos_fontes where identificador=r->>'external_id';
  if cid is null and nullif(r->>'target_key','') is not null then
   select id into cid from public.conceitos where source_key=r->>'target_key' and status='validado' and consolidado_em is null;
   if cid is null then raise exception 'Equivalência revisada aponta para identidade indisponível.'; end if;
  end if;
  if cid is null then
   select id into cid from public.conceitos where source_key=r->>'key';
   if cid is null then
    if exists(select 1 from public.conceitos where nome_normalizado=concept_private.key(r->>'name') and status<>'inativo') then raise exception 'Homônimo exige revisão explícita: %',r->>'name'; end if;
    insert into public.conceitos(source_key,nome,descricao,dominio,status,origem)
    values(r->>'key',r->>'name',r->>'description',r->>'domain','validado',r->>'source') returning id into cid;
    added:=added+1;
   else reused:=reused+1; end if;
  else reused:=reused+1; end if;
  -- A historical source mapping follows a reviewed redirect without changing the original UUID.
  select consolidado_em into previous from public.conceitos where id=cid;
  if previous is not null then cid:=previous; end if;
  insert into public.conceitos_fontes(identificador,conceito_id,fonte,versao,licenca,rotulo_original)
  values(r->>'external_id',cid,'ESCO / Comissão Europeia',r->>'version',r->>'license',r->>'source_label') on conflict(identificador) do nothing;
  -- Preserve existing reviewed names, domains, descriptions, validation state and timestamps.
  insert into public.conceitos_aliases(conceito_id,nome,origem,validado,exige_confirmacao)
  values(cid,r->>'name',r->>'source',true,false) on conflict(conceito_id,chave) do nothing;
  for a in select * from jsonb_array_elements(coalesce(r->'aliases','[]')) loop
   insert into public.conceitos_aliases(conceito_id,nome,origem,validado,exige_confirmacao)
   values(cid,a->>'name',r->>'source',true,coalesce((a->>'confirm')::boolean,false)) on conflict(conceito_id,chave) do nothing;
  end loop;
 end loop;
 return jsonb_build_object('added',added,'reused',reused);
end $$;
create function concept_private.import_source_relations(p_rows jsonb) returns integer language plpgsql security invoker set search_path='' as $$
declare r jsonb; child uuid; parent uuid; inserted integer:=0; n integer;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>200 then raise exception 'Lote de relações inválido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('concept-hierarchy',0));
 for r in select * from jsonb_array_elements(p_rows) loop
  if r->>'type'<>'mais_especifico_que' or r->>'source_relation'<>'broaderSkill' then raise exception 'Semântica de origem não suportada.'; end if;
  select conceito_id into strict child from public.conceitos_fontes where identificador=r->>'source';
  select conceito_id into strict parent from public.conceitos_fontes where identificador=r->>'parent';
  if child=parent then raise exception 'Identidades equivalentes não podem ser pai e filho.'; end if;
  insert into public.conceitos_relacoes(origem_id,destino_id,tipo,fonte,validado)
  values(child,parent,'mais_especifico_que','ESCO v1.2.0 · broaderSkill · '||(r->>'source')||' → '||(r->>'parent'),true)
  on conflict(origem_id,destino_id,tipo) do nothing;
  get diagnostics n=row_count;inserted:=inserted+n;
 end loop;
 return inserted;
end $$;

-- The obsolete domain parameter stays for compatibility; classification is server-owned.
create or replace function concept_private.propose(p_name text,p_domain text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); label text:=trim(regexp_replace(p_name,'[[:space:]]+',' ','g')); cid uuid;
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501'; end if;
 if label is null or length(label) not between 1 and 120 or label !~ '[[:alnum:]À-ÿ]' or label ~ '[[:cntrl:]<>@]' or label ~* '(https?://|www[.])' then
  raise exception 'Informe um conceito válido de até 120 caracteres.' using errcode='22023';
 end if;
 cid:=concept_private.resolve_exact(label);if cid is not null then return cid;end if;
 perform pg_advisory_xact_lock(hashtextextended('concept-proposal:'||actor::text,0));
 select case when count(*)=1 then min(id::text)::uuid end into cid from concept_private.propostas where autor=actor and chave=concept_private.key(label);
 if cid is not null then return cid; end if;
 if exists(select 1 from public.conceitos_aliases a join public.conceitos c on c.id=a.conceito_id where a.chave=concept_private.key(label) and c.status<>'inativo') then
  raise exception 'Já existem conceitos com esse nome. Selecione o significado desejado nos resultados.' using errcode='22023';
 end if;
 if (select count(*) from concept_private.propostas where autor=actor and created_at>now()-interval '1 minute')>=40
 or (select count(*) from concept_private.propostas where autor=actor and created_at>now()-interval '1 day')>=100
 or (select count(*) from concept_private.propostas p join public.conceitos c on c.id=p.id where p.autor=actor and c.status='provisorio')>=200 then
  raise exception 'Limite de novas sugestões atingido. Tente novamente mais tarde.' using errcode='P0001';
 end if;
 insert into public.conceitos(nome,dominio,status,origem) values(label,'Geral','provisorio','Sugestão de usuário; classificação pendente') returning id into cid;
 insert into public.conceitos_aliases(conceito_id,nome,origem) values(cid,label,'Sugestão de usuário');
 insert into concept_private.propostas(id,autor,chave,dominio) values(cid,actor,concept_private.key(label),'Geral');
 return cid;
end $$;

create or replace function public.search_concepts(p_query text,p_limit integer default 12)
returns table(id uuid,nome text,dominio text,status text,descricao text,alias text,confirmacao boolean)
language sql stable security invoker set search_path='' as $$
 with q as (select concept_private.search_key(left(trim(p_query),120)) v), hits as (
 select distinct on (c.id) c.id,c.nome,c.dominio,c.status,c.descricao,a.nome alias,a.exige_confirmacao confirmacao,
 case when a.chave=concept_private.key(left(p_query,120)) then 0 when a.pesquisa like q.v||'%' then 1 else 2 end rank
 from public.conceitos c join public.conceitos_aliases a on a.conceito_id=c.id cross join q
 where c.status<>'inativo' and length(q.v)>0 and a.pesquisa like '%'||q.v||'%'
 order by c.id,rank,a.validado desc,a.nome
 ) select id,nome,dominio,status,descricao,alias,confirmacao from hits order by status='validado' desc,rank,nome,id
 limit greatest(1,least(coalesce(p_limit,12),20))
$$;
revoke all on function concept_private.check_hierarchy(),concept_private.import_enrichment(jsonb),concept_private.import_source_relations(jsonb) from public,anon,authenticated;

-- Preserve directed source relations during future reviewed consolidations.
create or replace function concept_private.consolidate(p_source uuid,p_target uuid,p_note text) returns void
language plpgsql security invoker set search_path='' as $$
declare s public.conceitos; t public.conceitos; r record; relations public.conceitos_relacoes[];
begin
 if p_source=p_target or length(trim(coalesce(p_note,'')))<12 then raise exception 'Informe identidades distintas e justificativa revisada.'; end if;
 -- Deterministic catalog lock order also prevents concurrent redirect cycles.
 perform 1 from public.conceitos where id in(p_source,p_target) order by id for update;
 select * into strict s from public.conceitos where id=p_source; select * into strict t from public.conceitos where id=p_target;
 if s.consolidado_em=p_target then return; end if;
 if s.consolidado_em is not null or t.consolidado_em is not null or t.status<>'validado'
 or (s.dominio<>t.dominio and not(s.status='provisorio' and s.dominio='Geral')) then raise exception 'Identidades ou domínios incompatíveis.'; end if;
 insert into concept_private.revisoes(conceito_id,destino_id,acao,nota,anterior)
 values(p_source,p_target,'consolidate',p_note,jsonb_build_object('concept',to_jsonb(s),
 'aliases',(select jsonb_agg(to_jsonb(a)) from public.conceitos_aliases a where conceito_id=p_source),
 'references',(select jsonb_agg(to_jsonb(v)) from public.conceitos_vinculos v where conceito_id=p_source)));
 -- Keep source aliases for traceability, add copies pointing to the active identity. Inactive source is excluded from exact resolution.
 insert into public.conceitos_aliases(conceito_id,nome,origem,validado,exige_confirmacao)
 select p_target,nome,'Consolidação revisada: '||origem,true,exige_confirmacao from public.conceitos_aliases where conceito_id=p_source
 on conflict(conceito_id,chave) do nothing;
 delete from public.conceitos_vinculos v where v.conceito_id=p_source and exists(
  select 1 from public.conceitos_vinculos other where other.tipo=v.tipo and other.target_id=v.target_id and other.conceito_id=p_target);
 update public.conceitos_vinculos set conceito_id=p_target where conceito_id=p_source;
 update public.project_required_skills set conceito_id=p_target where conceito_id=p_source;
 update public.conceitos_fontes set conceito_id=p_target where conceito_id=p_source;
 select array_agg(x) into relations from public.conceitos_relacoes x where origem_id=p_source or destino_id=p_source;
 delete from public.conceitos_relacoes where origem_id=p_source or destino_id=p_source;
 for r in select * from unnest(relations) loop
  if r.origem_id<>p_target and r.destino_id<>p_target then
   insert into public.conceitos_relacoes(origem_id,destino_id,tipo,fonte,validado)
   values(case when r.tipo='relacionado_a' then least(case when r.origem_id=p_source then p_target else r.origem_id end,case when r.destino_id=p_source then p_target else r.destino_id end) else case when r.origem_id=p_source then p_target else r.origem_id end end,case when r.tipo='relacionado_a' then greatest(case when r.origem_id=p_source then p_target else r.origem_id end,case when r.destino_id=p_source then p_target else r.destino_id end) else case when r.destino_id=p_source then p_target else r.destino_id end end,r.tipo,r.fonte,r.validado) on conflict do nothing;
  end if;
 end loop;
 delete from public.conceitos_relacoes where origem_id=p_source or destino_id=p_source;
 -- Retarget earlier historical IDs directly, without chains or cycles.
 update public.conceitos set consolidado_em=p_target,updated_at=now() where consolidado_em=p_source;
 update public.conceitos set status='inativo',consolidado_em=p_target,updated_at=now() where id=p_source;
 perform concept_private.refresh_caches(p_target);
end $$;
