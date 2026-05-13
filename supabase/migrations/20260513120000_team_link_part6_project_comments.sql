-- =========================================================
-- TEAM LINK - PARTE 6
-- Comentários dos projetos
-- =========================================================

-- =========================================================
-- 1. TABELA: project_comments
-- Guarda comentários feitos pelos usuários nos projetos.
-- =========================================================

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),

  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,

  content text not null check (char_length(trim(content)) > 0),

  status text not null default 'visible'
    check (status in ('visible', 'deleted', 'hidden')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- =========================================================
-- 2. ÍNDICES
-- =========================================================

create index if not exists idx_project_comments_project_id
on public.project_comments(project_id);

create index if not exists idx_project_comments_user_id
on public.project_comments(user_id);

create index if not exists idx_project_comments_status
on public.project_comments(status);

create index if not exists idx_project_comments_created_at
on public.project_comments(created_at desc);


-- =========================================================
-- 3. Trigger de updated_at
-- =========================================================

drop trigger if exists trg_project_comments_updated_at on public.project_comments;

create trigger trg_project_comments_updated_at
before update on public.project_comments
for each row
execute function public.set_updated_at();


-- =========================================================
-- 4. Função para impedir troca de projeto/usuário do comentário
-- Um comentário não pode ser "movido" para outro projeto ou outro usuário.
-- =========================================================

create or replace function public.prevent_comment_identity_change()
returns trigger
language plpgsql
as $$
begin
  if new.project_id <> old.project_id then
    raise exception 'project_id cannot be changed on project_comments';
  end if;

  if new.user_id <> old.user_id then
    raise exception 'user_id cannot be changed on project_comments';
  end if;

  return new;
end;
$$;


drop trigger if exists trg_project_comments_prevent_identity_change on public.project_comments;

create trigger trg_project_comments_prevent_identity_change
before update on public.project_comments
for each row
execute function public.prevent_comment_identity_change();


-- =========================================================
-- 5. Ativar RLS
-- =========================================================

alter table public.project_comments enable row level security;


-- =========================================================
-- 6. Policies de leitura
-- =========================================================

-- Qualquer pessoa pode ler comentários visíveis de projetos públicos não arquivados.
drop policy if exists "Visible comments are readable for public projects" on public.project_comments;

create policy "Visible comments are readable for public projects"
on public.project_comments
for select
using (
  status = 'visible'
  and exists (
    select 1
    from public.projects p
    where p.id = project_comments.project_id
      and p.visibility = 'public'
      and p.status <> 'archived'
  )
);


-- Usuário autenticado pode ler os próprios comentários.
drop policy if exists "Users can read their own comments" on public.project_comments;

create policy "Users can read their own comments"
on public.project_comments
for select
to authenticated
using (auth.uid() = user_id);


-- Dono do projeto pode ler todos os comentários dos próprios projetos.
drop policy if exists "Owners can read all comments from their projects" on public.project_comments;

create policy "Owners can read all comments from their projects"
on public.project_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_comments.project_id
      and p.owner_id = auth.uid()
  )
);


-- =========================================================
-- 7. Policies de inserção
-- =========================================================

-- Usuário autenticado pode comentar em projetos públicos não arquivados.
-- Só pode criar comentário como ele mesmo e já visível.
drop policy if exists "Authenticated users can comment on public projects" on public.project_comments;

create policy "Authenticated users can comment on public projects"
on public.project_comments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and status = 'visible'
  and exists (
    select 1
    from public.projects p
    where p.id = project_comments.project_id
      and p.visibility = 'public'
      and p.status <> 'archived'
  )
);


-- =========================================================
-- 8. Policies de atualização
-- =========================================================

-- Usuário pode editar o próprio comentário ou marcar como deleted.
drop policy if exists "Users can update their own comments" on public.project_comments;

create policy "Users can update their own comments"
on public.project_comments
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and status in ('visible', 'deleted')
);


-- Dono do projeto pode ocultar comentário do próprio projeto.
drop policy if exists "Owners can hide comments from their projects" on public.project_comments;

create policy "Owners can hide comments from their projects"
on public.project_comments
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_comments.project_id
      and p.owner_id = auth.uid()
  )
)
with check (
  status in ('visible', 'hidden', 'deleted')
);


-- =========================================================
-- 9. Policies de delete
-- =========================================================

-- Usuário pode apagar fisicamente o próprio comentário.
-- Depois, se preferir, o app pode usar status = deleted em vez de delete real.
drop policy if exists "Users can delete their own comments" on public.project_comments;

create policy "Users can delete their own comments"
on public.project_comments
for delete
to authenticated
using (auth.uid() = user_id);


-- Dono do projeto pode apagar comentário do próprio projeto.
drop policy if exists "Owners can delete comments from their projects" on public.project_comments;

create policy "Owners can delete comments from their projects"
on public.project_comments
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_comments.project_id
      and p.owner_id = auth.uid()
  )
);


-- =========================================================
-- 10. Permissões básicas para Data API
-- RLS continua sendo a proteção real.
-- =========================================================

grant usage on schema public to anon, authenticated;

grant select on public.project_comments to anon, authenticated;
grant insert, update, delete on public.project_comments to authenticated;
