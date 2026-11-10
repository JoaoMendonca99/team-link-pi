-- A discussion remains in activity_comments; the only new state is a user's read watermark.
create function activity_private.can_discuss(p_task uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select from public.activity_tasks t join public.project_members m on m.project_id=t.project_id and m.user_id=auth.uid() and m.status='active'
  where t.id=p_task and public.can_use_activities(t.project_id) and
   (public.is_project_join_manager(t.project_id) or auth.uid()=any(t.assignees) or
    (t.reviewer_id=auth.uid() and exists(select from public.project_recruitment_roles r where r.project_id=t.project_id and r.user_id=auth.uid() and r.level='reviewer')))
 );
$$;
revoke all on function activity_private.can_discuss(uuid) from public,anon;
grant execute on function activity_private.can_discuss(uuid) to authenticated;

alter table public.activity_comments add column discussion_sequence bigint generated always as identity;
create unique index activity_comment_sequence on public.activity_comments(discussion_sequence);
create index activity_comment_task_sequence on public.activity_comments(task_id,discussion_sequence desc) include(author_id,created_at);
create table public.activity_discussion_reads(
 task_id uuid not null references public.activity_tasks(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 last_read_sequence bigint not null check(last_read_sequence>=0),updated_at timestamptz not null default now(),primary key(task_id,user_id)
);
create index activity_discussion_reads_user on public.activity_discussion_reads(user_id,task_id);
alter table public.activity_discussion_reads enable row level security;
revoke all on public.activity_discussion_reads from public,anon,authenticated;
grant select on public.activity_discussion_reads to authenticated;
create policy discussion_reads_own on public.activity_discussion_reads for select to authenticated using(user_id=(select auth.uid()) and activity_private.can_discuss(task_id));
alter policy evidence_read on public.activity_comment_attachments using(activity_private.can_discuss(task_id));

-- Protect the established write path, including callers that bypass the new UI.
create function activity_private.guard_discussion() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is not null and not activity_private.can_discuss(case when tg_op='DELETE' then old.task_id else new.task_id end) then raise exception 'Discussão indisponível.';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function activity_private.guard_discussion() from public,anon,authenticated;
create trigger activity_comment_participant_guard before insert or update on public.activity_comments for each row execute function activity_private.guard_discussion();

create function activity_private.mark_discussion_read(p_task uuid,p_through bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare project uuid;changed integer;
begin
 select project_id into project from public.activity_tasks where id=p_task;
 perform 1 from public.projects where id=project for update;
 if not activity_private.can_discuss(p_task) then raise exception 'Discussão indisponível.';end if;
 if not exists(select from public.activity_comments where task_id=p_task and discussion_sequence=p_through) then raise exception 'Leitura inválida.';end if;
 insert into public.activity_discussion_reads(task_id,user_id,last_read_sequence)values(p_task,auth.uid(),p_through)
 on conflict(task_id,user_id)do update set last_read_sequence=excluded.last_read_sequence,updated_at=clock_timestamp() where activity_discussion_reads.last_read_sequence<excluded.last_read_sequence;
 get diagnostics changed=row_count;
 if changed>0 then insert into public.activity_updates(project_id)values(project)on conflict(project_id)do update set changed_at=clock_timestamp();end if;
 return changed>0;
end $$;
create function public.mark_activity_discussion_read(p_task uuid,p_through bigint) returns boolean language sql security invoker set search_path='' as $$select activity_private.mark_discussion_read(p_task,p_through)$$;
revoke all on function activity_private.mark_discussion_read(uuid,bigint),public.mark_activity_discussion_read(uuid,bigint) from public,anon,authenticated;
grant execute on function activity_private.mark_discussion_read(uuid,bigint),public.mark_activity_discussion_read(uuid,bigint) to authenticated;

create function activity_private.discussion_directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'project_id',t.project_id,'title',t.title,'kind',s.kind,
  'preview',case when last.body='' then 'Anexos da atividade' else left(last.body,180) end,'author_name',pr.full_name,'last_message_at',last.created_at,
  'unread_count',(select count(*) from public.activity_comments c where c.task_id=t.id and c.author_id is distinct from auth.uid() and c.discussion_sequence>coalesce(r.last_read_sequence,0)))
  order by last.created_at desc,last.discussion_sequence desc,t.id),'[]')
 from public.activity_tasks t join public.projects p on p.id=t.project_id and p.status in ('open','in_progress')
 join public.activity_stages s on s.id=t.stage_id and s.project_id=t.project_id and s.kind in ('todo','doing')
 join lateral(select c.body,c.author_id,c.created_at,c.discussion_sequence from public.activity_comments c where c.task_id=t.id order by c.created_at desc,c.discussion_sequence desc limit 1)last on true
 left join public.profiles pr on pr.id=last.author_id
 left join public.activity_discussion_reads r on r.task_id=t.id and r.user_id=auth.uid()
 where activity_private.can_discuss(t.id);
