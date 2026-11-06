-- One bounded read API for the personal hub. No tables, policies or records change.
-- auth.uid() is the only user selector. Existing helpers remain the authority for
-- tools/reviews; no private table is exposed to the browser to assemble the hub.
create function public.get_my_space(p_options jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); result jsonb;
begin
 if actor is null then raise exception 'Entre na sua conta para acessar Meu Espaço.'; end if;
 if jsonb_typeof(p_options) is distinct from 'object' or length(coalesce(p_options->>'search',''))>120 or
 coalesce(p_options->>'projects','all') not in ('all','created','participating') or
 coalesce(p_options->>'project_status','all') not in ('all','active','closed') or
 coalesce(p_options->>'tasks','all') not in ('all','doing','review','late') or
 coalesce(p_options->>'applications','all') not in ('all','pending','approved','rejected','canceled') then raise exception 'Filtros inválidos.'; end if;
 if exists(select 1 from jsonb_each_text(p_options) e where e.key in ('project_offset','task_offset','application_offset','review_offset') and
 (e.value !~ '^\d{1,7}$' or e.value::numeric>1000000)) then raise exception 'Página inválida.'; end if;
 with linked as materialized (
  select id from public.projects where owner_id=actor
  union select project_id from public.project_members where user_id=actor and status='active'
 ), mine as materialized (
  select p.id,p.slug,p.title,p.short_description,p.category,p.status,p.visibility,p.updated_at,p.project_context,
   p.owner_id=actor as created,m.user_id is not null as participating,r.level,m.display_role,
   public.is_project_join_manager(p.id) as manager,
   ((p.visibility='public' and p.status<>'archived') or public.is_project_join_manager(p.id)) as page_access,
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
  where public.can_use_activities(p.id) and s.kind<>'done' and
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
end $$;
revoke all on function public.get_my_space(jsonb) from public,anon;
grant execute on function public.get_my_space(jsonb) to authenticated;
