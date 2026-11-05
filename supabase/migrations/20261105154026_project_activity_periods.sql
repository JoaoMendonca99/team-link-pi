-- Keep existing records byte-for-byte except for their new period association.
lock table public.projects, public.activity_tasks, public.activity_goals in share row exclusive mode;
create temp table period_migration_snapshot on commit drop as
select 'tasks' as kind, md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'')) as digest from public.activity_tasks t
union all select 'goals',md5(coalesce(jsonb_agg(to_jsonb(g) order by id)::text,'')) from public.activity_goals g;

create table public.activity_periods(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 160), description text not null default '' check(length(description)<=4000),
 starts_on date check(starts_on is null or isfinite(starts_on)), ends_on date check(ends_on is null or isfinite(ends_on)),
 is_active boolean not null default false, created_at timestamptz not null default now(),
 created_by uuid references public.profiles on delete set null, version integer not null default 1,
 unique(project_id,id), check(starts_on is null or ends_on is null or starts_on<=ends_on)
);
create unique index activity_period_name on public.activity_periods(project_id,lower(btrim(name)));
create unique index activity_period_active on public.activity_periods(project_id) where is_active;
alter table public.activity_periods enable row level security;
revoke all on public.activity_periods from public,anon,authenticated;

insert into public.activity_periods(project_id,name,is_active,created_by)
select id,case when slug='site-team-link' then '2026.2 — Segundo semestre de 2026' else 'Período inicial' end,true,owner_id from public.projects;
alter table public.activity_goals add column period_id uuid;
alter table public.activity_tasks add column period_id uuid;
update public.activity_goals g set period_id=p.id from public.activity_periods p where p.project_id=g.project_id and p.is_active;
update public.activity_tasks t set period_id=p.id from public.activity_periods p where p.project_id=t.project_id and p.is_active;
alter table public.activity_goals alter column period_id set not null,
 add constraint activity_goal_period foreign key(project_id,period_id) references public.activity_periods(project_id,id),
 add constraint activity_goal_period_identity unique(project_id,period_id,id);
alter table public.activity_tasks alter column period_id set not null,
 add constraint activity_task_period foreign key(project_id,period_id) references public.activity_periods(project_id,id),
 add constraint activity_task_goal_period foreign key(project_id,period_id,goal_id) references public.activity_goals(project_id,period_id,id) deferrable initially deferred;
create index activity_tasks_period on public.activity_tasks(project_id,period_id);
create index activity_goals_period on public.activity_goals(project_id,period_id);

do $$ begin
 if exists(select 1 from period_migration_snapshot s where s.digest is distinct from
 case when s.kind='tasks' then (select md5(coalesce(jsonb_agg(to_jsonb(t)-'period_id' order by id)::text,'')) from public.activity_tasks t)
 else (select md5(coalesce(jsonb_agg(to_jsonb(g)-'period_id' order by id)::text,'')) from public.activity_goals g) end)
 then raise exception 'Migration changed existing activity data'; end if;
end $$;

create function public.initialize_project_period() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.activity_periods(project_id,name,is_active,created_by) values(new.id,'Período inicial',true,new.owner_id);
 return new;
end $$;
revoke all on function public.initialize_project_period() from public,anon,authenticated,service_role;
create trigger initialize_project_period after insert on public.projects for each row execute function public.initialize_project_period();

-- At most one via the unique index, at least one at transaction commit.
create function public.require_active_activity_period() returns trigger language plpgsql security definer set search_path='' as $$
declare project uuid:=coalesce(new.project_id,old.project_id);
begin
 if exists(select 1 from public.projects where id=project) and
    (select count(*) from public.activity_periods where project_id=project and is_active)<>1 then
   raise exception 'Mantenha exatamente um período ativo no projeto.';
 end if;
 return null;
end $$;
revoke all on function public.require_active_activity_period() from public,anon,authenticated,service_role;
create constraint trigger require_active_activity_period after insert or update or delete on public.activity_periods
deferrable initially deferred for each row execute function public.require_active_activity_period();

