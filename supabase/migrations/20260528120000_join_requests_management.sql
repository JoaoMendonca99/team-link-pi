-- =========================================================
-- TEAM LINK - PARTE 8
-- Solicitações de participação: RLS + RPC de decisão
--
-- Pré-requisitos (já existentes no banco):
--   public.projects
--   public.project_members
--   public.join_requests
--   public.notifications
--   public.profiles
-- =========================================================


-- =========================================================
-- 1. Helper: verifica se auth.uid() é dono ou admin ativo
-- =========================================================

create or replace function public.is_project_join_manager(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.projects p
      where p.id = p_project_id
        and p.owner_id = auth.uid()
    )
    or exists (
      select 1
      from public.project_members pm
      where pm.project_id = p_project_id
        and pm.user_id = auth.uid()
        and pm.status = 'active'
        and pm.role in ('owner', 'admin')
    );
$$;

revoke all on function public.is_project_join_manager(uuid) from public;
grant execute on function public.is_project_join_manager(uuid) to authenticated;


-- =========================================================
-- 2. RLS em join_requests
-- =========================================================

alter table public.join_requests enable row level security;

drop policy if exists "Managers can read project join requests" on public.join_requests;
create policy "Managers can read project join requests"
on public.join_requests
for select
to authenticated
using (public.is_project_join_manager(project_id));

drop policy if exists "Users can read their own join requests" on public.join_requests;
create policy "Users can read their own join requests"
on public.join_requests
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create pending join requests" on public.join_requests;
create policy "Users can create pending join requests"
on public.join_requests
for insert
to authenticated
with check (
  auth.uid() = user_id
  and status = 'pending'
  and not public.is_project_join_manager(project_id)
  and not exists (
    select 1
    from public.project_members pm
    where pm.project_id = join_requests.project_id
      and pm.user_id = auth.uid()
      and pm.status = 'active'
  )
);

drop policy if exists "Users can cancel their pending join requests" on public.join_requests;
create policy "Users can cancel their pending join requests"
on public.join_requests
for update
to authenticated
using (
  auth.uid() = user_id
  and status = 'pending'
)
with check (
  auth.uid() = user_id
  and status = 'canceled'
);


-- =========================================================
-- 3. RPC: handle_join_request
--    Aprova ou recusa uma solicitação pendente.
-- =========================================================

create or replace function public.handle_join_request(
  p_request_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_action, '')));
  v_request public.join_requests%rowtype;
  v_project_title text;
  v_project_slug text;
  v_href text;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if p_request_id is null then
    raise exception 'Request id is required';
  end if;

  if v_action not in ('approve', 'reject') then
    raise exception 'Invalid action';
  end if;

  select *
  into v_request
  from public.join_requests jr
  where jr.id = p_request_id
  for update;

  if not found then
    raise exception 'Join request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Join request is not pending';
  end if;

  if not public.is_project_join_manager(v_request.project_id) then
    raise exception 'Forbidden';
  end if;

  select p.title, p.slug
  into v_project_title, v_project_slug
  from public.projects p
  where p.id = v_request.project_id;

  v_href := case
    when v_project_slug is not null and v_project_slug <> '' then
      '/projetos/' || v_project_slug
    else
      null
  end;

  update public.join_requests
  set
    status = case when v_action = 'approve' then 'approved' else 'rejected' end,
    decided_by = v_user,
    decided_at = now()
  where id = v_request.id;

  if v_action = 'approve' then
    if exists (
      select 1
      from public.project_members pm
      where pm.project_id = v_request.project_id
        and pm.user_id = v_request.user_id
    ) then
      update public.project_members
      set
        status = 'active',
        role = case
          when role in ('owner', 'admin') then role
          else 'member'
        end
      where project_id = v_request.project_id
        and user_id = v_request.user_id;
    else
      insert into public.project_members (
        project_id,
        user_id,
        role,
        status,
        joined_at
      )
      values (
        v_request.project_id,
        v_request.user_id,
        'member',
        'active',
        now()
      );
    end if;

    insert into public.notifications (
      user_id,
      notification_type,
      title,
      body,
      href,
      actor_id,
      project_id,
      join_request_id
    )
    values (
      v_request.user_id,
      'join_request_approved',
      'Participação aprovada',
      format(
        'Sua solicitação para %s foi aprovada.',
        coalesce(v_project_title, 'o projeto')
      ),
      v_href,
      v_user,
      v_request.project_id,
      v_request.id
    );
  else
    insert into public.notifications (
      user_id,
      notification_type,
      title,
      body,
      href,
      actor_id,
      project_id,
      join_request_id
    )
    values (
      v_request.user_id,
      'join_request_rejected',
      'Solicitação recusada',
      format(
        'Sua solicitação para %s foi recusada.',
        coalesce(v_project_title, 'o projeto')
      ),
      v_href,
      v_user,
      v_request.project_id,
      v_request.id
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'status', case when v_action = 'approve' then 'approved' else 'rejected' end,
    'project_id', v_request.project_id,
    'user_id', v_request.user_id
  );
end;
$$;

revoke all on function public.handle_join_request(uuid, text) from public;
grant execute on function public.handle_join_request(uuid, text) to authenticated;
