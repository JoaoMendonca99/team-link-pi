-- Four explicitly typed uses; no inference between a skill, interest, tag or requirement.
alter table public.project_vacancies add constraint project_vacancies_id_project_unique unique(id,project_id);
create table public.conceitos_vinculos (
 id uuid primary key default gen_random_uuid(),
 tipo text not null check(tipo in ('skill','interest','tag','requirement')),
 user_id uuid references public.profiles(id) on delete cascade,
 project_id uuid references public.projects(id) on delete cascade,
 vacancy_id uuid,
 target_id uuid generated always as(coalesce(user_id,vacancy_id,project_id)) stored,
 conceito_id uuid references public.conceitos(id), texto_original text not null,
 posicao integer not null check(posicao>=0), pendencia text check(pendencia in ('ambiguous','unreviewed','invalid')),
 created_at timestamptz not null default now(),
 foreign key(vacancy_id,project_id) references public.project_vacancies(id,project_id) on delete cascade,
 check((tipo in ('skill','interest') and user_id is not null and project_id is null and vacancy_id is null)
 or (tipo='tag' and user_id is null and project_id is not null and vacancy_id is null)
 or (tipo='requirement' and user_id is null and project_id is not null and vacancy_id is not null)),
 check((conceito_id is null)=(pendencia is not null))
);
create unique index conceitos_vinculos_identidade on public.conceitos_vinculos(tipo,target_id,conceito_id) where conceito_id is not null;
create unique index conceitos_vinculos_pendente on public.conceitos_vinculos(tipo,target_id,texto_original) where conceito_id is null;
create index conceitos_vinculos_user on public.conceitos_vinculos(user_id);
create index conceitos_vinculos_project on public.conceitos_vinculos(project_id);
create index conceitos_vinculos_vacancy on public.conceitos_vinculos(vacancy_id,project_id);
create index conceitos_vinculos_conceito on public.conceitos_vinculos(conceito_id);
alter table public.conceitos_vinculos enable row level security;
revoke all on public.conceitos_vinculos from public,anon,authenticated;
grant select on public.conceitos_vinculos to authenticated;
create policy conceitos_vinculos_proprietario on public.conceitos_vinculos for select to authenticated
 using(user_id=(select auth.uid()) or (project_id is not null and public.is_project_join_manager(project_id)));
alter table public.project_required_skills add column conceito_id uuid references public.conceitos(id);
create index project_required_skills_conceito on public.project_required_skills(conceito_id);
-- Keep all pre-existing editable columns; the new compatibility reference is server-managed.
do $$ declare columns text; begin
 if has_table_privilege('authenticated','public.project_required_skills','UPDATE') then
  select string_agg(quote_ident(column_name),',') into columns from information_schema.columns
   where table_schema='public' and table_name='project_required_skills' and column_name<>'conceito_id';
  revoke update on public.project_required_skills from authenticated;
  execute 'grant update('||columns||') on public.project_required_skills to authenticated';
 end if;
end $$;