$$;
revoke all on function activity_private.discussion_directory() from public,anon,authenticated;

create or replace function lifecycle_private.chat_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare discussions jsonb;result jsonb;
begin
 if auth.uid() is null then raise exception 'Autenticação necessária.';end if;
 discussions:=activity_private.discussion_directory();
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object(
 'activities',a.items,'unread_count',p.unread_count+a.unread,
 'last_message',case when a.last_at is not null and (p.last_message_at is null or a.last_at>p.last_message_at) then a.preview else p.last_message end,
 'last_message_at',greatest(p.last_message_at,a.last_at),
 'search_terms',array(select coalesce(c.title,case when c.kind='general' then 'Geral' else '' end) from public.project_conversations c join public.project_conversation_members m on m.conversation_id=c.id and m.user_id=auth.uid() where c.project_id=p.project_id and c.status='active')||array(select (x->>'title')||' '||(x->>'preview') from jsonb_array_elements(a.items)x)
 ) order by greatest(p.last_message_at,a.last_at) desc nulls last,p.project_title,p.project_id),'[]') into result
 from public.get_my_chat_projects()p cross join lateral(
  select coalesce(jsonb_agg(x),'[]') items,coalesce(sum((x->>'unread_count')::bigint),0) unread,
   max((x->>'last_message_at')::timestamptz)last_at,(array_agg(x->>'preview' order by (x->>'last_message_at')::timestamptz desc))[1] preview
  from jsonb_array_elements(discussions)x where x->>'project_id'=p.project_id::text
 )a;
 return result;
end $$;

-- Reuse the existing single project update signal for membership and reviewer access changes.
create function activity_private.discussion_access_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select from public.projects where id=case when tg_op='DELETE' then old.project_id else new.project_id end) then
  insert into public.activity_updates(project_id)values(case when tg_op='DELETE' then old.project_id else new.project_id end)on conflict(project_id)do update set changed_at=clock_timestamp();
 end if;return null;
end $$;
revoke all on function activity_private.discussion_access_changed() from public,anon,authenticated;
create trigger activity_discussion_member_access after insert or update or delete on public.project_members for each row execute function activity_private.discussion_access_changed();
create trigger activity_discussion_role_access after insert or update or delete on public.project_recruitment_roles for each row execute function activity_private.discussion_access_changed();

CREATE OR REPLACE FUNCTION public.get_activity_details(p_project uuid, p_task uuid DEFAULT NULL::uuid, p_goal uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if (p_task is not null and not activity_private.can_discuss(p_task)) or not public.can_use_activities(p_project) then raise exception 'Acesso negado'; end if;
 return jsonb_build_object(
  'comments',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'discussion_sequence',c.discussion_sequence,'author_id',c.author_id,'name',p.full_name,'avatar',p.avatar_url,'body',c.body,'created_at',c.created_at) order by c.created_at,c.id),'[]')
    from public.activity_comments c join public.activity_tasks t on t.id=c.task_id left join public.profiles p on p.id=c.author_id
    where t.project_id=p_project and t.id=p_task),
  'history',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'actor_id',h.actor_id,'name',p.full_name,'action',h.action,'details',h.details,'created_at',h.created_at) order by h.id),'[]')
    from public.activity_history h left join public.profiles p on p.id=h.actor_id
    where h.project_id=p_project and ((p_task is not null and h.task_id=p_task) or (p_goal is not null and h.goal_id=p_goal))));
end;
$function$
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
   or not activity_private.can_discuss(t.id) then raise exception 'Atividade indisponível.';end if;
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
 detail:=jsonb_set(detail,'{comments}',coalesce((select jsonb_agg(jsonb_build_object(
 'id',c.id,'discussion_sequence',c.discussion_sequence,'author_id',c.author_id,'name',pr.full_name,'avatar',pr.avatar_url,'body',c.body,'reply_to',c.reply_to,'created_at',c.created_at,
 'attachments',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'filename',f.filename,'mime',f.mime,'size',f.size) order by f.created_at,f.id),'[]') from public.activity_comment_attachments f where f.comment_id=c.id)
 ) order by c.created_at,c.id) from public.activity_comments c left join public.profiles pr on pr.id=c.author_id where c.task_id=t.id),'[]'));
 detail:=jsonb_set(detail,'{history}',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'actor_id',h.actor_id,'name',pr.full_name,'action',h.action,'details',h.details||jsonb_build_object('to_kind',s.kind,'to_label',s.name),'created_at',h.created_at) order by h.created_at,h.id)
  from public.activity_history h left join public.profiles pr on pr.id=h.actor_id left join public.activity_stages s on s.project_id=p.id and s.id=nullif(h.details->'input'->>'stage_id','')::uuid where h.task_id=t.id and h.project_id=p.id),'[]'));
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
  'permissions',jsonb_build_object('move',manager or assigned,'review',coalesce(reviewer,false),'comment',activity_private.can_discuss(t.id),'check',manager or assigned),
  'details',detail);
end $function$
;
