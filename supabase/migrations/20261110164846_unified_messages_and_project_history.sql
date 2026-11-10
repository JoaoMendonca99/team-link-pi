create schema lifecycle_private;
revoke all on schema lifecycle_private from public,anon,authenticated;
grant usage on schema lifecycle_private to authenticated;
alter default privileges in schema lifecycle_private revoke execute on functions from public;
alter table public.projects add column closed_at timestamptz;
alter table public.join_requests add column closure_reason text check(closure_reason in ('project_completed','project_archived')),add column closed_at timestamptz;
alter table public.join_requests drop constraint join_requests_status_check;
alter table public.join_requests add constraint join_requests_status_check check(status in ('pending','approved','rejected','canceled','closed'));
create table lifecycle_private.reconciliation(key text primary key,projects integer not null,vacancies integer not null,applications integer not null,created_at timestamptz not null default now());
alter table lifecycle_private.reconciliation enable row level security;
create policy reconciliation_admin on lifecycle_private.reconciliation to postgres using(true) with check(true);
revoke all on lifecycle_private.reconciliation from public,anon,authenticated;

create function lifecycle_private.project_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.status in ('completed','archived') then raise exception 'Crie o projeto ativo e finalize-o depois de configurar seus dados.';end if;
  new.closed_at:=null;return new;
 end if;
 if old.status in ('completed','archived') then raise exception 'Projeto finalizado — somente leitura.';end if;
 if tg_op='DELETE' then return old;end if;
 new.closed_at:=case when new.status in ('completed','archived') then clock_timestamp() else old.closed_at end;
 return new;
end $$;
create trigger project_history_guard before insert or update or delete on public.projects for each row execute function lifecycle_private.project_guard();

create function lifecycle_private.resolve_project(row_data jsonb,reference text) returns uuid language sql stable security definer set search_path='' as $$
 select case reference
  when 'project_id' then (row_data->>'project_id')::uuid
  when 'task_id' then (select project_id from public.activity_tasks where id=(row_data->>'task_id')::uuid)
  when 'conversation_id' then (select project_id from public.project_conversations where id=(row_data->>'conversation_id')::uuid)
  when 'request_id' then (select project_id from public.join_requests where id=(row_data->>'request_id')::uuid)
  when 'document_id' then (select project_id from public.academic_documents where id=(row_data->>'document_id')::uuid)
 end
$$;
create function lifecycle_private.write_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare p uuid;state text;before_row jsonb:=case when tg_op<>'INSERT' then to_jsonb(old) end;after_row jsonb:=case when tg_op<>'DELETE' then to_jsonb(new) end;
begin
 -- Use the same project-row mutex as the existing RPCs. Check both identities on reparenting.
 for p in select distinct id from unnest(array[lifecycle_private.resolve_project(before_row,tg_argv[0]),lifecycle_private.resolve_project(after_row,tg_argv[0])])id where id is not null loop
  select status into state from public.projects where id=p for update;
  if state in ('completed','archived') then
   -- Reading history may advance its read cursor, never its conversation membership.
   if tg_table_name='project_conversation_members' and tg_op='UPDATE' and before_row-'last_read_at'=after_row-'last_read_at' then continue;end if;
   -- Idempotent closure housekeeping is the only permitted change to historic recruitment.
   if tg_table_name='project_vacancies' and tg_op='UPDATE' and (after_row->>'open')::boolean=false
     and before_row-'open'-'updated_at'=after_row-'open'-'updated_at' then continue;end if;
   if tg_table_name='join_requests' and tg_op='UPDATE' and before_row->>'status'='pending' and after_row->>'status'='closed'
     and before_row-'status'-'closure_reason'-'closed_at'-'updated_at'=after_row-'status'-'closure_reason'-'closed_at'-'updated_at' then continue;end if;
   raise exception 'Projeto finalizado — somente leitura.';
  end if;
 end loop;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