create function concept_private.authorize(p_type text,p_target uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare pid uuid;
begin
 if auth.uid() is null or p_type not in ('skill','interest','tag','requirement') then raise exception 'Acesso não permitido.' using errcode='42501'; end if;
 if p_type in ('skill','interest') then
  if p_target is distinct from auth.uid() then raise exception 'Acesso não permitido.' using errcode='42501'; end if;
  perform 1 from public.profiles where id=p_target for update;
  if not found then raise exception 'Perfil não encontrado.'; end if;
 elsif p_target is not null then
  if p_type='tag' then pid:=p_target; else select project_id into pid from public.project_vacancies where id=p_target; end if;
  if pid is null or not public.is_project_join_manager(pid) then raise exception 'Acesso não permitido.' using errcode='42501'; end if;
  perform 1 from public.projects where id=pid for update;
 end if;
end $$;

-- Internal replacement preserves dates/IDs for unchanged associations. No cache-writing trigger on this table.
create function concept_private.replace_refs(p_type text,p_target uuid,p_values jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare r jsonb; n integer:=0; cid uuid; pid uuid; old public.conceitos_vinculos[];
begin
 select array_agg(v) into old from public.conceitos_vinculos v where tipo=p_type and target_id=p_target;
 delete from public.conceitos_vinculos where tipo=p_type and target_id=p_target;
 if p_type='requirement' then select project_id into pid from public.project_vacancies where id=p_target; elsif p_type='tag' then pid:=p_target; end if;
 for r in select * from jsonb_array_elements(p_values) loop
  cid:=nullif(r->>'id','')::uuid;
  insert into public.conceitos_vinculos(id,tipo,user_id,project_id,vacancy_id,conceito_id,texto_original,posicao,pendencia,created_at)
  select coalesce(o.id,gen_random_uuid()),p_type,case when p_type in ('skill','interest') then p_target end,pid,
   case when p_type='requirement' then p_target end,cid,coalesce(r->>'raw',r->>'label',''),n,
   case when cid is null then coalesce(r->>'pending','unreviewed') end,coalesce(o.created_at,now())
  from (select 1) x left join lateral(select t.id,t.created_at from unnest(old) t
    where (cid is not null and t.conceito_id=cid) or (cid is null and t.conceito_id is null and t.texto_original=coalesce(r->>'raw',r->>'label','')) limit 1) o on true
  on conflict do nothing;
  n:=n+1;
 end loop;
end $$;

create function concept_private.sync_legacy(p_type text,p_target uuid,p_texts text[]) returns void
language plpgsql security invoker set search_path='' as $$
declare label text; cid uuid; prior jsonb; vals jsonb:='[]'; reason text; selected jsonb;
begin
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

create function concept_private.check_legacy(p_values text[],p_old text[],p_limit integer) returns void
language plpgsql security invoker set search_path='' as $$
declare label text;
begin
 if cardinality(p_values)>p_limit and cardinality(p_values)>coalesce(cardinality(p_old),0) then raise exception 'Limite de conceitos atingido.' using errcode='22023'; end if;
 foreach label in array coalesce(p_values,'{}') loop
  if not exists(select 1 from unnest(coalesce(p_old,'{}')) v where v is not distinct from label)
  and (label is null or length(trim(label)) not between 1 and 120 or label !~ '[[:alnum:]À-ÿ]' or label ~ '[[:cntrl:]<>@]' or label ~* '(https?://|www\.)') then
   raise exception 'Conceito inválido.' using errcode='22023';
  end if;
 end loop;
end $$;

-- Definer is limited to trigger-owned projections; it has no caller-supplied target.
create function concept_private.legacy_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
declare pid uuid; labels text[];
begin
 if tg_table_name='profiles' then
  perform concept_private.check_legacy(new.skills,case when tg_op='UPDATE' then old.skills end,16);
  perform concept_private.check_legacy(new.interests,case when tg_op='UPDATE' then old.interests end,16);
  if tg_op='INSERT' or new.skills is distinct from old.skills then perform concept_private.sync_legacy('skill',new.id,new.skills); end if;
  if tg_op='INSERT' or new.interests is distinct from old.interests then perform concept_private.sync_legacy('interest',new.id,new.interests); end if;
 elsif tg_table_name='project_vacancies' then
  perform concept_private.check_legacy(new.skills,case when tg_op='UPDATE' then old.skills end,30);
  if tg_op='INSERT' or new.skills is distinct from old.skills then perform concept_private.sync_legacy('requirement',new.id,new.skills); end if;
 elsif tg_table_name='project_tags' then
  pid:=case when tg_op='DELETE' then old.project_id else new.project_id end;
  if tg_op='UPDATE' and old.project_id is distinct from new.project_id then
   select array_agg(tag order by created_at,id) into labels from public.project_tags where project_id=old.project_id;
   perform concept_private.sync_legacy('tag',old.project_id,labels);
  end if;
  select array_agg(tag order by created_at,id) into labels from public.project_tags where project_id=pid;
  if tg_op<>'DELETE' then
   perform concept_private.check_legacy(array[new.tag],case when tg_op='UPDATE' then array[old.tag] end,1);
   if tg_op='INSERT' and cardinality(labels)>10 then raise exception 'Use até 10 tags gerais.' using errcode='22023'; end if;
  end if;
  perform concept_private.sync_legacy('tag',pid,labels);
 elsif tg_table_name='project_required_skills' then
  new.conceito_id:=concept_private.resolve_exact(new.skill);
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger concept_profile_sync after insert or update of skills,interests on public.profiles for each row execute function concept_private.legacy_trigger();
create trigger concept_vacancy_sync after insert or update of skills on public.project_vacancies for each row execute function concept_private.legacy_trigger();
create trigger concept_tag_sync after insert or update or delete on public.project_tags for each row execute function concept_private.legacy_trigger();
create trigger concept_required_legacy before insert or update of skill on public.project_required_skills for each row execute function concept_private.legacy_trigger();

create function concept_private.prepare(p_type text,p_target uuid,p_choices jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; c public.conceitos; result jsonb:='[]'; cid uuid; label text; lim int; maxlen int;
begin
 perform concept_private.authorize(p_type,p_target);
 lim:=case when p_type='tag' then 10 when p_type='requirement' then 30 else 16 end;
 maxlen:=case when p_type='requirement' then 120 else 40 end;
 if p_choices is null or jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices)>lim then raise exception 'Quantidade de conceitos inválida.' using errcode='22023'; end if;
 for r in select * from jsonb_array_elements(p_choices) loop
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
   result:=result||jsonb_build_array(jsonb_build_object('id',c.id,'label',c.nome,'domain',c.dominio,'status',c.status));
  else
   -- Unresolved legacy data may be kept, but never newly forged by a client.
   if not exists(select 1 from public.conceitos_vinculos where tipo=p_type and target_id=p_target and conceito_id is null and texto_original=label) then
    raise exception 'Confirme o conceito ou use Adicionar novo conceito.' using errcode='22023'; end if;
   result:=result||jsonb_build_array(jsonb_build_object('id',null,'label',label,'raw',label,'pending',
    (select pendencia from public.conceitos_vinculos where tipo=p_type and target_id=p_target and conceito_id is null and texto_original=label)));
  end if;
 end loop;
 -- Stable first occurrence, deduplicated by identity, never by label across domains.
 return (select coalesce(jsonb_agg(x order by n),'[]') from (
  select distinct on(coalesce(x->>'id','raw:'||(x->>'label'))) x,n from jsonb_array_elements(result) with ordinality a(x,n)
  order by coalesce(x->>'id','raw:'||(x->>'label')),n) d);
end $$;
create function concept_private.labels(p_values jsonb) returns text[]
language sql immutable set search_path='' as $$ select coalesce(array_agg(x->>'label' order by n),'{}') from jsonb_array_elements(p_values) with ordinality a(x,n) $$;
create function concept_private.write_cache(p_type text,p_target uuid,p_values jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare labels text[]:=concept_private.labels(p_values);
begin
 if p_type='skill' then update public.profiles set skills=labels where id=p_target and skills is distinct from labels;
 elsif p_type='interest' then update public.profiles set interests=labels where id=p_target and interests is distinct from labels;
 elsif p_type='requirement' then update public.project_vacancies set skills=labels where id=p_target and skills is distinct from labels;
 elsif p_type='tag' then
  delete from public.project_tags where project_id=p_target and not(tag=any(labels));
  insert into public.project_tags(project_id,tag) select p_target,t from unnest(labels) t on conflict(project_id,tag) do nothing;
 end if;
end $$;
create function concept_private.apply_choices(p_type text,p_target uuid,p_choices jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare vals jsonb;
begin
 if p_target is null then raise exception 'Destino obrigatório.'; end if;
 vals:=concept_private.prepare(p_type,p_target,p_choices); -- Includes ownership check and target row lock.
 perform concept_private.write_cache(p_type,p_target,vals);
 perform concept_private.replace_refs(p_type,p_target,vals);
end $$;

create function public.save_profile_concepts(p_profile jsonb,p_skills jsonb,p_interests jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare actor uuid:=auth.uid(); s jsonb; i jsonb;
begin
 s:=concept_private.prepare('skill',actor,p_skills); i:=concept_private.prepare('interest',actor,p_interests);
 update public.profiles set full_name=p_profile->>'full_name',bio=nullif(p_profile->>'bio',''),
 course=nullif(p_profile->>'course',''),course_id=nullif(p_profile->>'course_id','')::uuid,
 university=nullif(p_profile->>'university',''),institution_id=nullif(p_profile->>'institution_id','')::uuid,
 skills=concept_private.labels(s),interests=concept_private.labels(i) where id=actor;
 if not found then raise exception 'Não foi possível salvar o perfil.'; end if;
 perform concept_private.apply_choices('skill',actor,s); perform concept_private.apply_choices('interest',actor,i);
 return actor;
end $$;

create function public.save_vacancy_concepts(p_project uuid,p_vacancy uuid,p_title text,p_description text,p_choices jsonb,p_positions integer,p_open boolean) returns uuid
language plpgsql security invoker set search_path='' as $$
declare vals jsonb; vid uuid;
begin
 if not public.is_project_join_manager(p_project) then raise exception 'Acesso não permitido.' using errcode='42501'; end if;
 vals:=concept_private.prepare('requirement',p_vacancy,p_choices);
 vid:=public.recruitment_save_vacancy(p_project,p_vacancy,p_title,p_description,concept_private.labels(vals),p_positions,p_open);
 perform concept_private.apply_choices('requirement',vid,vals); return vid;
end $$;

create function public.save_project_concepts(p_form jsonb,p_academic jsonb,p_tag_choices jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare f jsonb:=p_form; tags jsonb; vacancies jsonb:='[]'; v jsonb; vals jsonb; saved_slug text; pid uuid:=nullif(p_form->>'p_project_id','')::uuid;
begin
 tags:=concept_private.prepare('tag',pid,p_tag_choices);
 for v in select * from jsonb_array_elements(coalesce(p_form->'p_vacancies','[]')) loop
  vals:=concept_private.prepare('requirement',nullif(v->>'id','')::uuid,coalesce(v->'concept_refs','[]'));
  vacancies:=vacancies||jsonb_build_array(v||jsonb_build_object('skills',to_jsonb(concept_private.labels(vals)),'concept_refs',vals));
 end loop;
 f:=f||jsonb_build_object('p_tags',to_jsonb(concept_private.labels(tags)),'p_vacancies',vacancies);
 saved_slug:=public.save_project_form_with_academics(f,p_academic);
 select id into pid from public.projects where projects.slug=saved_slug;
 perform concept_private.apply_choices('tag',pid,tags);
 return saved_slug;
end $$;

create function concept_private.read_refs(p_type text,p_target uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',v.conceito_id,'label',coalesce(c.nome,v.texto_original),
 'raw',v.texto_original,'domain',c.dominio,'status',coalesce(c.status,'pendente'),'pending',v.pendencia) order by v.posicao,v.id),'[]')
 from public.conceitos_vinculos v left join public.conceitos c on c.id=v.conceito_id where v.tipo=p_type and v.target_id=p_target
$$;
create function public.get_my_concept_refs() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('skills',concept_private.read_refs('skill',auth.uid()),'interests',concept_private.read_refs('interest',auth.uid()))
$$;
create function public.get_project_concept_refs(p_project uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.is_project_join_manager(p_project) then raise exception 'Acesso não permitido.' using errcode='42501'; end if;
 return jsonb_build_object('tags',concept_private.read_refs('tag',p_project),'vacancies',
 (select coalesce(jsonb_agg(jsonb_build_object('id',x.vacancy_id,'concepts',concept_private.read_refs('requirement',x.vacancy_id))),'[]')
 from (select distinct vacancy_id from public.conceitos_vinculos where tipo='requirement' and project_id=p_project) x));
end $$;

create table concept_private.migracoes(nome text primary key,relatorio jsonb not null,created_at timestamptz not null default now());
alter table concept_private.migracoes enable row level security;
revoke all on concept_private.migracoes from public,anon,authenticated;
create function concept_private.migrate_legacy() returns jsonb language plpgsql security invoker set search_path='' as $$
declare r record; report jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('concepts-initial-migration',0));
 select relatorio into report from concept_private.migracoes where nome='initial'; if found then return report; end if;
 if (select count(*) from public.conceitos where status='validado')<20 then raise exception 'Importe o catálogo revisado antes da migração.'; end if;
 for r in select id,skills,interests from public.profiles loop
  perform concept_private.sync_legacy('skill',r.id,r.skills); perform concept_private.sync_legacy('interest',r.id,r.interests);
 end loop;
 for r in select project_id,array_agg(tag order by created_at,id) labels from public.project_tags group by project_id loop perform concept_private.sync_legacy('tag',r.project_id,r.labels); end loop;
 for r in select id,skills from public.project_vacancies loop perform concept_private.sync_legacy('requirement',r.id,r.skills); end loop;
 update public.project_required_skills set conceito_id=concept_private.resolve_exact(skill) where conceito_id is null;
 select jsonb_build_object('entries',(select coalesce(sum(cardinality(skills)+cardinality(interests)),0) from public.profiles)+(select count(*) from public.project_tags)+(select coalesce(sum(cardinality(skills)),0) from public.project_vacancies),
 'linked',count(*) filter(where conceito_id is not null),'unlinked',count(*) filter(where conceito_id is null),'ambiguous',count(*) filter(where pendencia='ambiguous'),
 'unreviewed',count(*) filter(where pendencia='unreviewed'),'invalid',count(*) filter(where pendencia='invalid'),
 'legacy_entries',(select count(*) from public.project_required_skills),'legacy_linked',(select count(*) from public.project_required_skills where conceito_id is not null),'errors',0)
 into report from public.conceitos_vinculos;
 insert into concept_private.migracoes(nome,relatorio) values('initial',report); return report;
end $$;

-- Private helpers are inaccessible through REST; only the checked boundary helpers are executable.
revoke all on all functions in schema concept_private from public,anon,authenticated;
grant execute on function concept_private.key(text),concept_private.search_key(text) to anon,authenticated;
grant execute on function concept_private.prepare(text,uuid,jsonb),concept_private.apply_choices(text,uuid,jsonb),concept_private.labels(jsonb),concept_private.read_refs(text,uuid) to authenticated;
grant execute on function concept_private.propose(text,text) to authenticated;
revoke all on function public.save_profile_concepts(jsonb,jsonb,jsonb),public.save_vacancy_concepts(uuid,uuid,text,text,jsonb,integer,boolean),public.save_project_concepts(jsonb,jsonb,jsonb),public.get_my_concept_refs(),public.get_project_concept_refs(uuid) from public,anon,authenticated;
grant execute on function public.save_profile_concepts(jsonb,jsonb,jsonb),public.save_vacancy_concepts(uuid,uuid,text,text,jsonb,integer,boolean),public.save_project_concepts(jsonb,jsonb,jsonb),public.get_my_concept_refs(),public.get_project_concept_refs(uuid) to authenticated;

-- Preserve the existing recruitment rules; attach choices only after the real vacancy UUID is known.
CREATE OR REPLACE FUNCTION public.save_project_form(p_project_id uuid, p_slug text, p_title text, p_category text, p_secondary_categories text[], p_project_url text, p_short_description text, p_description text, p_status text, p_visibility text, p_tags text[], p_vacancies jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  saved public.projects;
  current_category text;
  vacancy record;
  saved_vacancy uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar o projeto.'; end if;
  if p_project_id is not null then
    select category into current_category from public.projects
      where id = p_project_id for update;
    if not found or not public.is_project_join_manager(p_project_id) then
      raise exception 'Somente Líderes ou Gestores podem editar os dados do projeto.';
    end if;
  end if;

  if p_category is null or (p_category is distinct from current_category and p_category not in (
    'Sistemas embutidos', 'Saúde e biometria', 'Educação e inclusão',
    'Sustentabilidade', 'Robótica', 'Data & comunidade', 'Tecnologia e inovação', 'Engenharia'
  )) then raise exception 'Selecione uma categoria principal válida.'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 120 then
    raise exception 'Informe um título de até 120 caracteres.';
  end if;
  if nullif(btrim(p_short_description), '') is null or nullif(btrim(p_description), '') is null then
    raise exception 'Preencha a descrição curta e a descrição completa.';
  end if;
  if not exists (select 1 from unnest(p_tags) as tag where length(btrim(tag)) > 0) then
    raise exception 'Adicione pelo menos uma tag geral.';
  end if;
  if p_project_url is not null and p_project_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Informe um link externo válido.';
  end if;

  if p_project_id is null then
    if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Informe um título que gere um endereço válido.';
    end if;
    insert into public.projects (
      owner_id, slug, title, category, secondary_categories, project_url,
      short_description, description, status, visibility
    ) values (
      auth.uid(), p_slug, btrim(p_title), p_category, p_secondary_categories, p_project_url,
      btrim(p_short_description), btrim(p_description), p_status, p_visibility
    ) returning * into saved;
  else
    update public.projects set title = btrim(p_title), category = p_category,
      secondary_categories = p_secondary_categories, project_url = p_project_url,
      short_description = btrim(p_short_description), description = btrim(p_description),
      status = p_status, visibility = p_visibility
    where id = p_project_id
    returning * into saved;
    if not found then raise exception 'Não foi possível salvar o projeto.'; end if;
  end if;

  delete from public.project_tags
    where project_id = saved.id and not exists (
      select 1 from unnest(p_tags) as tag where btrim(tag) = project_tags.tag
    );
  insert into public.project_tags (project_id, tag)
    select distinct saved.id, btrim(tag) from unnest(p_tags) as tag where length(btrim(tag)) > 0
    on conflict do nothing;

  for vacancy in select * from jsonb_to_recordset(p_vacancies) as v(
    id uuid, title text, description text, skills text[], positions integer, open boolean, concept_refs jsonb
  ) loop
    saved_vacancy := public.recruitment_save_vacancy(saved.id, vacancy.id, vacancy.title,
      vacancy.description, vacancy.skills, vacancy.positions, vacancy.open);
    if vacancy.concept_refs is not null then
      perform concept_private.apply_choices('requirement', saved_vacancy, vacancy.concept_refs);
    end if;
  end loop;
  return saved.slug;
end;
$function$
;

-- Administrative curation only. These routines have no grants to application roles.
create function concept_private.refresh_caches(p_concept uuid) returns void language plpgsql security invoker set search_path='' as $$
declare t record; vals jsonb;
begin
 for t in select distinct tipo,target_id from public.conceitos_vinculos where conceito_id=p_concept loop
  select jsonb_agg(jsonb_build_object('id',v.conceito_id,'label',coalesce(c.nome,v.texto_original),'raw',v.texto_original,'pending',v.pendencia) order by v.posicao,v.id)
  into vals from public.conceitos_vinculos v left join public.conceitos c on c.id=v.conceito_id where v.tipo=t.tipo and v.target_id=t.target_id;
  perform concept_private.write_cache(t.tipo,t.target_id,vals);
  perform concept_private.replace_refs(t.tipo,t.target_id,vals);
 end loop;
end $$;
create function concept_private.review(p_id uuid,p_status text,p_name text,p_note text) returns void
language plpgsql security invoker set search_path='' as $$
declare c public.conceitos;
begin
 if length(trim(coalesce(p_note,'')))<12 or p_status not in ('validado','inativo') or length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Revisão exige nome, estado e justificativa.'; end if;
 select * into strict c from public.conceitos where id=p_id for update;
 if c.consolidado_em is not null then raise exception 'Conceito já consolidado.'; end if;
 insert into concept_private.revisoes(conceito_id,acao,nota,anterior) values(p_id,'review',p_note,to_jsonb(c));
 update public.conceitos set nome=trim(p_name),status=p_status,updated_at=now() where id=p_id;
 update public.conceitos_aliases set validado=(p_status='validado') where conceito_id=p_id;
 insert into public.conceitos_aliases(conceito_id,nome,origem,validado) values(p_id,trim(p_name),'Revisão administrativa',p_status='validado') on conflict(conceito_id,chave) do nothing;
 perform concept_private.refresh_caches(p_id);
end $$;
create function concept_private.consolidate(p_source uuid,p_target uuid,p_note text) returns void
language plpgsql security invoker set search_path='' as $$
declare s public.conceitos; t public.conceitos; r record;
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
 for r in select * from public.conceitos_relacoes where origem_id=p_source or destino_id=p_source loop
  if r.origem_id<>p_target and r.destino_id<>p_target then
   insert into public.conceitos_relacoes(origem_id,destino_id,tipo,fonte,validado)
   values(least(p_target,case when r.origem_id=p_source then r.destino_id else r.origem_id end),greatest(p_target,case when r.origem_id=p_source then r.destino_id else r.origem_id end),r.tipo,r.fonte,r.validado) on conflict do nothing;
  end if;
 end loop;
 delete from public.conceitos_relacoes where origem_id=p_source or destino_id=p_source;
 -- Retarget earlier historical IDs directly, without chains or cycles.
 update public.conceitos set consolidado_em=p_target,updated_at=now() where consolidado_em=p_source;
 update public.conceitos set status='inativo',consolidado_em=p_target,updated_at=now() where id=p_source;
 perform concept_private.refresh_caches(p_target);
end $$;
revoke all on function concept_private.refresh_caches(uuid),concept_private.review(uuid,text,text,text),concept_private.consolidate(uuid,uuid,text) from public,anon,authenticated;
