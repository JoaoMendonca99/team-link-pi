-- Activities are intrinsic to a project; optional activation records remain intact.
create or replace function public.can_use_activities(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active');
$$;
create or replace function public.get_workspace_modules(p_project uuid) returns text[] language sql stable security definer set search_path='' as $$
 select case when public.can_use_activities(p_project) then array['activities'] || array(
   select module from public.project_workspace_modules where project_id=p_project and module<>'activities' order by module) else '{}'::text[] end;
$$;
create or replace function public.set_workspace_module(p_project uuid,p_module text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.projects where id=p_project for update;
 if not found or not public.is_project_join_manager(p_project) then raise exception 'Acesso negado'; end if;
 if p_module='activities' then
   if p_active is true then return; end if;
   raise exception 'Controle de Atividades é uma funcionalidade obrigatória.';
 end if;
 if p_module is null or p_module not in ('github','support') or p_active is null then raise exception 'Funcionalidade inválida'; end if;
 if p_active then insert into public.project_workspace_modules values(p_project,p_module) on conflict do nothing;
 else delete from public.project_workspace_modules where project_id=p_project and module=p_module; end if;
end;
$$;
create function public.initialize_project_activities() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.activity_stages(project_id,name,kind,position) values
 (new.id,'A fazer','todo',0),(new.id,'Em andamento','doing',1),(new.id,'Em revisão','review',2),(new.id,'Concluído','done',3);
 return new;
end;
$$;
revoke all on function public.initialize_project_activities() from public,anon,authenticated;
create trigger initialize_project_activities after insert on public.projects for each row execute function public.initialize_project_activities();
insert into public.activity_stages(project_id,name,kind,position)
 select p.id,s.name,s.kind,s.position from public.projects p cross join (values
 ('A fazer','todo',0),('Em andamento','doing',1),('Em revisão','review',2),('Concluído','done',3)) s(name,kind,position)
 where not exists(select 1 from public.activity_stages where project_id=p.id);

create table public.project_panel_presence(
 project_id uuid not null references public.projects on delete cascade,
 user_id uuid not null references public.profiles on delete cascade,
 last_active_at timestamptz not null, written_at timestamptz not null default clock_timestamp(),
 primary key(project_id,user_id)
);
alter table public.project_panel_presence enable row level security;
revoke all on public.project_panel_presence from public,anon,authenticated;
create function public.panel_heartbeat(p_slug text,p_active_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare project uuid; stamp timestamptz:=clock_timestamp();
begin
 select id into project from public.projects where slug=p_slug;
 if project is null or not public.can_use_activities(project) then raise exception 'Acesso negado'; end if;
 if p_active_at is null or not isfinite(p_active_at) or p_active_at<stamp-interval '2 minutes' then return; end if;
 insert into public.project_panel_presence(project_id,user_id,last_active_at,written_at)
 values(project,auth.uid(),least(p_active_at,stamp),stamp)
 on conflict(project_id,user_id) do update set last_active_at=greatest(project_panel_presence.last_active_at,excluded.last_active_at),written_at=stamp
 where project_panel_presence.written_at<=stamp-interval '55 seconds' and project_panel_presence.last_active_at<excluded.last_active_at;
end;
$$;
create function public.get_project_panel_summary(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare states jsonb; goals jsonb; people jsonb;
begin
 if not public.can_use_activities(p_project) then raise exception 'Acesso negado'; end if;
 select jsonb_build_object('todo',count(*) filter(where s.kind='todo'),'doing',count(*) filter(where s.kind='doing'),
 'review',count(*) filter(where s.kind='review'),'done',count(*) filter(where s.kind='done')) into states
 from public.activity_tasks t join public.activity_stages s on s.id=t.stage_id where t.project_id=p_project;
 select jsonb_build_object('done',count(*) filter(where total>0 and actual>=total),
 'doing',count(*) filter(where actual>0 and actual<total),'pending',count(*) filter(where actual=0),
 'late',count(*) filter(where due_at<now() and not(total>0 and actual>=total))) into goals
 from (select g.due_at,case when g.kind='numeric' then g.target else count(t.id) end as total,
 case when g.kind='numeric' then g.actual else count(t.id) filter(where s.kind='done') end as actual
 from public.activity_goals g left join public.activity_tasks t on t.goal_id=g.id and t.project_id=g.project_id
 left join public.activity_stages s on s.id=t.stage_id where g.project_id=p_project group by g.id) progress;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.full_name,'avatar',p.avatar_url,
 'role',m.display_role,'level',coalesce(r.level,'member'),'last_active_at',v.last_active_at)),'[]') into people
 from public.project_members m join public.profiles p on p.id=m.user_id
 left join public.project_recruitment_roles r using(project_id,user_id)
 left join public.project_panel_presence v using(project_id,user_id) where m.project_id=p_project and m.status='active';
 return jsonb_build_object('states',states,'goals',goals,'members',people,'as_of',now());
end;
$$;
revoke all on function public.panel_heartbeat(text,timestamptz),public.get_project_panel_summary(uuid) from public,anon,authenticated;
grant execute on function public.panel_heartbeat(text,timestamptz),public.get_project_panel_summary(uuid) to authenticated;

create table public.activity_deadline_deliveries(
 project_id uuid not null references public.projects on delete cascade,
 item_kind text not null check(item_kind in ('task','goal')), item_id uuid not null, due_at timestamptz not null,
 event text not null check(event in ('soon','late')), recipient_id uuid not null references public.profiles on delete cascade,
 sent_at timestamptz not null default now(), primary key(item_kind,item_id,due_at,event,recipient_id)
);
alter table public.activity_deadline_deliveries enable row level security;
revoke all on public.activity_deadline_deliveries from public,anon,authenticated;
create index activity_tasks_due on public.activity_tasks(due_at,project_id) where due_at is not null;
create index activity_goals_due on public.activity_goals(due_at,project_id) where due_at is not null;
create function public.dispatch_activity_deadlines() returns integer language plpgsql security definer set search_path='' as $$
declare p record; item record; delivered integer:=0; stamp timestamptz:=clock_timestamp(); event_name text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('team-link-activity-deadlines',0)) then return 0; end if;
 for p in select id,slug from public.projects where id in (
   select project_id from public.activity_tasks where due_at<=stamp+interval '24 hours'
   union select project_id from public.activity_goals where due_at<=stamp+interval '24 hours') order by id for update loop
   for item in
     select 'task'::text as kind,t.id,t.due_at,u.recipient from public.activity_tasks t
       join public.activity_stages s on s.id=t.stage_id cross join lateral unnest(t.assignees) u(recipient)
       where t.project_id=p.id and t.due_at<=stamp+interval '24 hours' and s.kind<>'done'
     union
     select 'goal',g.id,g.due_at,u.recipient from public.activity_goals g cross join lateral unnest(g.owners) u(recipient)
       where g.project_id=p.id and g.due_at<=stamp+interval '24 hours' and (
       (g.kind='numeric' and g.actual<g.target) or (g.kind='tasks' and (
         not exists(select 1 from public.activity_tasks t where t.goal_id=g.id)
         or exists(select 1 from public.activity_tasks t join public.activity_stages s on s.id=t.stage_id where t.goal_id=g.id and s.kind<>'done'))))
   loop
     if not exists(select 1 from public.project_members m where m.project_id=p.id and m.user_id=item.recipient and m.status='active') then continue; end if;
     event_name:=case when item.due_at<=stamp then 'late' else 'soon' end;
     insert into public.activity_deadline_deliveries(project_id,item_kind,item_id,due_at,event,recipient_id)
     values(p.id,item.kind,item.id,item.due_at,event_name,item.recipient) on conflict do nothing;
     if found then
       insert into public.notifications(recipient_id,project_id,notification_type,title,body,href)
       values(item.recipient,p.id,'join_request',
        case when item.kind='task' then 'Prazo de atividade' else 'Prazo de meta' end,
        case when event_name='late' then 'O prazo terminou. Abra o item para acompanhar a entrega.' else 'O prazo termina nas próximas 24 horas.' end,
        '/projetos/'||p.slug||'/painel/atividades?'||case when item.kind='task' then 'atividade' else 'meta' end||'='||item.id);
       delivered:=delivered+1;
     end if;
   end loop;
 end loop;
 return delivered;
exception when others then
 raise warning 'Activity deadline dispatcher failed (SQLSTATE %)',SQLSTATE;
 raise exception 'Não foi possível processar os avisos de prazo.';
end;
$$;
revoke all on function public.dispatch_activity_deadlines() from public,anon,authenticated,service_role;

-- Scheduled on the database, independent of browser sessions. Timestamps are UTC
-- instants from the existing datetime-local forms; no implicit date truncation.
create extension if not exists pg_cron;
select cron.schedule('team-link-activity-deadlines','*/5 * * * *','select public.dispatch_activity_deadlines()');