do $$declare tab text;reference text;begin
 foreach reference in array array['project_id','task_id','conversation_id','request_id','document_id'] loop
  foreach tab in array case reference
   when 'project_id' then array['activity_tasks','activity_goals','activity_stages','activity_periods','activity_history','project_members','project_recruitment_roles','project_vacancies','project_tags','project_required_skills','project_workspace_modules','project_conversations','academic_documents','project_support_integrations','support_tickets','support_ticket_messages','project_github_repositories','project_github_commits','project_github_releases','conceitos_vinculos','join_requests']
   when 'task_id' then array['activity_checklist','activity_comments']
   when 'conversation_id' then array['project_messages','project_conversation_members']
   when 'request_id' then array['join_request_vacancies','join_request_messages']
   else array['academic_document_versions'] end loop
   if to_regclass('public.'||tab) is not null then execute format('create trigger project_history_write_guard before insert or update or delete on public.%I for each row execute function lifecycle_private.write_guard(%L)',tab,reference);end if;
  end loop;
 end loop;
end $$;

create function lifecycle_private.close_recruitment(p_project uuid,notify boolean) returns void language plpgsql security definer set search_path='' as $$
declare state text;begin
 select status into state from public.projects where id=p_project for update;
 if state not in ('completed','archived') then return;end if;
 update public.project_vacancies set open=false where project_id=p_project and open;
 with affected as (
  update public.join_requests set status='closed',closure_reason=case state when 'completed' then 'project_completed' else 'project_archived' end,closed_at=clock_timestamp(),updated_at=now()
  where project_id=p_project and status='pending' returning id,user_id
 ) insert into public.notifications(recipient_id,actor_id,project_id,join_request_id,notification_type,title,body,href,metadata)
 select user_id,auth.uid(),p_project,id,'join_request','Projeto encerrado','Sua candidatura foi encerrada porque o projeto foi finalizado. Isso não representa uma rejeição pessoal.',
 '/meu-espaco/candidaturas?candidatura='||id,jsonb_build_object('closure_reason',case state when 'completed' then 'project_completed' else 'project_archived' end)
 from affected where notify;
end $$;
create function lifecycle_private.project_closed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('completed','archived') and old.status is distinct from new.status then
  perform lifecycle_private.close_recruitment(new.id,true);
  insert into public.activity_updates(project_id) values(new.id) on conflict(project_id) do update set changed_at=clock_timestamp();
 end if;
 return new;
end $$;
create trigger close_project_operations after update of status on public.projects for each row execute function lifecycle_private.project_closed();
-- Reconciliation is repeatable; preserve original project status and unknown historical completion dates.
do $$declare np integer;nv integer;na integer;r record;begin
 if not exists(select 1 from lifecycle_private.reconciliation where key='prompt37') then
  select count(*) into np from public.projects where status in ('completed','archived');
  select count(*) into nv from public.project_vacancies v join public.projects p on p.id=v.project_id where p.status in ('completed','archived') and v.open;
  select count(*) into na from public.join_requests j join public.projects p on p.id=j.project_id where p.status in ('completed','archived') and j.status='pending';
  for r in select id from public.projects where status in ('completed','archived') loop perform lifecycle_private.close_recruitment(r.id,false);end loop;
  insert into lifecycle_private.reconciliation(key,projects,vacancies,applications) values('prompt37',np,nv,na);
 end if;
end $$;
revoke all on all functions in schema lifecycle_private from public,anon,authenticated;

