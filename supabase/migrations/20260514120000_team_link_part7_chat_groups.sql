-- =========================================================
-- TEAM LINK - PARTE 7
-- Chat: grupos personalizados + soft delete de conversas
--
-- Pré-requisitos (já existentes no banco):
--   public.profiles
--   public.projects
--   public.project_members
--   public.project_conversations
--   public.project_conversation_members
--   public.project_messages
-- =========================================================


-- =========================================================
-- 1. Extensão das colunas em public.project_conversations
--    para suportar exclusão "lógica" (soft delete) sem perder
--    mensagens nem membros.
-- =========================================================

alter table public.project_conversations
  add column if not exists status text not null default 'active'
    check (status in ('active', 'deleted'));

alter table public.project_conversations
  add column if not exists deleted_at timestamptz null;

alter table public.project_conversations
  add column if not exists deleted_by uuid null
    references public.profiles(id);

create index if not exists idx_project_conversations_status
on public.project_conversations(status);

create index if not exists idx_project_conversations_project_status
on public.project_conversations(project_id, status);


-- =========================================================
-- 2. Trigger de proteção: nunca permitir excluir
--    fisicamente a conversa Geral nem alterar seu kind.
--
--    Soft delete via update também é bloqueado para kind='general'.
-- =========================================================

create or replace function public.guard_project_conversation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.kind = 'general' then
      raise exception 'General conversation cannot be deleted';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.kind = 'general' and new.status <> old.status then
      raise exception 'General conversation cannot change status';
    end if;
    if new.kind <> old.kind then
      raise exception 'Conversation kind cannot be changed';
    end if;
    if new.project_id <> old.project_id then
      raise exception 'Conversation project cannot be changed';
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_project_conversations_guard on public.project_conversations;

create trigger trg_project_conversations_guard
before update or delete on public.project_conversations
for each row
execute function public.guard_project_conversation();


-- =========================================================
-- 3. RPC: public.create_project_group_conversation
--
-- Cria um grupo personalizado dentro de um projeto.
-- Executa como SECURITY DEFINER para poder gravar com regras
-- próprias, mas a função valida explicitamente quem é o
-- usuário logado, se é membro ativo do projeto e se os
-- demais usuários também são membros ativos. Membros fora
-- do projeto são recusados com erro.
-- =========================================================

create or replace function public.create_project_group_conversation(
  p_project_id uuid,
  p_title text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_conversation_id uuid;
  v_clean_title text;
  v_member_id uuid;
  v_member_ids uuid[];
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if p_project_id is null then
    raise exception 'Project id is required';
  end if;

  v_clean_title := trim(coalesce(p_title, ''));
  if v_clean_title = '' then
    raise exception 'Group title cannot be empty';
  end if;

  if char_length(v_clean_title) > 80 then
    raise exception 'Group title is too long';
  end if;

  -- Criador precisa ser membro ativo do projeto.
  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = v_user
      and pm.status = 'active'
  ) then
    raise exception 'You are not an active member of this project';
  end if;

  -- Normaliza array (remove nulos, duplicados e o próprio criador).
  v_member_ids := (
    select coalesce(array_agg(distinct mid), array[]::uuid[])
    from unnest(coalesce(p_member_ids, array[]::uuid[])) as mid
    where mid is not null and mid <> v_user
  );

  -- Todo participante adicional precisa ser membro ativo do mesmo projeto.
  if array_length(v_member_ids, 1) is not null then
    if exists (
      select 1
      from unnest(v_member_ids) as mid
      where not exists (
        select 1
        from public.project_members pm
        where pm.project_id = p_project_id
          and pm.user_id = mid
          and pm.status = 'active'
      )
    ) then
      raise exception 'All selected members must be active members of this project';
    end if;
  end if;

  -- Cria a conversa do tipo group.
  insert into public.project_conversations (
    project_id,
    kind,
    title,
    created_by,
    status
  )
  values (
    p_project_id,
    'group',
    v_clean_title,
    v_user,
    'active'
  )
  returning id into v_conversation_id;

  -- Criador entra como admin.
  insert into public.project_conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_user, 'admin')
  on conflict (conversation_id, user_id) do nothing;

  -- Demais participantes entram como member.
  if array_length(v_member_ids, 1) is not null then
    foreach v_member_id in array v_member_ids loop
      insert into public.project_conversation_members (conversation_id, user_id, role)
      values (v_conversation_id, v_member_id, 'member')
      on conflict (conversation_id, user_id) do nothing;
    end loop;
  end if;

  return v_conversation_id;
end;
$$;

revoke all on function public.create_project_group_conversation(uuid, text, uuid[]) from public;
grant execute on function public.create_project_group_conversation(uuid, text, uuid[]) to authenticated;


-- =========================================================
-- 4. RPC: public.delete_project_group_conversation
--
-- Aplica soft delete (status='deleted') em conversas do tipo
-- group. Nunca aceita kind='general'. Apenas dono do projeto,
-- admin da conversa ou created_by podem excluir. Mensagens
-- e membros permanecem fisicamente intactos.
-- =========================================================

create or replace function public.delete_project_group_conversation(
  p_conversation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_conv public.project_conversations%rowtype;
  v_can_delete boolean := false;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if p_conversation_id is null then
    raise exception 'Conversation id is required';
  end if;

  select * into v_conv
  from public.project_conversations
  where id = p_conversation_id;

  if not found then
    raise exception 'Conversation not found';
  end if;

  if v_conv.kind = 'general' then
    raise exception 'General conversation cannot be deleted';
  end if;

  if v_conv.status = 'deleted' then
    -- Já está apagada: tratamos como idempotente.
    return;
  end if;

  -- a) Dono do projeto pode sempre apagar.
  if exists (
    select 1
    from public.projects p
    where p.id = v_conv.project_id
      and p.owner_id = v_user
  ) then
    v_can_delete := true;
  end if;

  -- b) Admin da conversa pode apagar.
  if not v_can_delete then
    if exists (
      select 1
      from public.project_conversation_members pcm
      where pcm.conversation_id = v_conv.id
        and pcm.user_id = v_user
        and pcm.role = 'admin'
    ) then
      v_can_delete := true;
    end if;
  end if;

  -- c) Criador da conversa pode apagar.
  if not v_can_delete then
    if v_conv.created_by = v_user then
      v_can_delete := true;
    end if;
  end if;

  if not v_can_delete then
    raise exception 'You do not have permission to delete this group';
  end if;

  update public.project_conversations
  set status = 'deleted',
      deleted_at = now(),
      deleted_by = v_user,
      updated_at = now()
  where id = v_conv.id;
end;
$$;

revoke all on function public.delete_project_group_conversation(uuid) from public;
grant execute on function public.delete_project_group_conversation(uuid) to authenticated;


-- =========================================================
-- 5. Garantia de RLS continua: o front filtra status='active'
--    mas mesmo se não filtrasse, a UI não exibe deleted.
--    A trigger acima impede que alguém apague kind='general'
--    via SQL direto.
-- =========================================================
