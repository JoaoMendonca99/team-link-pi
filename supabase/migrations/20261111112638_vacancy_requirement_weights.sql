-- Preserve existing grants, canonical vacancy requirements and the legacy label cache.

create or replace function concept_private.prepare(p_type text,p_target uuid,p_choices jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; c public.conceitos; result jsonb:='[]'; cid uuid; label text; lim int; maxlen int; weight numeric; normalized jsonb;
begin
 perform concept_private.authorize(p_type,p_target);
 lim:=case when p_type='tag' then 10 when p_type='requirement' then 30 else 16 end;
 maxlen:=case when p_type='requirement' then 120 else 40 end;
 if p_choices is null or jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices)>lim then raise exception 'Quantidade de conceitos inválida.' using errcode='22023'; end if;
 for r in select * from jsonb_array_elements(p_choices) loop
  weight := null;
  if p_type = 'requirement' and r ? 'weight' then
   if jsonb_typeof(r->'weight') is distinct from 'number' then
    raise exception 'Informe uma importância inteira entre 1 e 5.' using errcode='22023';
   end if;
   weight := (r->>'weight')::numeric;
   if weight < 1 or weight > 5 or trunc(weight) <> weight then
    raise exception 'Informe uma importância inteira entre 1 e 5.' using errcode='22023';
   end if;
  end if;
  cid:=nullif(r->>'id','')::uuid;
  label:=coalesce(r->>'raw',r->>'label','');
  if cid is null and coalesce((r->>'proposal')::boolean,false) then
   if length(trim(label))>maxlen then raise exception 'Conceito muito longo.' using errcode='22023'; end if;
   cid:=concept_private.propose(label,coalesce(r->>'domain','Geral'));
  end if;
  if cid is not null then
   -- Resolve historical IDs once; consolidation always points directly at an active identity.
   select * into c from public.conceitos where id=cid;
   if c.consolidado_em is not null then select * into c from public.conceitos where id=c.consolidado_em; end if;
   if c.id is null or (c.status='inativo' and not exists(select 1 from public.conceitos_vinculos where tipo=p_type and target_id=p_target and conceito_id=c.id)) then
    raise exception 'Selecione um conceito disponível.' using errcode='22023'; end if;
   normalized := jsonb_build_object('id',c.id,'label',c.nome,'domain',c.dominio,'status',c.status);
  else
   -- Unresolved legacy data may be kept, but never newly forged by a client.
   if not exists(select 1 from public.conceitos_vinculos where tipo=p_type and target_id=p_target and conceito_id is null and texto_original=label) then
    raise exception 'Confirme o conceito ou use Adicionar novo conceito.' using errcode='22023'; end if;
   normalized := jsonb_build_object('id',null,'label',label,'raw',label,'pending',
    (select pendencia from public.conceitos_vinculos where tipo=p_type and target_id=p_target and conceito_id is null and texto_original=label));
  end if;
  if weight is not null then
   normalized := normalized || jsonb_build_object('weight',weight::int);
  end if;
  result := result || jsonb_build_array(normalized);
 end loop;
 -- Stable first occurrence, deduplicated by identity, never by label across domains.
 return (select coalesce(jsonb_agg(x order by n),'[]') from (
  select distinct on(coalesce(x->>'id','raw:'||(x->>'label'))) x,n from jsonb_array_elements(result) with ordinality a(x,n)
  order by coalesce(x->>'id','raw:'||(x->>'label')),n) d);
end $$;