create function lifecycle_private.finalize(p_project uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare current_status text;begin
 select status into current_status from public.projects where id=p_project for update;
 if auth.uid() is null or current_status is null or not public.is_project_join_manager(p_project) or p_status not in ('completed','archived') then raise exception 'Finalização não autorizada.';end if;
 if current_status=p_status then return;end if;
 update public.projects set status=p_status where id=p_project;
end $$;
revoke all on function lifecycle_private.finalize(uuid,text) from public,anon,authenticated;
grant execute on function lifecycle_private.finalize(uuid,text) to authenticated;

create function lifecycle_private.historical_project(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.projects; result jsonb;begin
 select * into p from public.projects where (slug=p_slug or id::text=p_slug) and status in ('completed','archived');
 if not found or auth.uid() is null or (p.owner_id<>auth.uid() and not exists(select 1 from public.project_members where project_id=p.id and user_id=auth.uid() and status='active')) then return null;end if;
 select to_jsonb(p)||jsonb_build_object('owner_name',pr.full_name,'owner_course',pr.course,'owner_bio',pr.bio,'owner_avatar_url',pr.avatar_url,
 'tags',array(select tag from public.project_tags where project_id=p.id),'required_skills',array(select skill from public.project_required_skills where project_id=p.id),
 'likes_count',(select count(*) from public.project_likes where project_id=p.id),'comments_count',(select count(*) from public.project_comments where project_id=p.id and status='visible'),
 'members_count',(select count(*) from public.project_members where project_id=p.id and status='active')) into result from public.profiles pr where pr.id=p.owner_id;
 return result;
end $$;
create function public.get_historical_project(p_slug text) returns jsonb language sql stable security invoker set search_path='' as $$select lifecycle_private.historical_project(p_slug)$$;
create function lifecycle_private.historical_chat(p_project uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug,'status',p.status,'readOnly',true)
 from public.projects p where p.id=p_project and p.status in ('completed','archived') and auth.uid() is not null
 and exists(select 1 from public.project_members where project_id=p.id and user_id=auth.uid() and status='active')
$$;
create function public.get_historical_chat_project(p_project uuid) returns jsonb language sql stable security invoker set search_path='' as $$select lifecycle_private.historical_chat(p_project)$$;
revoke all on function lifecycle_private.historical_project(text),public.get_historical_project(text),lifecycle_private.historical_chat(uuid),public.get_historical_chat_project(uuid) from public,anon,authenticated;
grant execute on function lifecycle_private.historical_project(text),public.get_historical_project(text),lifecycle_private.historical_chat(uuid),public.get_historical_chat_project(uuid) to authenticated;

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_only_unread boolean DEFAULT false)
 RETURNS TABLE(id uuid, notification_type text, title text, body text, href text, metadata jsonb, is_read boolean, read_at timestamp with time zone, created_at timestamp with time zone, actor_id uuid, actor_name text, actor_course text, project_id uuid, project_title text, conversation_id uuid, message_id uuid, join_request_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    n.id,
    n.notification_type,
    n.title,
    n.body,
    n.href,
    n.metadata,
    n.read_at is not null as is_read,
    n.read_at,
    n.created_at,

    n.actor_id,
    coalesce(nullif(trim(actor.full_name), ''), 'Usuário') as actor_name,
    actor.course as actor_course,

    n.project_id,
    p.title as project_title,

    n.conversation_id,
    n.message_id,
    n.join_request_id
  from public.notifications n
  left join public.profiles actor
    on actor.id = n.actor_id
  left join public.projects p
    on p.id = n.project_id
  where n.recipient_id = auth.uid()
    and n.notification_type not in ('friend_message','chat_message')
    and coalesce(n.metadata->>'message_event','')<>'activity_comment'
    and not(n.notification_type='join_request' and n.title='Discussão da atividade')
    and (
      p_only_unread = false
      or n.read_at is null
    )
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_unread_notifications_count()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::integer
  from public.notifications n
  where n.recipient_id = auth.uid()
    and n.notification_type not in ('friend_message','chat_message')
    and coalesce(n.metadata->>'message_event','')<>'activity_comment'
    and not(n.notification_type='join_request' and n.title='Discussão da atividade')
    and n.read_at is null;
$function$
;
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer;
begin
  update public.notifications
  set read_at = now()
  where recipient_id = auth.uid() and notification_type not in ('friend_message','chat_message') and coalesce(metadata->>'message_event','')<>'activity_comment' and not(notification_type='join_request' and title='Discussão da atividade')
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_my_chat_projects()
 RETURNS TABLE(project_id uuid, project_title text, project_slug text, project_category text, my_role text, conversation_count bigint, unread_count bigint, last_message text, last_message_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  return query
  select
    p.id as project_id,
    p.title as project_title,
    p.slug as project_slug,
    p.category as project_category,
    pm.role as my_role,

    count(distinct c.id) as conversation_count,

    coalesce(count(m_unread.id), 0) as unread_count,

    lm.content as last_message,
    lm.created_at as last_message_at

  from public.project_members pm
  join public.projects p
    on p.id = pm.project_id

  left join public.project_conversation_members cm_me
    on cm_me.user_id = v_user_id

  left join public.project_conversations c
    on c.id = cm_me.conversation_id
   and c.project_id = p.id
   and c.status = 'active'

  left join public.project_messages m_unread
    on m_unread.conversation_id = c.id
   and m_unread.status = 'visible'
   and m_unread.sender_id <> v_user_id
   and m_unread.created_at > coalesce(cm_me.last_read_at, '1970-01-01'::timestamptz)

  left join lateral (
    select
      m.content,
      m.created_at
    from public.project_messages m
    join public.project_conversations c2
      on c2.id = m.conversation_id
    join public.project_conversation_members cm2
      on cm2.conversation_id = c2.id
     and cm2.user_id = v_user_id
    where c2.project_id = p.id
      and c2.status = 'active'
      and m.status = 'visible'
    order by m.created_at desc
    limit 1
  ) lm on true

  where pm.user_id = v_user_id
    and pm.status = 'active' and p.status in ('open','in_progress')

  group by
    p.id,
    p.title,
    p.slug,
    p.category,
    pm.role,
    lm.content,
    lm.created_at

  order by
    coalesce(lm.created_at, p.created_at) desc;
end;
$function$
;
CREATE OR REPLACE FUNCTION workspace_private.project_navigation(p_offset integer, p_current text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); start_at integer:=greatest(0,least(coalesce(p_offset,0),100000));result jsonb;
begin
 if actor is null then raise exception 'Autenticação necessária.' using errcode='42501';end if;
 with linked as materialized (
  select id from public.projects where owner_id=actor
  union select project_id from public.project_members where user_id=actor and status='active'
 ), allowed as materialized (
  select p.id,p.slug,p.title from linked l join public.projects p on p.id=l.id
  where p.status in ('open','in_progress') and ((p.visibility='public' and p.status<>'archived') or public.is_project_leader(p.id))
 ), page as(select * from allowed order by lower(title),id limit 26 offset start_at)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by lower(title),id) from(select * from page order by lower(title),id limit 25)p),'[]'),
  'has_more',(select count(*)>25 from page),'current',(select to_jsonb(p) from allowed p where slug=p_current or id::text=p_current limit 1)) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.get_my_space(p_options jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'Entre na sua conta para acessar Meu Espaço.'; end if;
 if jsonb_typeof(p_options) is distinct from 'object' or length(coalesce(p_options->>'search',''))>120 or
 coalesce(p_options->>'projects','all') not in ('all','created','participating') or
 coalesce(p_options->>'project_status','all') not in ('all','active','closed') or
 coalesce(p_options->>'tasks','all') not in ('all','doing','review','late') or
 coalesce(p_options->>'applications','all') not in ('all','pending','approved','rejected','canceled','closed') then raise exception 'Filtros inválidos.'; end if;
 if exists(select 1 from jsonb_each_text(p_options) e where e.key in ('project_offset','task_offset','application_offset','review_offset') and
 (e.value !~ '^\d{1,7}$' or e.value::numeric>1000000)) then raise exception 'Página inválida.'; end if;
 with linked as materialized (
  select id from public.projects where owner_id=actor
  union select project_id from public.project_members where user_id=actor and status='active'
 ), mine as materialized (
  select p.id,p.slug,p.title,p.short_description,p.category,p.status,p.visibility,p.updated_at,p.project_context,
   p.closed_at,p.owner_id=actor as created,m.user_id is not null as participating,r.level,m.display_role,
   public.is_project_join_manager(p.id) as manager,
   ((p.visibility='public' and p.status<>'archived') or public.is_project_join_manager(p.id) or p.status in ('completed','archived')) as page_access,
   rp.id as period_id,rp.name as period_name
  from linked l join public.projects p on p.id=l.id
  left join public.project_members m on m.project_id=p.id and m.user_id=actor and m.status='active'
  left join public.project_recruitment_roles r on r.project_id=m.project_id and r.user_id=m.user_id
  left join public.activity_periods rp on rp.project_id=p.id and rp.is_active
  where p.owner_id=actor or m.user_id is not null
 ), filtered_projects as materialized (
  select * from mine where
   (coalesce(p_options->>'projects','all')='all' or (p_options->>'projects'='created' and created) or (p_options->>'projects'='participating' and participating)) and
   (coalesce(p_options->>'project_status','all')='all' or (p_options->>'project_status'='active' and status in ('open','in_progress')) or (p_options->>'project_status'='closed' and status in ('completed','archived'))) and
   position(lower(coalesce(p_options->>'search','')) in lower(title))>0
 ), task_scope as materialized (
  select t.id,t.project_id,t.title,t.priority,t.due_at,t.period_id,rp.name as period_name,s.kind,s.name as stage_name,
   p.title as project_title,p.slug,
   actor=any(t.assignees) as assigned,
   s.kind='review' and (p.manager or (t.reviewer_id=actor and p.level='reviewer')) as reviewable
  from public.activity_tasks t join mine p on p.id=t.project_id
  join public.activity_stages s on s.id=t.stage_id and s.project_id=t.project_id
  left join public.activity_periods rp on rp.id=t.period_id and rp.project_id=t.project_id
  where p.status in ('open','in_progress') and public.can_use_activities(p.id) and s.kind<>'done' and
   (rp.is_active or (t.period_id is null and not exists(select 1 from public.activity_periods where project_id=p.id))) and
   (actor=any(t.assignees) or (s.kind='review' and (p.manager or (t.reviewer_id=actor and p.level='reviewer'))))
 ), filtered_tasks as materialized (
  select * from task_scope where assigned and (coalesce(p_options->>'tasks','all')='all' or
   p_options->>'tasks'=kind or (p_options->>'tasks'='late' and due_at<now()))
 ), own_applications as materialized (
  select j.id,j.project_id,j.created_at,j.decided_at,p.title as project_title,p.slug,
   case when j.status='pending' and j.recruitment_review_started_at is not null then 'review' else j.status end as status,
   j.decision_reason,((p.visibility='public' and p.status<>'archived') or public.is_project_join_manager(p.id)) as page_access
  from public.join_requests j join public.projects p on p.id=j.project_id where j.user_id=actor
 ), filtered_applications as materialized (
  select * from own_applications where coalesce(p_options->>'applications','all')='all' or
   p_options->>'applications'=status or (p_options->>'applications'='pending' and status='review')
 )
 select jsonb_build_object('as_of',now(),
  'counts',jsonb_build_object('projects',(select count(*) from mine where status in ('open','in_progress')),
   'tasks',(select count(*) from task_scope where assigned),'applications',(select count(*) from own_applications where status in ('pending','review')),
   'reviews',(select count(*) from task_scope where reviewable)),
  'project_total',(select count(*) from filtered_projects),
  'projects',coalesce((select jsonb_agg(to_jsonb(p)-'manager'||jsonb_build_object('modules',
    array(select tool from unnest(public.get_workspace_modules(p.id)) tool where
     (tool='activities' and public.can_use_activities(p.id)) or
     (tool='reports' and report_private.can_access(p.id)) or
     (tool='github' and p.page_access and public.github_can_view_repository(p.id,'team')) or
     (tool='support' and p.page_access and public.support_can_access_project(p.id)))) order by p.updated_at desc,p.id)
    from (select * from filtered_projects order by updated_at desc,id limit 12 offset coalesce((p_options->>'project_offset')::int,0)) p),'[]'::jsonb),
  'task_total',(select count(*) from filtered_tasks),
  'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.rank,t.due_at nulls last,t.id) from
   (select *,case when due_at<now() then 0 when due_at<=now()+interval '3 days' then 1 when kind='todo' then 2 when kind='doing' then 3 else 4 end as rank
    from filtered_tasks order by rank,due_at nulls last,id limit 10 offset coalesce((p_options->>'task_offset')::int,0)) t),'[]'::jsonb),
  'review_total',(select count(*) from task_scope where reviewable),
  'reviews',coalesce((select jsonb_agg(to_jsonb(t) order by due_at nulls last,id) from
   (select * from task_scope where reviewable order by due_at nulls last,id limit 10 offset coalesce((p_options->>'review_offset')::int,0)) t),'[]'::jsonb),
  'attention',coalesce((select jsonb_agg(to_jsonb(t) order by due_at nulls last,id) from
   (select * from task_scope where reviewable or (assigned and due_at<now()) order by due_at nulls last,id limit 6) t),'[]'::jsonb),
  'application_total',(select count(*) from filtered_applications),
  'applications',coalesce((select jsonb_agg(to_jsonb(j)||jsonb_build_object('vacancies',
   coalesce((select jsonb_agg(jsonb_build_object('id',x.vacancy_id,'title',x.requested_title,'approved',x.approved_at is not null,'rejected',x.rejected_at is not null) order by x.requested_title,x.vacancy_id)
   from public.join_request_vacancies x where x.request_id=j.id),'[]'::jsonb)) order by j.created_at desc,j.id)
   from (select * from filtered_applications order by created_at desc,id limit 10 offset coalesce((p_options->>'application_offset')::int,0)) j),'[]'::jsonb)
 ) into result;
 return result;
