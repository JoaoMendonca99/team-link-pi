create table public.project_workspace_modules (
  project_id uuid not null references public.projects(id) on delete cascade,
  module text not null check (module in ('github', 'support')),
  primary key (project_id, module)
);
alter table public.project_workspace_modules enable row level security;
revoke all on public.project_workspace_modules from public, anon, authenticated;
grant select on public.project_workspace_modules to service_role;

insert into public.project_workspace_modules
select distinct project_id, 'github' from public.project_github_repositories where is_active
union
select i.project_id, 'support' from public.project_support_integrations i
where (i.enabled and i.api_key_hash is not null)
  or exists(select 1 from public.support_tickets t where t.project_id = i.project_id)
on conflict do nothing;

create function public.workspace_module_active(p_project uuid, p_module text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.project_workspace_modules where project_id = p_project and module = p_module);
$$;
revoke all on function public.workspace_module_active(uuid,text) from public, anon, authenticated;

create function public.get_workspace_modules(p_project uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select array(select w.module from public.project_workspace_modules w where w.project_id = p_project
    and exists(select 1 from public.project_members m where m.project_id = p_project and m.user_id = auth.uid() and m.status = 'active')
    order by w.module);
$$;

create function public.set_workspace_module(p_project uuid, p_module text, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.projects where id = p_project for update;
  if not found or not public.is_project_join_manager(p_project) then raise exception 'Acesso negado'; end if;
  if p_module is null or p_module not in ('github', 'support') or p_active is null then raise exception 'Funcionalidade inválida'; end if;
  if p_active then
    insert into public.project_workspace_modules (project_id, module) values (p_project, p_module) on conflict do nothing;
  else
    delete from public.project_workspace_modules where project_id = p_project and module = p_module;
  end if;
end;
$$;

create function public.get_recruitment_workspace(p_slug text)
returns table (id uuid, slug text, title text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.slug, p.title from public.projects p where p.slug = p_slug and public.is_project_join_manager(p.id);
$$;

create function public.get_workspace_pending_count(p_project uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.join_requests j where j.project_id = p_project and j.status = 'pending'
    and public.is_project_join_manager(p_project);
$$;

revoke all on function public.get_workspace_modules(uuid), public.set_workspace_module(uuid,text,boolean),
  public.get_recruitment_workspace(text), public.get_workspace_pending_count(uuid) from public, anon, authenticated;
grant execute on function public.get_workspace_modules(uuid), public.set_workspace_module(uuid,text,boolean),
  public.get_recruitment_workspace(text), public.get_workspace_pending_count(uuid) to authenticated;

create or replace function public.recruitment_notify_managers(p_project uuid,p_request uuid,p_title text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(recipient_id,actor_id,project_id,join_request_id,notification_type,title,body,href)
  select m.user_id,auth.uid(),p_project,p_request,'join_request',p_title,'Abra o painel para ver os detalhes.',
    '/projetos/'||p.slug||'/painel/candidaturas'
  from public.projects p join public.project_members m on m.project_id=p.id
  join public.project_recruitment_roles r using (project_id,user_id)
  where p.id=p_project and m.status='active' and r.level in ('owner','manager')
    and m.user_id is distinct from auth.uid();
$$;

-- These helpers are also used by existing GitHub RPCs and RLS policies.
create or replace function public.github_is_project_manager(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.workspace_module_active(p_project_id, 'github') and public.is_project_join_manager(p_project_id);
$$;

create or replace function public.github_can_view_repository(p_project_id uuid, p_commit_visibility text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.workspace_module_active(p_project_id, 'github') and (
    exists(select 1 from public.project_members m where m.project_id = p_project_id and m.user_id = auth.uid() and m.status = 'active')
    or (p_commit_visibility = 'public' and exists(select 1 from public.projects p
      where p.id = p_project_id and p.visibility = 'public' and p.status <> 'archived'))
  );
$$;

create or replace function public.support_is_project_manager(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.workspace_module_active(p_project_id, 'support') and public.is_project_join_manager(p_project_id);
$$;

create or replace function public.support_can_access_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.workspace_module_active(p_project_id, 'support') and (
    public.is_project_join_manager(p_project_id)
    or exists(select 1 from public.project_members m where m.project_id = p_project_id and m.user_id = auth.uid()
      and m.status = 'active' and m.support_access)
  );
$$;
