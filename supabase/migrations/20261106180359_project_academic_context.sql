-- Optional configuration; no classification, backfill, activation or historical edits.
alter table public.projects
 add column project_context text check(project_context in ('academic','general')),
 add column academic_institution text check(length(academic_institution)<=500),
 add column academic_course text check(length(academic_course)<=500),
 add column academic_city text check(length(academic_city)<=200),
 add column academic_revision integer not null default 1;
alter table public.activity_periods
 add column academic_year integer check(academic_year between 1900 and 2200),
 add column academic_semester integer check(academic_semester in (1,2)),
 add column discipline text check(length(discipline)<=500),
 add column advisor text check(length(advisor)<=500),
 add column institution text check(length(institution)<=500),
 add column course text check(length(course)<=500),
 add column city text check(length(city)<=200),
 add column academic_configured boolean not null default false;
alter table public.academic_documents add column period_id uuid,
 add constraint academic_document_period foreign key(project_id,period_id) references public.activity_periods(project_id,id);
create index academic_documents_period on public.academic_documents(project_id,period_id) where period_id is not null;

create schema if not exists academic_private;
revoke all on schema academic_private from public,anon,authenticated;

-- Keep the existing project/member authorization source, independent of modules.
create function public.get_project_academics(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.projects; begin
 select * into p from public.projects where id=p_project;
 if auth.uid() is null or p.id is null or not (p.owner_id=auth.uid() or public.is_project_join_manager(p_project) or
 exists(select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active')) then
 raise exception 'Acesso indisponível.'; end if;
 return jsonb_build_object('context',p.project_context,'revision',p.academic_revision,
 'defaults',jsonb_build_object('institution',coalesce(p.academic_institution,''),'course',coalesce(p.academic_course,''),'city',coalesce(p.academic_city,'')),
 'periods',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('task_count',(select count(*) from public.activity_tasks where period_id=r.id),'goal_count',(select count(*) from public.activity_goals where period_id=r.id)) order by r.is_active desc,r.created_at desc,r.id) from public.activity_periods r where r.project_id=p_project),'[]'::jsonb));
end $$;

-- Trigger covers direct project writes too; an old revision can never mask a change.
create function academic_private.project_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.project_context,new.academic_institution,new.academic_course,new.academic_city) is distinct from
    row(old.project_context,old.academic_institution,old.academic_course,old.academic_city) then
   new.academic_revision:=old.academic_revision+1;
 else new.academic_revision:=old.academic_revision; end if;
 return new;
end $$;
create trigger academic_project_revision before update on public.projects for each row execute function academic_private.project_revision();