end $function$
;
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
      status = case when p_status in ('completed','archived') then status else p_status end, visibility = p_visibility
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
  if p_project_id is not null and p_status in ('completed','archived') then update public.projects set status=p_status where id=saved.id;end if;
  return saved.slug;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.save_project_concepts(p_form jsonb, p_academic jsonb, p_tag_choices jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare f jsonb:=p_form; tags jsonb; vacancies jsonb:='[]'; v jsonb; vals jsonb; saved_slug text; wanted_status text:=p_form->>'p_status'; pid uuid:=nullif(p_form->>'p_project_id','')::uuid;
begin
 if pid is not null and wanted_status in ('completed','archived') then f:=jsonb_set(f,'{p_status}',to_jsonb((select status from public.projects where id=pid)));end if;
 tags:=concept_private.prepare('tag',pid,p_tag_choices);
 for v in select * from jsonb_array_elements(coalesce(p_form->'p_vacancies','[]')) loop
  vals:=concept_private.prepare('requirement',nullif(v->>'id','')::uuid,coalesce(v->'concept_refs','[]'));
  vacancies:=vacancies||jsonb_build_array(v||jsonb_build_object('skills',to_jsonb(concept_private.labels(vals)),'concept_refs',vals));
 end loop;
 f:=f||jsonb_build_object('p_tags',to_jsonb(concept_private.labels(tags)),'p_vacancies',vacancies);
 saved_slug:=public.save_project_form_with_academics(f,p_academic);
 select id into pid from public.projects where projects.slug=saved_slug;
 perform concept_private.apply_choices('tag',pid,tags);
 if pid is not null and wanted_status in ('completed','archived') then perform lifecycle_private.finalize(pid,wanted_status);end if;
 return saved_slug;
end $function$
;
CREATE OR REPLACE FUNCTION activity_private.dialog(p_task uuid, p_project uuid, p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.activity_tasks; p public.projects; a public.activity_periods; manager boolean;assigned boolean;reviewer boolean;level text;assigner uuid;detail jsonb;
begin
 if auth.uid() is null then raise exception 'Acesso indisponível.';end if;
 select * into t from public.activity_tasks where id=p_task;
 if not found then raise exception 'Atividade indisponível.';end if;
 select * into p from public.projects where id=t.project_id;
 if (p_project is null and nullif(p_slug,'') is null) or (p_project is not null and p.id<>p_project) or (nullif(p_slug,'') is not null and p.slug<>p_slug)
   or not public.can_use_activities(p.id) then raise exception 'Atividade indisponível.';end if;
 select * into a from public.activity_periods where id=t.period_id and project_id=p.id;
 manager:=public.is_project_join_manager(p.id);assigned:=auth.uid()=any(t.assignees);
 select r.level into level from public.project_recruitment_roles r join public.project_members m using(project_id,user_id) where r.project_id=p.id and r.user_id=auth.uid() and m.status='active';
 reviewer:=manager or (t.reviewer_id=auth.uid() and level='reviewer');
 -- Only trustworthy assignment audit records; never infer the creator from the current leader.
 select h.actor_id into assigner from public.activity_history h where h.project_id=p.id and h.task_id=t.id and h.action='save_task'
  and jsonb_typeof(h.details->'input'->'assignees')='array'
  and (select array_agg(u order by u) from jsonb_array_elements_text(coalesce(h.details->'before'->'assignees','[]'))u)
      is distinct from (select array_agg(u order by u) from jsonb_array_elements_text(h.details->'input'->'assignees')u) order by h.id desc limit 1;
 detail:=public.get_activity_details(p.id,t.id,null);
 return jsonb_build_object(
  'project',jsonb_build_object('id',p.id,'slug',p.slug,'title',p.title),'manager',manager,
  'projectReadOnly',p.status in ('completed','archived'),'selectedPeriod',t.period_id,'readOnly',not coalesce(a.is_active,false) or p.status in ('completed','archived'),'periods',jsonb_build_array(to_jsonb(a)),
  'tasks',jsonb_build_array(to_jsonb(t)),
  'stages',(select coalesce(jsonb_agg(s order by position,id),'[]') from public.activity_stages s where project_id=p.id),
  'goals',(select coalesce(jsonb_agg(g order by title,id),'[]') from public.activity_goals g where project_id=p.id and (manager and period_id=t.period_id or id=t.goal_id)),
  'checklist',(select coalesce(jsonb_agg(c order by created_at,id),'[]') from public.activity_checklist c where task_id=t.id),
  'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',pr.full_name,'avatar',pr.avatar_url,'level',coalesce(r.level,'member')) order by pr.full_name,m.user_id),'[]')
   from public.project_members m join public.profiles pr on pr.id=m.user_id left join public.project_recruitment_roles r using(project_id,user_id)
   where m.project_id=p.id and m.status='active' and (manager or m.user_id=any(t.assignees) or m.user_id=t.reviewer_id or m.user_id=assigner)),
  'assigned_by',(select jsonb_build_object('id',pr.id,'name',pr.full_name,'avatar',pr.avatar_url) from public.profiles pr where pr.id=assigner),
  'permissions',jsonb_build_object('move',manager or assigned,'review',coalesce(reviewer,false),'comment',manager or assigned or coalesce(level='reviewer',false),'check',manager or assigned),
  'details',detail);
