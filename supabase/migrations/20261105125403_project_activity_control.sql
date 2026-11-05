alter table public.project_workspace_modules drop constraint project_workspace_modules_module_check;
alter table public.project_workspace_modules add constraint project_workspace_modules_module_check check (module in ('github','support','activities'));
create or replace function public.set_workspace_module(p_project uuid,p_module text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.projects where id=p_project for update;
  if not found or not public.is_project_join_manager(p_project) then raise exception 'Acesso negado'; end if;
  if p_module is null or p_module not in ('github','support','activities') or p_active is null then raise exception 'Funcionalidade inválida'; end if;
  if p_active then insert into public.project_workspace_modules values(p_project,p_module) on conflict do nothing;
  else delete from public.project_workspace_modules where project_id=p_project and module=p_module; end if;
end;
$$;

create table public.activity_stages(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 name text not null check(char_length(btrim(name)) between 1 and 100),
 kind text not null check(kind in ('todo','doing','review','done')), position integer not null,
 version integer not null default 1, unique(project_id,id)
);
create index activity_stages_project on public.activity_stages(project_id,position,id);
create table public.activity_goals(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 160), description text not null default '' check(char_length(description)<=8000),
 due_at timestamptz check(due_at is null or isfinite(due_at)), owners uuid[] not null default '{}', kind text not null check(kind in ('tasks','numeric')),
 target numeric not null default 1 check(target>0 and target not in ('NaN'::numeric,'Infinity'::numeric)),
 actual numeric not null default 0 check(actual>=0 and actual not in ('NaN'::numeric,'Infinity'::numeric)),
 unit text not null default '' check(char_length(unit)<=80), version integer not null default 1,
 unique(project_id,id)
);
create index activity_goals_project on public.activity_goals(project_id);
create table public.activity_tasks(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 160), description text not null default '' check(char_length(description)<=8000),
 stage_id uuid not null, assignees uuid[] not null default '{}', due_at timestamptz check(due_at is null or isfinite(due_at)),
 priority text not null default 'medium' check(priority in ('low','medium','high','urgent')),
 goal_id uuid, reviewer_id uuid references public.profiles on delete set null,
 requires_review boolean not null default false, version integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(project_id,stage_id) references public.activity_stages(project_id,id),
 foreign key(project_id,goal_id) references public.activity_goals(project_id,id)
);
create index activity_tasks_project on public.activity_tasks(project_id,created_at,id);
create index activity_tasks_goal on public.activity_tasks(project_id,goal_id);
create index activity_tasks_assignees on public.activity_tasks using gin(assignees);
create table public.activity_checklist(
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.activity_tasks on delete cascade,
 label text not null check(char_length(btrim(label)) between 1 and 300), done boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default now()
);
create index activity_checklist_task on public.activity_checklist(task_id,created_at,id);
create table public.activity_comments(
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.activity_tasks on delete cascade,
 author_id uuid references public.profiles on delete set null, body text not null check(char_length(btrim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index activity_comments_task on public.activity_comments(task_id,created_at,id);
create table public.activity_history(
 id bigint generated always as identity primary key, project_id uuid not null references public.projects on delete cascade,
 task_id uuid, goal_id uuid, actor_id uuid references public.profiles on delete set null,
 action text not null, details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index activity_history_task on public.activity_history(project_id,task_id,id);
create index activity_history_goal on public.activity_history(project_id,goal_id,id);
create table public.activity_updates(
 project_id uuid primary key references public.projects on delete cascade, changed_at timestamptz not null default clock_timestamp()
);

create function public.can_use_activities(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.workspace_module_active(p_project,'activities') and exists(
   select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active');
$$;
revoke all on function public.can_use_activities(uuid) from public,anon;
grant execute on function public.can_use_activities(uuid) to authenticated;

do $$
declare t text;
begin
 foreach t in array array['activity_stages','activity_goals','activity_tasks','activity_checklist','activity_comments','activity_history','activity_updates'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
grant select on public.activity_updates to authenticated;
create policy activity_updates_team on public.activity_updates for select to authenticated using(public.can_use_activities(project_id));
alter publication supabase_realtime add table public.activity_updates;

create function public.initialize_activities() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.module='activities' and not exists(select 1 from public.activity_stages where project_id=new.project_id) then
   insert into public.activity_stages(project_id,name,kind,position) values
    (new.project_id,'A fazer','todo',0),(new.project_id,'Em andamento','doing',1),
    (new.project_id,'Em revisão','review',2),(new.project_id,'Concluído','done',3);
 end if;
 return new;
end;
$$;
revoke all on function public.initialize_activities() from public,anon,authenticated;
create trigger initialize_activities after insert on public.project_workspace_modules for each row execute function public.initialize_activities();

create function public.activity_people_valid(p_project uuid,p_people uuid[],p_reviewer uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select cardinality(p_people)<=100 and not exists(
   select 1 from unnest(p_people) u where u is null or not exists(
    select 1 from public.project_members m where m.project_id=p_project and m.user_id=u and m.status='active'))
 and (p_reviewer is null or exists(select 1 from public.project_members m
   left join public.project_recruitment_roles r using(project_id,user_id)
   where m.project_id=p_project and m.user_id=p_reviewer and m.status='active' and r.level in ('owner','manager','reviewer')));
$$;
revoke all on function public.activity_people_valid(uuid,uuid[],uuid) from public,anon,authenticated;

create function public.get_activity_workspace(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.projects%rowtype;
begin
 select * into p from public.projects where slug=p_slug;
 if not found or not public.can_use_activities(p.id) then raise exception 'Acesso indisponível para este módulo.'; end if;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug),
 'manager',public.is_project_join_manager(p.id),
 'stages',(select coalesce(jsonb_agg(s order by position,id),'[]') from public.activity_stages s where project_id=p.id),
 'tasks',(select coalesce(jsonb_agg(t order by created_at,id),'[]') from public.activity_tasks t where project_id=p.id),
 'goals',(select coalesce(jsonb_agg(g order by title,id),'[]') from public.activity_goals g where project_id=p.id),
 'checklist',(select coalesce(jsonb_agg(c order by c.created_at,c.id),'[]') from public.activity_checklist c join public.activity_tasks t on t.id=c.task_id where t.project_id=p.id),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',pr.full_name,'avatar',pr.avatar_url,'level',coalesce(r.level,'member')) order by pr.full_name,m.user_id),'[]')
   from public.project_members m join public.profiles pr on pr.id=m.user_id
   left join public.project_recruitment_roles r using(project_id,user_id) where m.project_id=p.id and m.status='active'));
end;
$$;

create function public.get_activity_details(p_project uuid,p_task uuid default null,p_goal uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_use_activities(p_project) then raise exception 'Acesso negado'; end if;
 return jsonb_build_object(
  'comments',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'author_id',c.author_id,'name',p.full_name,'avatar',p.avatar_url,'body',c.body,'created_at',c.created_at) order by c.created_at,c.id),'[]')
    from public.activity_comments c join public.activity_tasks t on t.id=c.task_id left join public.profiles p on p.id=c.author_id
    where t.project_id=p_project and t.id=p_task),
  'history',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',p.full_name,'action',h.action,'details',h.details,'created_at',h.created_at) order by h.id),'[]')
    from public.activity_history h left join public.profiles p on p.id=h.actor_id
    where h.project_id=p_project and ((p_task is not null and h.task_id=p_task) or (p_goal is not null and h.goal_id=p_goal))));
end;
$$;

create function public.mutate_activity(p_project uuid,p_action text,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 manager boolean; actor uuid:=auth.uid(); id uuid:=nullif(p_data->>'id','')::uuid;
 task public.activity_tasks%rowtype; goal public.activity_goals%rowtype; stage public.activity_stages%rowtype;
 target public.activity_stages%rowtype; people uuid[]; reviewer uuid; before_state jsonb;
 result uuid; affected_task uuid; affected_goal uuid; can_review boolean; reason text; recipients uuid[]:='{}';
begin
 -- The same project lock as activation/removal makes permission checks and writes atomic.
 perform 1 from public.projects where public.projects.id=p_project for update;
 if not found or not public.can_use_activities(p_project) then raise exception 'Acesso negado'; end if;
 manager:=public.is_project_join_manager(p_project);
 if jsonb_typeof(p_data)<>'object' then raise exception 'Dados inválidos'; end if;
 if p_action in ('save_task','save_goal','save_stage','delete_stage','delete_task','delete_goal','reorder_stages') and not manager then raise exception 'Apenas Líderes e Gestores podem realizar esta ação.'; end if;

 if p_action='save_task' then
   select * into task from public.activity_tasks where project_id=p_project and activity_tasks.id=id;
   if id is not null and (not found or task.version is distinct from (p_data->>'version')::int) then raise exception 'Atividade alterada. Recarregue antes de salvar.'; end if;
   select coalesce(array_agg(distinct u::uuid),'{}') into people from jsonb_array_elements_text(coalesce(p_data->'assignees','[]')) u;
   reviewer:=nullif(p_data->>'reviewer_id','')::uuid;
   if not public.activity_people_valid(p_project,people,reviewer) then raise exception 'Selecione integrantes ativos e um revisor autorizado.'; end if;
   select * into target from public.activity_stages where project_id=p_project and activity_stages.id=(p_data->>'stage_id')::uuid;
   if not found or (id is not null and target.id<>task.stage_id) then raise exception 'Altere o status pela ação de movimentação.'; end if;
   if id is null and target.kind='done' and coalesce((p_data->>'requires_review')::boolean,false) then raise exception 'A entrega exige aprovação antes da conclusão.'; end if;
   before_state:=case when id is null then '{}'::jsonb else to_jsonb(task) end;
   result:=coalesce(id,gen_random_uuid());
   insert into public.activity_tasks(id,project_id,title,description,stage_id,assignees,due_at,priority,goal_id,reviewer_id,requires_review)
   values(result,p_project,btrim(p_data->>'title'),coalesce(p_data->>'description',''),target.id,people,
     nullif(p_data->>'due_at','')::timestamptz,coalesce(p_data->>'priority','medium'),nullif(p_data->>'goal_id','')::uuid,reviewer,coalesce((p_data->>'requires_review')::boolean,false))
   on conflict on constraint activity_tasks_pkey do update set title=excluded.title,description=excluded.description,
     assignees=excluded.assignees,due_at=excluded.due_at,priority=excluded.priority,goal_id=excluded.goal_id,
     reviewer_id=excluded.reviewer_id,requires_review=excluded.requires_review,version=activity_tasks.version+1,updated_at=now();
   affected_task:=result;
   recipients:=people;
   if target.kind='review' then
     select coalesce(array_agg(distinct u),'{}') into recipients from unnest(people || coalesce(array[reviewer]::uuid[], '{}'::uuid[])) u where u is not null;
     if reviewer is null then
       select recipients || coalesce(array_agg(r.user_id),'{}') into recipients from public.project_recruitment_roles r
         join public.project_members m using(project_id,user_id) where r.project_id=p_project and m.status='active' and r.level in ('owner','manager');
     end if;
   end if;
 elsif p_action in ('move','approve','return','comment','checklist','delete_checklist','delete_task') then
   select * into task from public.activity_tasks where project_id=p_project and activity_tasks.id=id;
   if not found then raise exception 'Atividade indisponível'; end if;
   affected_task:=task.id; result:=task.id; before_state:=to_jsonb(task);
   can_review:=manager or (task.reviewer_id=actor and exists(select 1 from public.project_recruitment_roles r
     join public.project_members m using(project_id,user_id) where r.project_id=p_project and r.user_id=actor and m.status='active' and r.level='reviewer'));
   if not manager and not (actor=any(task.assignees)) and not (
     exists(select 1 from public.project_recruitment_roles r where r.project_id=p_project and r.user_id=actor and r.level='reviewer')
     and p_action='comment') and not (coalesce(can_review,false) and p_action in ('approve','return')) then raise exception 'Atividade não atribuída a você.'; end if;
   if p_action<>'comment' and task.version is distinct from (p_data->>'version')::int then raise exception 'Atividade alterada. Recarregue antes de continuar.'; end if;
   if p_action in ('move','approve','return') then
     select * into stage from public.activity_stages where project_id=p_project and activity_stages.id=task.stage_id;
     reason:=btrim(coalesce(p_data->>'reason',''));
     if p_action in ('approve','return') then
       if not coalesce(can_review,false) or stage.kind<>'review' then raise exception 'Revisão não autorizada'; end if;
       if p_action='return' and length(reason) not between 1 and 2000 then raise exception 'Informe a justificativa da devolução.'; end if;
       select * into target from public.activity_stages where project_id=p_project and kind=case when p_action='approve' then 'done' else 'doing' end order by position,id limit 1;
     else
       select * into target from public.activity_stages where project_id=p_project and activity_stages.id=(p_data->>'stage_id')::uuid;
       if task.requires_review and target.kind='done' and stage.kind<>'done' then raise exception 'Utilize a aprovação do revisor.'; end if;
     end if;
     if target.id is null then raise exception 'Configure uma etapa com o estado necessário.'; end if;
     if target.id=task.stage_id then return task.id; end if;
     update public.activity_tasks set stage_id=target.id,version=version+1,updated_at=now() where activity_tasks.id=task.id;
     recipients:=task.assignees;
     if target.kind='review' then
       if task.reviewer_id is not null then recipients:=array[task.reviewer_id]; else
         select coalesce(array_agg(r.user_id),'{}') into recipients from public.project_recruitment_roles r
           join public.project_members m using(project_id,user_id) where r.project_id=p_project and m.status='active' and r.level in ('owner','manager');
       end if;
     end if;
   elsif p_action='comment' then
     insert into public.activity_comments(task_id,author_id,body) values(task.id,actor,btrim(p_data->>'body'));
   elsif p_action='checklist' then
     if nullif(p_data->>'item_id','') is null then
       insert into public.activity_checklist(task_id,label) values(task.id,btrim(p_data->>'label'));
     else
       update public.activity_checklist set done=(p_data->>'done')::boolean,version=version+1
       where task_id=task.id and activity_checklist.id=(p_data->>'item_id')::uuid and version=(p_data->>'item_version')::int;
       if not found then raise exception 'Item alterado ou indisponível'; end if;
     end if;
     update public.activity_tasks set version=version+1,updated_at=now() where activity_tasks.id=task.id;
   elsif p_action='delete_checklist' then
     delete from public.activity_checklist where task_id=task.id and activity_checklist.id=(p_data->>'item_id')::uuid and version=(p_data->>'item_version')::int;
     if not found then raise exception 'Item alterado ou indisponível'; end if;
     update public.activity_tasks set version=version+1,updated_at=now() where activity_tasks.id=task.id;
   else delete from public.activity_tasks where activity_tasks.id=task.id; end if;
 elsif p_action in ('save_goal','delete_goal') then
   select * into goal from public.activity_goals where project_id=p_project and activity_goals.id=id;
   if id is not null and (not found or goal.version is distinct from (p_data->>'version')::int) then raise exception 'Meta alterada. Recarregue antes de salvar.'; end if;
   if p_action='delete_goal' then
     if id is null then raise exception 'Meta indisponível'; end if;
     update public.activity_tasks set goal_id=null,version=version+1 where project_id=p_project and goal_id=id;
     delete from public.activity_goals where activity_goals.id=id;
     result:=id;
   else
     select coalesce(array_agg(distinct u::uuid),'{}') into people from jsonb_array_elements_text(coalesce(p_data->'owners','[]')) u;
     if not public.activity_people_valid(p_project,people) then raise exception 'Responsável indisponível'; end if;
     result:=coalesce(id,gen_random_uuid());
     insert into public.activity_goals(id,project_id,title,description,due_at,owners,kind,target,actual,unit)
     values(result,p_project,btrim(p_data->>'title'),coalesce(p_data->>'description',''),nullif(p_data->>'due_at','')::timestamptz,
       people,p_data->>'kind',coalesce((p_data->>'target')::numeric,1),coalesce((p_data->>'actual')::numeric,0),coalesce(p_data->>'unit',''))
     on conflict on constraint activity_goals_pkey do update set title=excluded.title,description=excluded.description,due_at=excluded.due_at,
       owners=excluded.owners,kind=excluded.kind,target=excluded.target,actual=excluded.actual,unit=excluded.unit,version=activity_goals.version+1;
   end if;
   affected_goal:=result; before_state:=to_jsonb(goal);
 elsif p_action in ('save_stage','delete_stage') then
   select * into stage from public.activity_stages where project_id=p_project and activity_stages.id=id;
   if id is not null and (not found or stage.version is distinct from (p_data->>'version')::int) then raise exception 'Etapa alterada. Recarregue antes de salvar.'; end if;
   before_state:=to_jsonb(stage);
   if p_action='delete_stage' then
     if id is null then raise exception 'Etapa indisponível'; end if;
     if not exists(select 1 from public.activity_stages s where s.project_id=p_project and s.id<>id and s.kind=stage.kind) then raise exception 'Mantenha pelo menos uma etapa de cada estado.'; end if;
     select * into target from public.activity_stages where project_id=p_project and activity_stages.id=nullif(p_data->>'target_id','')::uuid and activity_stages.id<>id;
     if exists(select 1 from public.activity_tasks where project_id=p_project and stage_id=id) and target.id is null then raise exception 'Escolha a etapa de destino.'; end if;
     if target.kind='done' and exists(select 1 from public.activity_tasks where project_id=p_project and stage_id=id and requires_review) then raise exception 'Aprove as entregas individualmente antes de concluir.'; end if;
     insert into public.activity_history(project_id,task_id,actor_id,action,details)
       select p_project,t.id,actor,'move',jsonb_build_object('from',id,'to',target.id,'stage_removed',true)
       from public.activity_tasks t where t.project_id=p_project and t.stage_id=id;
     update public.activity_tasks set stage_id=target.id,version=version+1 where project_id=p_project and stage_id=id;
     delete from public.activity_stages where activity_stages.id=id;
     result:=id;
   else
     if id is not null and stage.kind is distinct from p_data->>'kind' and not exists(select 1 from public.activity_stages s where s.project_id=p_project and s.id<>id and s.kind=stage.kind) then raise exception 'Mantenha pelo menos uma etapa de cada estado.'; end if;
     if id is not null and stage.kind is distinct from p_data->>'kind' and exists(select 1 from public.activity_tasks where project_id=p_project and stage_id=id) then raise exception 'Mova as atividades antes de alterar o significado da etapa.'; end if;
     result:=coalesce(id,gen_random_uuid());
     insert into public.activity_stages(id,project_id,name,kind,position) values(result,p_project,btrim(p_data->>'name'),p_data->>'kind',(p_data->>'position')::int)
     on conflict on constraint activity_stages_pkey do update set name=excluded.name,kind=excluded.kind,position=excluded.position,version=activity_stages.version+1;
   end if;
 elsif p_action='reorder_stages' then
   if jsonb_array_length(p_data->'stages')<>(select count(*) from public.activity_stages where project_id=p_project)
     or (select count(distinct s.id) from jsonb_to_recordset(p_data->'stages') as s(id uuid,version int)
       join public.activity_stages a on a.id=s.id and a.version=s.version and a.project_id=p_project)<>jsonb_array_length(p_data->'stages') then
     raise exception 'Etapas alteradas. Recarregue antes de reorganizar.';
   end if;
   update public.activity_stages a set position=s.position,version=a.version+1
   from (select (item->>'id')::uuid as stage, ordinality::int as position from jsonb_array_elements(p_data->'stages') with ordinality as list(item,ordinality)) s
   where a.project_id=p_project and a.id=s.stage;
   result:=p_project;
 else raise exception 'Ação inválida'; end if;

 insert into public.activity_history(project_id,task_id,goal_id,actor_id,action,details)
 values(p_project,affected_task,affected_goal,actor,p_action,jsonb_build_object('before',before_state,'input',p_data-'body','reason',reason));
 if affected_task is not null and p_action in ('save_task','move','approve','return') then
   insert into public.notifications(recipient_id,actor_id,project_id,notification_type,title,body,href)
   select distinct u,actor,p_project,'join_request','Atualização de atividade',
     case when p_action='approve' then 'Entrega aprovada.' when p_action='return' then 'Entrega devolvida para ajustes.'
       else 'Uma atividade da equipe foi atribuída ou atualizada.' end,
     '/projetos/'||p.slug||'/painel/atividades'
   from unnest(recipients) u join public.project_members m on m.user_id=u and m.project_id=p_project and m.status='active'
   join public.projects p on p.id=p_project where u<>actor;
 end if;
 insert into public.activity_updates(project_id) values(p_project) on conflict(project_id) do update set changed_at=clock_timestamp();
 return result;
end;
$$;

revoke all on function public.get_activity_workspace(text),public.get_activity_details(uuid,uuid,uuid),public.mutate_activity(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.get_activity_workspace(text),public.get_activity_details(uuid,uuid,uuid),public.mutate_activity(uuid,text,jsonb) to authenticated;
