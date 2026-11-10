CREATE OR REPLACE FUNCTION public.mutate_activity(p_project uuid, p_action text, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     -- A retry with the same client operation UUID must not duplicate a discussion message.
     if nullif(p_data->>'comment_id','') is not null and exists(select 1 from public.activity_comments where activity_comments.id=(p_data->>'comment_id')::uuid) then
       if exists(select 1 from public.activity_comments where activity_comments.id=(p_data->>'comment_id')::uuid and task_id=task.id and author_id=actor and body=btrim(p_data->>'body')) then return task.id;end if;
       raise exception 'Não foi possível enviar a mensagem.';
     end if;
     insert into public.activity_comments(id,task_id,author_id,body) values(coalesce(nullif(p_data->>'comment_id','')::uuid,gen_random_uuid()),task.id,actor,btrim(p_data->>'body'));
     insert into public.notifications(recipient_id,actor_id,project_id,notification_type,title,body,href)
     select distinct m.user_id,actor,p_project,'join_request','Discussão da atividade','Há uma nova mensagem em uma atividade que você acompanha.',
       '/meu-espaco/atividades?projeto='||p_project||'&atividade='||task.id
     from public.project_members m left join public.project_recruitment_roles r using(project_id,user_id)
     where m.project_id=p_project and m.status='active' and m.user_id<>actor
       and (m.user_id=any(task.assignees) or r.level in ('owner','manager') or (m.user_id=task.reviewer_id and r.level='reviewer'))
       and public.workspace_module_active(p_project,'activities');
   elsif p_action='checklist' then
     if not manager and (nullif(p_data->>'item_id','') is null or p_data?'label') then raise exception 'Apenas Líderes e Gestores podem planejar o checklist.';end if;
     if nullif(p_data->>'item_id','') is null then
       insert into public.activity_checklist(task_id,label) values(task.id,btrim(p_data->>'label'));
     else
       update public.activity_checklist set
         label=case when p_data?'label' then btrim(p_data->>'label') else label end,
         done=case when p_data?'done' then (p_data->>'done')::boolean else done end,version=version+1
       where task_id=task.id and activity_checklist.id=(p_data->>'item_id')::uuid and version=(p_data->>'item_version')::int;
       if not found then raise exception 'Item alterado ou indisponível'; end if;
     end if;
     update public.activity_tasks set version=version+1,updated_at=now() where activity_tasks.id=task.id;
   elsif p_action='delete_checklist' then
     if not manager then raise exception 'Apenas Líderes e Gestores podem planejar o checklist.';end if;
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
$function$
;
-- Only the existing activity-module readership can load the independent dialog.
create schema if not exists activity_private;
revoke all on schema activity_private from public,anon,authenticated;
grant usage on schema activity_private to authenticated;
alter default privileges in schema activity_private revoke execute on functions from public;
create function activity_private.dialog(p_task uuid,p_project uuid,p_slug text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
  'selectedPeriod',t.period_id,'readOnly',not coalesce(a.is_active,false),'periods',jsonb_build_array(to_jsonb(a)),
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
end $$;
create function public.get_activity_dialog(p_task uuid,p_project uuid default null,p_slug text default null) returns jsonb
language sql stable security invoker set search_path='' as $$select activity_private.dialog(p_task,p_project,p_slug)$$;
revoke all on function activity_private.dialog(uuid,uuid,text),public.get_activity_dialog(uuid,uuid,text) from public,anon,authenticated;
grant execute on function activity_private.dialog(uuid,uuid,text),public.get_activity_dialog(uuid,uuid,text) to authenticated;

create function activity_private.center(p_options jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
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
  where actor=any(t.assignees) or (s.kind='review' and (public.is_project_join_manager(p.id) or (t.reviewer_id=actor and l.level='reviewer')))
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
end $$;
create function public.get_my_activity_center(p_options jsonb default '{}') returns jsonb
language sql stable security invoker set search_path='' as $$select activity_private.center(p_options)$$;
revoke all on function activity_private.center(jsonb),public.get_my_activity_center(jsonb) from public,anon,authenticated;
grant execute on function activity_private.center(jsonb),public.get_my_activity_center(jsonb) to authenticated;