end $function$
;
CREATE OR REPLACE FUNCTION activity_private.center(p_options jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid();opts jsonb:=coalesce(p_options,'{}'); result jsonb; page_offset integer;
begin
 if actor is null then raise exception 'Autenticação necessária.';end if;
 if jsonb_typeof(opts)<>'object' or length(coalesce(opts->>'search',''))>160 then raise exception 'Filtros inválidos.';end if;
 if coalesce(opts->>'offset','0') !~ '^\d{1,6}$' then raise exception 'Página inválida.';end if;
 page_offset:=least(coalesce((opts->>'offset')::integer,0),100000);
 if coalesce(opts->>'status','pending') not in ('all','pending','todo','doing','review','done','mine_review')
  or coalesce(opts->>'priority','all') not in ('all','low','medium','high','urgent')
  or coalesce(opts->>'deadline','all') not in ('all','late','soon') then raise exception 'Filtros inválidos.';end if;
 with linked as materialized (
  select m.project_id,m.user_id,r.level from public.project_members m left join public.project_recruitment_roles r using(project_id,user_id)
  where m.user_id=actor and m.status='active' and public.can_use_activities(m.project_id)
 ), scope as materialized (
  select t.id,t.project_id,t.title,t.priority,t.due_at,t.period_id,a.name as period_name,s.kind,s.name as stage_name,p.title as project_title,p.slug,
   actor=any(t.assignees) as assigned,
   s.kind='review' and (public.is_project_join_manager(p.id) or (t.reviewer_id=actor and l.level='reviewer')) as reviewable
  from linked l join public.projects p on p.id=l.project_id join public.activity_tasks t on t.project_id=p.id
  join public.activity_stages s on s.id=t.stage_id and s.project_id=p.id join public.activity_periods a on a.id=t.period_id and a.project_id=p.id and a.is_active
  where p.status in ('open','in_progress') and (actor=any(t.assignees) or (s.kind='review' and (public.is_project_join_manager(p.id) or (t.reviewer_id=actor and l.level='reviewer'))))
 ), filtered as materialized (
  select * from scope where (nullif(opts->>'project','') is null or project_id::text=opts->>'project')
   and position(lower(coalesce(opts->>'search','')) in lower(title))>0
   and (coalesce(opts->>'status','pending')='all' or (coalesce(opts->>'status','pending')='pending' and kind<>'done') or opts->>'status'=kind or (opts->>'status'='mine_review' and reviewable))
   and (coalesce(opts->>'priority','all')='all' or priority=opts->>'priority')
   and (coalesce(opts->>'deadline','all')='all' or (opts->>'deadline'='late' and kind<>'done' and due_at<now()) or (opts->>'deadline'='soon' and kind<>'done' and due_at between now() and now()+interval '3 days'))
 ), ranked as (
  select *,case when kind<>'done' and due_at<now() then 0 when kind<>'done' and due_at<=now()+interval '3 days' then 1 when kind='done' then 3 else 2 end as urgency,
    case priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end as importance from filtered
 ), page as materialized(select * from ranked order by urgency,due_at nulls last,importance,id limit 25 offset page_offset)
 select jsonb_build_object('as_of',now(),'total',(select count(*) from filtered),
  'counts',jsonb_build_object('pending',(select count(*) from scope where kind<>'done'),'doing',(select count(*) from scope where kind='doing'),'late',(select count(*) from scope where kind<>'done' and due_at<now()),'reviews',(select count(*) from scope where reviewable)),
  'projects',coalesce((select jsonb_agg(jsonb_build_object('id',project_id,'title',project_title) order by project_title,project_id) from(select distinct project_id,project_title from scope)x),'[]'),
  'groups',coalesce((select jsonb_agg(to_jsonb(g) order by title,id) from (select project_id as id,project_title as title,count(*) as total,count(*) filter(where kind<>'done') as pending,count(*) filter(where kind<>'done' and due_at<now()) as late from filtered group by project_id,project_title)g),'[]'),
  'items',coalesce((select jsonb_agg(to_jsonb(t)-'urgency'-'importance'||jsonb_build_object('checklist_total',(select count(*) from public.activity_checklist c where c.task_id=t.id),'checklist_done',(select count(*) from public.activity_checklist c where c.task_id=t.id and c.done)) order by urgency,due_at nulls last,importance,id) from page t),'[]')) into result;
 return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.get_activity_workspace(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects%rowtype;
begin
 select * into p from public.projects where slug=p_slug;
 if not found or not public.can_use_activities(p.id) then raise exception 'Acesso indisponível para este módulo.'; end if;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug),
 'projectReadOnly',p.status in ('completed','archived'),'manager',public.is_project_join_manager(p.id),
 'periods',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object(
 'task_count',(select count(*) from public.activity_tasks where period_id=r.id),
 'goal_count',(select count(*) from public.activity_goals where period_id=r.id)) order by r.is_active desc,r.created_at desc,r.id),'[]') from public.activity_periods r where r.project_id=p.id),
 'stages',(select coalesce(jsonb_agg(s order by position,id),'[]') from public.activity_stages s where project_id=p.id),
 'tasks',(select coalesce(jsonb_agg(t order by created_at,id),'[]') from public.activity_tasks t where project_id=p.id),
 'goals',(select coalesce(jsonb_agg(g order by title,id),'[]') from public.activity_goals g where project_id=p.id),
 'checklist',(select coalesce(jsonb_agg(c order by c.created_at,c.id),'[]') from public.activity_checklist c join public.activity_tasks t on t.id=c.task_id where t.project_id=p.id),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',pr.full_name,'avatar',pr.avatar_url,'level',coalesce(r.level,'member')) order by pr.full_name,m.user_id),'[]')
   from public.project_members m join public.profiles pr on pr.id=m.user_id
   left join public.project_recruitment_roles r using(project_id,user_id) where m.project_id=p.id and m.status='active'));
