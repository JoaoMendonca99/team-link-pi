lock table public.usuario_formacoes in share row exclusive mode;
select set_config('team_link.p35_education_hash',(select md5(coalesce(jsonb_agg(to_jsonb(f) order by id),'[]')::text) from public.usuario_formacoes f),true);
-- Month precision: day 01 is a storage convention, never a declared day.
alter table public.usuario_formacoes
 add column inicio_mes date,add column previsao_conclusao_mes date,add column termino_mes date,
 add column situacao_final text check(situacao_final in ('concluido','interrompido')),
 add column situacao text generated always as(case when cursando_atualmente=true then 'cursando' when cursando_atualmente=false then coalesce(situacao_final,'nao_informada') else 'nao_informada' end) stored,
 add constraint education_start_month check(inicio_mes is null or (extract(day from inicio_mes)=1 and extract(year from inicio_mes) between 1 and 9999)),
 add constraint education_expected_month check(previsao_conclusao_mes is null or (extract(day from previsao_conclusao_mes)=1 and extract(year from previsao_conclusao_mes) between 1 and 9999)),
 add constraint education_end_month check(termino_mes is null or (extract(day from termino_mes)=1 and extract(year from termino_mes) between 1 and 9999)),
 add constraint education_month_order check(inicio_mes is null or ((previsao_conclusao_mes is null or previsao_conclusao_mes>=inicio_mes) and (termino_mes is null or termino_mes>=inicio_mes))),
 add constraint education_unknown_ending check(cursando_atualmente is not null or situacao_final is null);
comment on column public.usuario_formacoes.inicio_mes is 'Month precision; day 01 is technical, not user supplied.';
comment on column public.usuario_formacoes.previsao_conclusao_mes is 'Forecast kept separately, including outdated forecasts; never confirms graduation.';
comment on column public.usuario_formacoes.situacao_final is 'Explicit end declaration, retained if temporarily/currently studying; situacao is authoritative for display.';
create function education_private.month_value(p_value text) returns date language plpgsql immutable security invoker set search_path='' as $$
begin
 if p_value is null or p_value='' then return null;end if;
 if p_value !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or left(p_value,4)='0000' then raise exception 'Informe mês e ano válidos.' using errcode='22023';end if;
 return (p_value||'-01')::date;
end $$;
revoke all on function education_private.month_value(text) from public,anon,authenticated;
create or replace function education_private.apply(p_values jsonb,p_primary uuid,p_revision bigint,p_resolve_legacy boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); current_revision bigint; r jsonb; fid uuid; previous public.usuario_formacoes; ids uuid[]:='{}'; iid uuid; cid uuid; im text; cm text; studying boolean; old_origin text; affected integer; position_index integer:=0; started date;expected date;ended date;ending text;
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
  started:=case when r?'inicio_mes' then education_private.month_value(r->>'inicio_mes') else previous.inicio_mes end;
  expected:=case when r?'previsao_conclusao_mes' then education_private.month_value(r->>'previsao_conclusao_mes') else previous.previsao_conclusao_mes end;
  ended:=case when r?'termino_mes' then education_private.month_value(r->>'termino_mes') else previous.termino_mes end;
  ending:=case when r?'situacao_final' then nullif(r->>'situacao_final','') else previous.situacao_final end;
  if ending is not null and ending not in ('concluido','interrompido') then raise exception 'Situação acadêmica inválida.' using errcode='22023';end if;
  if studying is null and ending is not null then raise exception 'Confirme a situação atual da formação.' using errcode='22023';end if;
  if studying=false and ((previous.id is null or previous.cursando_atualmente is distinct from false or previous.situacao_final is not null) and ending is null
   or (previous.cursando_atualmente is distinct from false and not(r?'situacao_final'))) then
   raise exception 'Escolha se a formação foi concluída ou interrompida/trancada.' using errcode='22023';
  end if;
  if started is not null and ((expected is not null and expected<started) or (ended is not null and ended<started)) then
   raise exception 'A previsão e o término não podem ser anteriores ao início.' using errcode='22023';end if;

  if previous.id is null and exists(select 1 from public.usuario_formacoes f where f.user_id=actor and f.instituicao_id is not distinct from iid and f.curso_id is not distinct from cid
   and lower(coalesce(trim(f.instituicao_manual),''))=lower(coalesce(im,'')) and lower(coalesce(trim(f.curso_manual),''))=lower(coalesce(cm,'')))
   and not coalesce((r->>'duplicate_ack')::boolean,false) then raise exception 'Já existe uma formação com esse par. Confirme se representa outro episódio.' using errcode='22023';end if;
  insert into public.usuario_formacoes(id,user_id,instituicao_id,instituicao_manual,curso_id,curso_manual,cursando_atualmente,origem,posicao,inicio_mes,previsao_conclusao_mes,termino_mes,situacao_final)
  values(fid,actor,iid,im,cid,cm,studying,old_origin,position_index,started,expected,ended,ending)
  on conflict(id) do update set instituicao_id=excluded.instituicao_id,instituicao_manual=excluded.instituicao_manual,curso_id=excluded.curso_id,curso_manual=excluded.curso_manual,
   cursando_atualmente=excluded.cursando_atualmente,posicao=excluded.posicao,inicio_mes=excluded.inicio_mes,previsao_conclusao_mes=excluded.previsao_conclusao_mes,termino_mes=excluded.termino_mes,situacao_final=excluded.situacao_final,updated_at=now() where usuario_formacoes.user_id=actor;
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

create schema workspace_private;
revoke all on schema workspace_private from public,anon,authenticated;
grant usage on schema workspace_private to authenticated;
alter default privileges in schema workspace_private revoke execute on functions from public;
-- Exactly the existing panel membership gate and project-details visibility gate.
create function workspace_private.project_navigation(p_offset integer,p_current text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); start_at integer:=greatest(0,least(coalesce(p_offset,0),100000));result jsonb;
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 with linked as materialized (
  select id from public.projects where owner_id=actor
  union select project_id from public.project_members where user_id=actor and status='active'
 ), allowed as materialized (
  select p.id,p.slug,p.title from linked l join public.projects p on p.id=l.id
  where (p.visibility='public' and p.status<>'archived') or public.is_project_leader(p.id)
 ), page as(select * from allowed order by lower(title),id limit 26 offset start_at)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by lower(title),id) from(select * from page order by lower(title),id limit 25)p),'[]'),
  'has_more',(select count(*)>25 from page),'current',(select to_jsonb(p) from allowed p where slug=p_current or id::text=p_current limit 1)) into result;
 return result;
end $$;
create function public.get_my_project_navigation(p_offset integer default 0,p_current text default null) returns jsonb
language sql stable security invoker set search_path='' as $$select workspace_private.project_navigation(p_offset,p_current)$$;
revoke all on function workspace_private.project_navigation(integer,text),public.get_my_project_navigation(integer,text) from public,anon,authenticated;
grant execute on function workspace_private.project_navigation(integer,text),public.get_my_project_navigation(integer,text) to authenticated;

do $$declare preserved text;begin
 select md5(coalesce(jsonb_agg(to_jsonb(f)-'inicio_mes'-'previsao_conclusao_mes'-'termino_mes'-'situacao_final'-'situacao' order by id),'[]')::text) into preserved from public.usuario_formacoes f;
 if preserved is distinct from current_setting('team_link.p35_education_hash') then raise exception 'Existing education data changed; migration aborted.';end if;
end $$;