-- Caller locks project and verifies manager permission. A saved period owns a snapshot
-- of defaults: subsequent changes to project defaults do not rewrite past semesters.
create function academic_private.write_period(p_project uuid,p_data jsonb,p_initial boolean default false) returns uuid
language plpgsql set search_path='' as $$
declare p public.projects; r public.activity_periods; result uuid; setting_academic boolean;
begin
 select * into p from public.projects where id=p_project;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados do período inválidos.'; end if;
 if nullif(p_data->>'id','') is not null then
   select * into r from public.activity_periods where project_id=p_project and id=(p_data->>'id')::uuid for update;
   if r.id is null or (not p_initial and r.version is distinct from (p_data->>'version')::int) then raise exception 'Período alterado ou indisponível. Recarregue antes de salvar.'; end if;
 end if;
 setting_academic:=p.project_context='academic' and p_data ? 'academic_year';
 if setting_academic and ((nullif(btrim(p_data->>'discipline'),'') is not null and coalesce((p_data->>'discipline_confirmed')::boolean,false)=false) or
 (nullif(btrim(p_data->>'advisor'),'') is not null and coalesce((p_data->>'advisor_confirmed')::boolean,false)=false)) then
 raise exception 'Confirme a disciplina e o professor informados para este período.'; end if;
 if coalesce((p_data->>'activate')::boolean,false) then
   update public.activity_periods set is_active=false,version=version+1 where project_id=p_project and is_active and id is distinct from r.id;
 end if;
 result:=coalesce(r.id,gen_random_uuid());
 insert into public.activity_periods(id,project_id,name,description,starts_on,ends_on,is_active,created_by,
 academic_year,academic_semester,discipline,advisor,institution,course,city,academic_configured)
 values(result,p_project,btrim(p_data->>'name'),coalesce(p_data->>'description',''),nullif(p_data->>'starts_on','')::date,nullif(p_data->>'ends_on','')::date,
 coalesce(r.is_active,false) or coalesce((p_data->>'activate')::boolean,false) or not exists(select 1 from public.activity_periods where project_id=p_project),auth.uid(),
 case when setting_academic then nullif(p_data->>'academic_year','')::int else r.academic_year end,
 case when setting_academic then nullif(p_data->>'academic_semester','')::int else r.academic_semester end,
 case when setting_academic then nullif(btrim(p_data->>'discipline'),'') else r.discipline end,
 case when setting_academic then nullif(btrim(p_data->>'advisor'),'') else r.advisor end,
 case when setting_academic then coalesce(nullif(btrim(p_data->>'institution'),''),case when not coalesce(r.academic_configured,false) then p.academic_institution end) else r.institution end,
 case when setting_academic then coalesce(nullif(btrim(p_data->>'course'),''),case when not coalesce(r.academic_configured,false) then p.academic_course end) else r.course end,
 case when setting_academic then coalesce(nullif(btrim(p_data->>'city'),''),case when not coalesce(r.academic_configured,false) then p.academic_city end) else r.city end,
 coalesce(r.academic_configured,false) or coalesce(setting_academic,false))
 on conflict on constraint activity_periods_pkey do update set name=excluded.name,description=excluded.description,starts_on=excluded.starts_on,ends_on=excluded.ends_on,
 is_active=excluded.is_active,academic_year=excluded.academic_year,academic_semester=excluded.academic_semester,discipline=excluded.discipline,advisor=excluded.advisor,
 institution=excluded.institution,course=excluded.course,city=excluded.city,academic_configured=excluded.academic_configured,version=activity_periods.version+1;
 return result;
end $$;