create or replace function concept_private.replace_refs(p_type text,p_target uuid,p_values jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb; n integer:=0; cid uuid; pid uuid; old public.conceitos_vinculos[]; kept uuid[] := ARRAY[]::uuid[]; link_id uuid; label text;
begin
 -- Vacancy requirements are updated in place by canonical identity or pending text.
 if p_type = 'requirement' then
  select project_id into strict pid from public.project_vacancies where id = p_target;
  for r in select * from jsonb_array_elements(p_values) loop
   cid := nullif(r->>'id','')::uuid;
   label := coalesce(r->>'raw',r->>'label','');
   update public.conceitos_vinculos
   set texto_original = label, posicao = n,
       pendencia = case when cid is null then coalesce(r->>'pending','unreviewed') end,
       peso = coalesce((r->>'weight')::int,peso,3)
   where tipo = 'requirement' and target_id = p_target
     and (conceito_id = cid or (cid is null and conceito_id is null and texto_original = label))
   returning id into link_id;
   if link_id = any(kept) then
    update public.conceitos_vinculos set posicao = array_position(kept,link_id)-1 where id=link_id;
    continue;
   end if;
   if not found then
    insert into public.conceitos_vinculos(tipo,project_id,vacancy_id,conceito_id,texto_original,posicao,pendencia,peso)
    values ('requirement',pid,p_target,cid,label,n,
      case when cid is null then coalesce(r->>'pending','unreviewed') end,coalesce((r->>'weight')::int,3))
    returning id into link_id;
   end if;
   kept := array_append(kept,link_id);
   n := n + 1;
  end loop;
  delete from public.conceitos_vinculos
  where tipo = 'requirement' and target_id = p_target and not (id = any(kept));
  return;
 end if;
 select array_agg(v) into old from public.conceitos_vinculos v where tipo=p_type and target_id=p_target;
 delete from public.conceitos_vinculos where tipo=p_type and target_id=p_target;
 if p_type='tag' then pid:=p_target; end if;
 for r in select * from jsonb_array_elements(p_values) loop
  cid:=nullif(r->>'id','')::uuid;
  insert into public.conceitos_vinculos(id,tipo,user_id,project_id,vacancy_id,conceito_id,texto_original,posicao,pendencia,created_at)
  select coalesce(o.id,gen_random_uuid()),p_type,case when p_type in ('skill','interest') then p_target end,pid,
   null,cid,coalesce(r->>'raw',r->>'label',''),n,
   case when cid is null then coalesce(r->>'pending','unreviewed') end,coalesce(o.created_at,now())
  from (select 1) x left join lateral(select t.id,t.created_at from unnest(old) t
    where (cid is not null and t.conceito_id=cid) or (cid is null and t.conceito_id is null and t.texto_original=coalesce(r->>'raw',r->>'label','')) limit 1) o on true
  on conflict do nothing;
  n:=n+1;
 end loop;
end $$;

create or replace function concept_private.sync_legacy(p_type text,p_target uuid,p_texts text[]) returns void
language plpgsql security invoker set search_path='' as $$
declare label text; cid uuid; prior jsonb; vals jsonb:='[]'; reason text; selected jsonb;
begin
 -- Canonical saves have already written the exact associations. Do not interpret their label cache again.
 if p_type = 'requirement' and coalesce(p_texts,'{}') = (
  select coalesce(array_agg(coalesce(c.nome,v.texto_original) order by v.posicao,v.id),'{}')
  from public.conceitos_vinculos v left join public.conceitos c on c.id=v.conceito_id
  where v.tipo='requirement' and v.target_id=p_target
 ) then return; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',conceito_id,'raw',texto_original)),'[]') into prior
 from public.conceitos_vinculos where tipo=p_type and target_id=p_target;
 foreach label in array coalesce(p_texts,'{}') loop
  -- Retain a previous explicit disambiguation. Never reinterpret unchanged text using fuzzy search.
  select jsonb_agg(x) into selected from jsonb_array_elements(prior) x where x->>'raw'=label and x->>'id' is not null;
  if selected is not null then vals:=vals||selected; continue; end if;
  cid:=concept_private.resolve_exact(label);
  reason:=null;
  if cid is null then
   if label is null or trim(label)='' or length(label)>120 then reason:='invalid';
   elsif exists(select 1 from public.conceitos_aliases a join public.conceitos c on c.id=a.conceito_id
    where a.chave=concept_private.key(label) and ((a.validado and c.status='validado') or a.exige_confirmacao)) then reason:='ambiguous';
   else reason:='unreviewed'; end if;
  end if;
  vals:=vals||jsonb_build_array(jsonb_build_object('id',cid,'raw',coalesce(label,''),'pending',reason));
 end loop;
 perform concept_private.replace_refs(p_type,p_target,vals);
end $$;

create or replace function concept_private.apply_choices(p_type text,p_target uuid,p_choices jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare vals jsonb;
begin
 if p_target is null then raise exception 'Destino obrigatório.'; end if;
 vals:=concept_private.prepare(p_type,p_target,p_choices); -- Includes ownership check and target row lock.
 if p_type='requirement' then
  perform concept_private.replace_refs(p_type,p_target,vals);
  perform concept_private.write_cache(p_type,p_target,vals);
 else
  perform concept_private.write_cache(p_type,p_target,vals);
  perform concept_private.replace_refs(p_type,p_target,vals);
 end if;
end $$;

create or replace function public.save_vacancy_concepts(p_project uuid,p_vacancy uuid,p_title text,p_description text,p_choices jsonb,p_positions integer,p_open boolean) returns uuid
language plpgsql security invoker set search_path='' as $$
declare vals jsonb; vid uuid; prior_skills text[];
begin
 if not public.is_project_join_manager(p_project) then raise exception 'Acesso não permitido.' using errcode='42501'; end if;
 vals:=concept_private.prepare('requirement',p_vacancy,p_choices);
 -- Let the existing recruitment procedure check access, availability and capacity.
 -- Keep the current label cache until canonical requirements and weights have been written.
 if p_vacancy is not null then
  select array(select jsonb_array_elements_text(entry->'skills')) into prior_skills
  from jsonb_array_elements(public.recruitment_vacancies(p_project)) entry
  where entry->>'id'=p_vacancy::text;
 end if;
 vid:=public.recruitment_save_vacancy(p_project,p_vacancy,p_title,p_description,coalesce(prior_skills,'{}'),p_positions,p_open);
 perform concept_private.apply_choices('requirement',vid,vals); return vid;
end $$;

create or replace function public.save_project_concepts(p_form jsonb, p_academic jsonb, p_tag_choices jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f jsonb:=p_form; tags jsonb; vacancies jsonb:='[]'; v jsonb; vals jsonb; prior_skills text[]; prior_vacancies jsonb:='[]'; saved_slug text; wanted_status text:=p_form->>'p_status'; pid uuid:=nullif(p_form->>'p_project_id','')::uuid;
begin
 if pid is not null and wanted_status in ('completed','archived') then f:=jsonb_set(f,'{p_status}',to_jsonb((select status from public.projects where id=pid)));end if;
 tags:=concept_private.prepare('tag',pid,p_tag_choices);
 if pid is not null then prior_vacancies:=public.recruitment_vacancies(pid); end if;
 for v in select * from jsonb_array_elements(coalesce(p_form->'p_vacancies','[]')) loop
  vals:=concept_private.prepare('requirement',nullif(v->>'id','')::uuid,coalesce(v->'concept_refs','[]'));
  select array(select jsonb_array_elements_text(entry->'skills')) into prior_skills
  from jsonb_array_elements(prior_vacancies) entry where entry->>'id'=v->>'id';
  vacancies:=vacancies||jsonb_build_array(v||jsonb_build_object('skills',to_jsonb(coalesce(prior_skills,'{}')),'concept_refs',vals));
 end loop;
 f:=f||jsonb_build_object('p_tags',to_jsonb(concept_private.labels(tags)),'p_vacancies',vacancies);
 saved_slug:=public.save_project_form_with_academics(f,p_academic);
 select id into pid from public.projects where projects.slug=saved_slug;
 perform concept_private.apply_choices('tag',pid,tags);
 if pid is not null and wanted_status in ('completed','archived') then perform lifecycle_private.finalize(pid,wanted_status);end if;
 return saved_slug;
end $function$
;

create or replace function concept_private.read_refs(p_type text,p_target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',v.conceito_id,'label',coalesce(c.nome,v.texto_original),
 'raw',v.texto_original,'domain',c.dominio,'status',coalesce(c.status,'pendente'),'pending',v.pendencia) || case when p_type='requirement' then jsonb_build_object('weight',v.peso) else '{}'::jsonb end order by v.posicao,v.id),'[]')
 from public.conceitos_vinculos v left join public.conceitos c on c.id=v.conceito_id where v.tipo=p_type and v.target_id=p_target
$$;