end;
$function$
;
CREATE OR REPLACE FUNCTION public.get_report_workspace(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.projects; begin
 select * into p from public.projects where slug=p_slug;
 if p.id is null or not report_private.can_access(p.id) then raise exception 'Funcionalidade indisponível ou acesso negado'; end if;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug),'projectReadOnly',p.status in ('completed','archived'),'manager',public.is_project_join_manager(p.id),
 'reviewer',exists(select 1 from public.project_recruitment_roles where project_id=p.id and user_id=auth.uid() and level='reviewer'),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',pr.full_name)) from public.project_members m left join public.profiles pr on pr.id=m.user_id where m.project_id=p.id and m.status='active'),'[]'::jsonb),
 'documents',coalesce((select jsonb_agg((to_jsonb(d)-'body')||jsonb_build_object('document_kind',d.body->>'kind','format_profile',d.body->>'profile') order by d.updated_at desc) from public.academic_documents d where d.project_id=p.id),'[]'::jsonb));
end $function$
;
create function lifecycle_private.chat_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Autenticação necessária.';end if;
 return coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('search_terms',array(
  select coalesce(c.title,case when c.kind='general' then 'Geral' else '' end) from public.project_conversations c
  join public.project_conversation_members m on m.conversation_id=c.id and m.user_id=auth.uid()
  where c.project_id=p.project_id and c.status='active'
 )) order by p.last_message_at desc nulls last,p.project_title,p.project_id) from public.get_my_chat_projects()p),'[]');
end $$;
create function public.get_my_chat_directory() returns jsonb language sql stable security invoker set search_path='' as $$select lifecycle_private.chat_directory()$$;
revoke all on function lifecycle_private.chat_directory(),public.get_my_chat_directory() from public,anon,authenticated;
grant execute on function lifecycle_private.chat_directory(),public.get_my_chat_directory() to authenticated;