create function public.save_project_academics(p_project uuid,p_revision integer,p_context text,p_defaults jsonb,p_periods jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.projects; entry jsonb; begin
 select * into p from public.projects where id=p_project for update;
 if auth.uid() is null or p.id is null or not public.is_project_join_manager(p_project) then raise exception 'Somente Líderes ou Gestores podem configurar informações acadêmicas.'; end if;
 if p.academic_revision is distinct from p_revision then raise exception 'Configuração alterada. Recarregue antes de salvar.'; end if;
 if p_context not in ('academic','general') or p_context is null or jsonb_typeof(p_defaults) is distinct from 'object' or jsonb_typeof(p_periods) is distinct from 'array' or jsonb_array_length(p_periods)>150 then raise exception 'Configuração inválida.'; end if;
 if (select count(*) from jsonb_array_elements(p_periods) e where nullif(e->>'id','') is not null) <>
    (select count(distinct e->>'id') from jsonb_array_elements(p_periods) e where nullif(e->>'id','') is not null) then raise exception 'Períodos duplicados.'; end if;
 update public.projects set project_context=p_context,academic_institution=nullif(btrim(p_defaults->>'institution'),''),
 academic_course=nullif(btrim(p_defaults->>'course'),''),academic_city=nullif(btrim(p_defaults->>'city'),'') where id=p_project;
 for entry in select value from jsonb_array_elements(p_periods) loop
   if nullif(entry->>'id','') is null and exists(select 1 from public.activity_periods where project_id=p_project) then raise exception 'Utilize os períodos existentes. Crie novos em Gerenciar períodos.'; end if;
   -- Setup must preserve active period, even if a client sends an activation flag.
   perform academic_private.write_period(p_project,(entry-'activate')||jsonb_build_object('activate',false));
 end loop;
 insert into public.activity_updates(project_id) values(p_project) on conflict(project_id) do update set changed_at=clock_timestamp();
 return public.get_project_academics(p_project);
end $$;

create function public.save_project_period(p_project uuid,p_action text,p_data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; begin
 perform 1 from public.projects where id=p_project for update;
 if not found or auth.uid() is null or not public.is_project_join_manager(p_project) then raise exception 'Somente Líderes ou Gestores podem administrar períodos.'; end if;
 if p_action='save_period' then result:=academic_private.write_period(p_project,p_data);
 elsif p_action='activate_period' then
   if not exists(select 1 from public.activity_periods where project_id=p_project and id=(p_data->>'id')::uuid and version=(p_data->>'version')::int) then raise exception 'Período alterado ou indisponível.'; end if;
   update public.activity_periods set is_active=false,version=version+1 where project_id=p_project and is_active and id<>(p_data->>'id')::uuid;
   update public.activity_periods set is_active=true,version=version+1 where project_id=p_project and id=(p_data->>'id')::uuid returning id into result;
 else raise exception 'Ação indisponível.'; end if;
 insert into public.activity_updates(project_id) values(p_project) on conflict(project_id) do update set changed_at=clock_timestamp();
 return result;
end $$;

-- Existing form and its triggers still perform project/tag/vacancy creation.
-- The wrapper configures that trigger's initial period in the same transaction.
create function public.save_project_form_with_academics(p_form jsonb,p_academic jsonb) returns text
language plpgsql security invoker set search_path='' as $$
declare saved_slug text; p public.projects; initial public.activity_periods; begin
 saved_slug:=public.save_project_form(nullif(p_form->>'p_project_id','')::uuid,p_form->>'p_slug',p_form->>'p_title',p_form->>'p_category',
 array(select jsonb_array_elements_text(p_form->'p_secondary_categories')),p_form->>'p_project_url',p_form->>'p_short_description',p_form->>'p_description',
 p_form->>'p_status',p_form->>'p_visibility',array(select jsonb_array_elements_text(p_form->'p_tags')),p_form->'p_vacancies');
 if nullif(p_form->>'p_project_id','') is null and p_academic is not null then
   select * into p from public.projects where slug=saved_slug;
   perform public.save_project_academics(p.id,p.academic_revision,p_academic->>'context',p_academic->'defaults','[]'::jsonb);
   if p_academic->>'context'='academic' then
     -- Lookup through the authorized RPC, since periods intentionally have no table grants.
     select * into initial from jsonb_populate_record(null::public.activity_periods,(public.get_project_academics(p.id)->'periods')->0);
     perform public.save_project_period(p.id,'save_period',coalesce(p_academic->'period','{}'::jsonb)||jsonb_build_object('id',initial.id,'version',initial.version,
       'name',coalesce(nullif(btrim(p_academic#>>'{period,name}'),''),initial.name)));
   end if;
 end if;
 return saved_slug;
end $$;

-- The existing report RPC remains unchanged: enforce project/period relation on
-- every write while retaining the user's historical meta snapshot and versions.
create function academic_private.report_period() returns trigger language plpgsql set search_path='' as $$
begin new.period_id:=nullif(new.body#>>'{academic,periodId}','')::uuid; return new; end $$;
create trigger academic_report_period before insert or update on public.academic_documents for each row execute function academic_private.report_period();

revoke all on all functions in schema academic_private from public,anon,authenticated,service_role;
revoke all on function public.get_project_academics(uuid),public.save_project_academics(uuid,integer,text,jsonb,jsonb),
 public.save_project_period(uuid,text,jsonb),public.save_project_form_with_academics(jsonb,jsonb) from public,anon;
grant execute on function public.get_project_academics(uuid),public.save_project_academics(uuid,integer,text,jsonb,jsonb),
 public.save_project_period(uuid,text,jsonb),public.save_project_form_with_academics(jsonb,jsonb) to authenticated;