create or replace function public.get_activity_workspace(p_slug text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.projects%rowtype;
begin
 select * into p from public.projects where slug=p_slug;
 if not found or not public.can_use_activities(p.id) then raise exception 'Acesso indisponível para este módulo.'; end if;
 return jsonb_build_object('project',jsonb_build_object('id',p.id,'title',p.title,'slug',p.slug),
 'manager',public.is_project_join_manager(p.id),
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
$$;


create or replace function public.mutate_activity(p_project uuid,p_action text,p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
 manager boolean; actor uuid:=auth.uid(); id uuid:=nullif(p_data->>'id','')::uuid;
 task public.activity_tasks%rowtype; goal public.activity_goals%rowtype; stage public.activity_stages%rowtype;
 target public.activity_stages%rowtype; people uuid[]; reviewer uuid; before_state jsonb;
 period uuid; source_period uuid; destination uuid; entry record; ids uuid[]; moved integer; linked integer;
 result uuid; affected_task uuid; affected_goal uuid; can_review boolean; reason text; recipients uuid[]:='{}';
begin
 -- The same project lock as activation/removal makes permission checks and writes atomic.
 perform 1 from public.projects where public.projects.id=p_project for update;
 if not found or not public.can_use_activities(p_project) then raise exception 'Acesso negado'; end if;
 manager:=public.is_project_join_manager(p_project);
 if jsonb_typeof(p_data)<>'object' then raise exception 'Dados inválidos'; end if;
 if p_action in ('save_task','save_goal','save_stage','delete_stage','delete_task','delete_goal','reorder_stages') and not manager then raise exception 'Apenas Líderes e Gestores podem realizar esta ação.'; end if;


 select id into period from public.activity_periods where project_id=p_project and is_active;
 if p_action in ('save_task','save_goal','delete_goal') then
   if id is not null then
     if p_action='save_task' then select period_id into period from public.activity_tasks where project_id=p_project and activity_tasks.id=id;
     else select period_id into period from public.activity_goals where project_id=p_project and activity_goals.id=id; end if;
   else period:=coalesce(nullif(p_data->>'period_id','')::uuid,period); end if;
 elsif id is not null then
   if p_action='transfer_goal' then select period_id into period from public.activity_goals where project_id=p_project and activity_goals.id=id;
   else select period_id into source_period from public.activity_tasks where project_id=p_project and activity_tasks.id=id;
     period:=coalesce(source_period,period); end if;
 end if;
 if p_action not in ('save_period','activate_period','transfer_tasks','transfer_goal','save_stage','delete_stage','reorder_stages') then
   if not exists(select 1 from public.activity_periods where project_id=p_project and activity_periods.id=period) then raise exception 'Período indisponível'; end if;
   if not exists(select 1 from public.activity_periods where activity_periods.id=period and is_active) and
     (not manager or coalesce((p_data->>'historical_edit')::boolean,false)=false) then
     raise exception 'Período histórico: um administrador deve habilitar explicitamente a edição.';
   end if;
 end if;
 if p_action in ('save_period','activate_period','transfer_tasks','transfer_goal') then
   if not manager then raise exception 'Apenas Líderes e Gestores podem administrar períodos.'; end if;
   if p_action='save_period' then
     if id is not null and not exists(select 1 from public.activity_periods where project_id=p_project and activity_periods.id=id and version=(p_data->>'version')::int) then raise exception 'Período alterado ou indisponível.'; end if;
     if exists(select 1 from public.activity_periods where project_id=p_project and lower(btrim(name))=lower(btrim(p_data->>'name')) and activity_periods.id<>coalesce(id,'00000000-0000-0000-0000-000000000000'::uuid)) then raise exception 'Já existe um período com este nome.'; end if;
     result:=coalesce(id,gen_random_uuid());
     if coalesce((p_data->>'activate')::boolean,false) then update public.activity_periods set is_active=false,version=version+1 where project_id=p_project and is_active and activity_periods.id<>result; end if;
     insert into public.activity_periods(id,project_id,name,description,starts_on,ends_on,is_active,created_by)
     values(result,p_project,btrim(p_data->>'name'),coalesce(p_data->>'description',''),nullif(p_data->>'starts_on','')::date,nullif(p_data->>'ends_on','')::date,coalesce((p_data->>'activate')::boolean,false),actor)
     on conflict on constraint activity_periods_pkey do update set name=excluded.name,description=excluded.description,
      starts_on=excluded.starts_on,ends_on=excluded.ends_on,is_active=activity_periods.is_active or excluded.is_active,version=activity_periods.version+1;
   elsif p_action='activate_period' then
     if not exists(select 1 from public.activity_periods where project_id=p_project and activity_periods.id=id and version=(p_data->>'version')::int) then raise exception 'Período alterado ou indisponível.'; end if;
     update public.activity_periods set is_active=false,version=version+1 where project_id=p_project and is_active and activity_periods.id<>id;
     update public.activity_periods set is_active=true,version=version+1 where project_id=p_project and activity_periods.id=id;
     result:=id;
   else
     destination:=nullif(p_data->>'period_id','')::uuid;
     if not exists(select 1 from public.activity_periods where project_id=p_project and activity_periods.id=destination) then raise exception 'Período de destino indisponível.'; end if;
     if coalesce((p_data->>'confirmed')::boolean,false)=false then raise exception 'Confirme a transferência.'; end if;
     if p_action='transfer_goal' then
       select * into goal from public.activity_goals where project_id=p_project and activity_goals.id=id;
       if not found or goal.version is distinct from (p_data->>'version')::int then raise exception 'Meta alterada ou indisponível.'; end if;
       if destination=goal.period_id then raise exception 'Escolha outro período.'; end if;
       select count(*) into linked from public.activity_tasks where project_id=p_project and goal_id=id;
       if linked is distinct from (p_data->>'linked_count')::int then raise exception 'Os vínculos mudaram. Confira novamente.'; end if;
       if coalesce(p_data->>'mode','') not in ('with_tasks','unlink') then raise exception 'Escolha como tratar as atividades vinculadas.'; end if;
       for entry in select * from public.activity_tasks where project_id=p_project and goal_id=id order by activity_tasks.id loop
         update public.activity_tasks set period_id=case when p_data->>'mode'='with_tasks' then destination else period_id end,
          goal_id=case when p_data->>'mode'='unlink' then null else goal_id end,version=version+1,updated_at=now() where activity_tasks.id=entry.id;
         insert into public.activity_history(project_id,task_id,actor_id,action,details) values(p_project,entry.id,actor,'transfer_task',jsonb_build_object('from',entry.period_id,'to',case when p_data->>'mode'='with_tasks' then destination else entry.period_id end,'goal_id',id,'mode',p_data->>'mode'));
       end loop;
       update public.activity_goals set period_id=destination,version=version+1 where activity_goals.id=id;
       insert into public.activity_history(project_id,goal_id,actor_id,action,details) values(p_project,id,actor,'transfer_goal',jsonb_build_object('from',goal.period_id,'to',destination,'mode',p_data->>'mode','linked_count',linked));
       result:=id;
     else
       if jsonb_typeof(p_data->'tasks') is distinct from 'array' or jsonb_array_length(p_data->'tasks') not between 1 and 1000 then raise exception 'Selecione de 1 a 1000 atividades.'; end if;
       select array_agg(x.id) into ids from jsonb_to_recordset(p_data->'tasks') x(id uuid,version int);
       if (select count(distinct x) from unnest(ids) x)<>cardinality(ids) or
         (select count(*) from public.activity_tasks t join jsonb_to_recordset(p_data->'tasks') x(id uuid,version int) on t.id=x.id and t.version=x.version where t.project_id=p_project and t.period_id<>destination)<>cardinality(ids) then raise exception 'Seleção alterada ou indisponível. Recarregue.'; end if;
       if nullif(p_data->>'goal_id','') is not null and not exists(select 1 from public.activity_goals where project_id=p_project and period_id=destination and activity_goals.id=(p_data->>'goal_id')::uuid) then raise exception 'Selecione uma meta do período de destino.'; end if;
       select count(*) into linked from public.activity_tasks where activity_tasks.id=any(ids) and goal_id is not null;
       if linked is distinct from (p_data->>'linked_count')::int then raise exception 'Os vínculos mudaram. Confira novamente.'; end if;
       for entry in select * from public.activity_tasks where project_id=p_project and activity_tasks.id=any(ids) order by activity_tasks.id loop
         update public.activity_tasks set period_id=destination,goal_id=nullif(p_data->>'goal_id','')::uuid,version=version+1,updated_at=now() where activity_tasks.id=entry.id;
         insert into public.activity_history(project_id,task_id,actor_id,action,details) values(p_project,entry.id,actor,'transfer_task',jsonb_build_object('from',entry.period_id,'to',destination,'from_goal',entry.goal_id,'to_goal',nullif(p_data->>'goal_id','')::uuid));
       end loop;
       result:=p_project;
     end if;
   end if;
   insert into public.activity_updates(project_id) values(p_project) on conflict(project_id) do update set changed_at=clock_timestamp();
   return result;
 end if;
 if p_action='save_task' then
   select * into task from public.activity_tasks where project_id=p_project and activity_tasks.id=id;
   if id is not null and (not found or task.version is distinct from (p_data->>'version')::int) then raise exception 'Atividade alterada. Recarregue antes de salvar.'; end if;
   select coalesce(array_agg(distinct u::uuid),'{}') into people from jsonb_array_elements_text(coalesce(p_data->'assignees','[]')) u;
   reviewer:=nullif(p_data->>'reviewer_id','')::uuid;
   if not public.activity_people_valid(p_project,people,reviewer) then raise exception 'Selecione integrantes ativos e um revisor autorizado.'; end if;
   select * into target from public.activity_stages where project_id=p_project and activity_stages.id=(p_data->>'stage_id')::uuid;
   if not found or (id is not null and target.id<>task.stage_id) then raise exception 'Altere o status pela ação de movimentação.'; end if;
   if id is null and target.kind='done' and coalesce((p_data->>'requires_review')::boolean,false) then raise exception 'A entrega exige aprovação antes da conclusão.'; end if;
   if nullif(p_data->>'goal_id','') is not null and not exists(select 1 from public.activity_goals where project_id=p_project and period_id=period and activity_goals.id=(p_data->>'goal_id')::uuid) then raise exception 'Selecione uma meta do mesmo período.'; end if;
   before_state:=case when id is null then '{}'::jsonb else to_jsonb(task) end;
   result:=coalesce(id,gen_random_uuid());
   insert into public.activity_tasks(period_id,id,project_id,title,description,stage_id,assignees,due_at,priority,goal_id,reviewer_id,requires_review)
   values(period,result,p_project,btrim(p_data->>'title'),coalesce(p_data->>'description',''),target.id,people,
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
     insert into public.activity_goals(period_id,id,project_id,title,description,due_at,owners,kind,target,actual,unit)
     values(period,result,p_project,btrim(p_data->>'title'),coalesce(p_data->>'description',''),nullif(p_data->>'due_at','')::timestamptz,
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
     if coalesce((p_data->>'historical_edit')::boolean,false)=false and exists(
       select 1 from public.activity_tasks t join public.activity_periods a on a.id=t.period_id
       where t.project_id=p_project and t.stage_id=id and not a.is_active) then
       raise exception 'Esta etapa contém atividades históricas. Habilite explicitamente a edição do histórico antes de removê-la.';
     end if;
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
     '/projetos/'||p.slug||'/painel/atividades?periodo='||period||'&atividade='||affected_task
   from unnest(recipients) u join public.project_members m on m.user_id=u and m.project_id=p_project and m.status='active'
   join public.projects p on p.id=p_project where u<>actor;
 end if;
 insert into public.activity_updates(project_id) values(p_project) on conflict(project_id) do update set changed_at=clock_timestamp();
 return result;
end;
$$;


create or replace function public.get_project_panel_summary(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare states jsonb; goals jsonb; people jsonb; period public.activity_periods%rowtype;
begin
 if not public.can_use_activities(p_project) then raise exception 'Acesso negado'; end if;
 select * into period from public.activity_periods where project_id=p_project and is_active;
 select jsonb_build_object('todo',count(*) filter(where s.kind='todo'),'doing',count(*) filter(where s.kind='doing'),
 'review',count(*) filter(where s.kind='review'),'done',count(*) filter(where s.kind='done')) into states
 from public.activity_tasks t join public.activity_stages s on s.id=t.stage_id where t.project_id=p_project and t.period_id=period.id;
 select jsonb_build_object('done',count(*) filter(where total>0 and actual>=total),
 'doing',count(*) filter(where actual>0 and actual<total),'pending',count(*) filter(where actual=0),
 'late',count(*) filter(where due_at<now() and not(total>0 and actual>=total))) into goals
 from (select g.due_at,case when g.kind='numeric' then g.target else count(t.id) end as total,
 case when g.kind='numeric' then g.actual else count(t.id) filter(where s.kind='done') end as actual
 from public.activity_goals g left join public.activity_tasks t on t.goal_id=g.id and t.project_id=g.project_id
 left join public.activity_stages s on s.id=t.stage_id where g.project_id=p_project and g.period_id=period.id group by g.id) progress;
 select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.full_name,'avatar',p.avatar_url,
 'role',m.display_role,'level',coalesce(r.level,'member'),'last_active_at',v.last_active_at)),'[]') into people
 from public.project_members m join public.profiles p on p.id=m.user_id
 left join public.project_recruitment_roles r using(project_id,user_id)
 left join public.project_panel_presence v using(project_id,user_id) where m.project_id=p_project and m.status='active';
 return jsonb_build_object('period',jsonb_build_object('id',period.id,'name',period.name),'states',states,'goals',goals,'members',people,'as_of',now());
end;
$$;

create or replace function public.dispatch_activity_deadlines() returns integer language plpgsql security definer set search_path='' as $$
declare p record; item record; delivered integer:=0; stamp timestamptz:=clock_timestamp(); event_name text;
begin
 if not pg_try_advisory_xact_lock(hashtextextended('team-link-activity-deadlines',0)) then return 0; end if;
 for p in select id,slug from public.projects where id in (
   select project_id from public.activity_tasks where due_at<=stamp+interval '24 hours'
   union select project_id from public.activity_goals where due_at<=stamp+interval '24 hours') order by id for update loop
   for item in
     select 'task'::text as kind,t.id,t.due_at,u.recipient from public.activity_tasks t
       join public.activity_stages s on s.id=t.stage_id cross join lateral unnest(t.assignees) u(recipient)
       where t.project_id=p.id and exists(select 1 from public.activity_periods a where a.id=t.period_id and a.is_active) and t.due_at<=stamp+interval '24 hours' and s.kind<>'done'
     union
     select 'goal',g.id,g.due_at,u.recipient from public.activity_goals g cross join lateral unnest(g.owners) u(recipient)
       where g.project_id=p.id and exists(select 1 from public.activity_periods a where a.id=g.period_id and a.is_active) and g.due_at<=stamp+interval '24 hours' and (
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
        '/projetos/'||p.slug||'/painel/atividades?periodo='||(select r.id from public.activity_periods r where r.project_id=p.id and r.is_active)||'&'||case when item.kind='task' then 'atividade' else 'meta' end||'='||item.id);
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

