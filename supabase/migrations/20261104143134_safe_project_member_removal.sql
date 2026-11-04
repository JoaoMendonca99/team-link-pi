-- Keep the association as historical data. Existing status triggers protect the
-- final administrator, release occupied positions and revoke conversation access.
create function public.remove_project_member(p_project uuid,p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare previous_level text;
begin
  perform 1 from public.projects where id=p_project for update;
  if not public.is_project_join_manager(p_project) then
    raise exception 'Você não tem permissão para remover integrantes deste projeto.';
  end if;

  select coalesce(r.level,'member') into previous_level
    from public.project_members m
    left join public.project_recruitment_roles r using (project_id,user_id)
    where m.project_id=p_project and m.user_id=p_user and m.status='active'
    for update of m;
  if not found then raise exception 'Este integrante não está ativo no projeto.'; end if;

  update public.project_members set status='removed'
    where project_id=p_project and user_id=p_user;

  insert into public.project_recruitment_role_history (project_id,user_id,actor_id,previous_level,level)
    values (p_project,p_user,auth.uid(),previous_level,'removed');
end;
$$;

revoke all on function public.remove_project_member(uuid,uuid) from public,anon;
grant execute on function public.remove_project_member(uuid,uuid) to authenticated;

-- Administrative removals go through the audited RPC. Voluntary departure
-- continues to use the existing status='left' policy.
drop policy if exists "Project administrators can remove project members" on public.project_members;
drop policy if exists "Project administrators can deactivate project members" on public.project_members;
drop policy if exists "Users can delete their own membership" on public.project_members;
revoke delete on public.project_members from public,anon,authenticated;
