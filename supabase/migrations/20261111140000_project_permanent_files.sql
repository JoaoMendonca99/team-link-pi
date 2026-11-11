-- =========================================================
-- TEAM LINK - PROMPT 49
-- Arquivos permanentes por projeto e persistência de seleção
-- =========================================================

-- 1. Bucket privado para arquivos do projeto
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-files',
  'project-files',
  false,
  10485760,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

-- 2. Tabela public.project_files
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check(length(btrim(name)) between 1 and 180),
  filename text not null check(length(btrim(filename)) between 1 and 180),
  path text not null unique,
  mime text not null check(mime in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size integer not null check(size between 1 and 10485760),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  uploader_id uuid references public.profiles(id) on delete set null,
  selected_for_package boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_files_project_created on public.project_files(project_id, created_at desc);
create index if not exists idx_project_files_uploader on public.project_files(uploader_id);

-- 3. RLS em public.project_files
alter table public.project_files enable row level security;
revoke all on public.project_files from public, anon, authenticated;
grant select on public.project_files to authenticated;

drop policy if exists project_files_select_members on public.project_files;
create policy project_files_select_members on public.project_files
for select to authenticated
using (report_private.can_access(project_id));

-- 4. RPC para alternar seleção de documento para o pacote
create or replace function public.set_project_file_selected(p_file_id uuid, p_selected boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_file public.project_files;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select * into v_file from public.project_files where id = p_file_id;
  if not found then raise exception 'Arquivo não encontrado.'; end if;
  if not report_private.can_access(v_file.project_id) then raise exception 'Acesso não autorizado.'; end if;
  update public.project_files set selected_for_package = p_selected, updated_at = now() where id = p_file_id;
end $$;
revoke all on function public.set_project_file_selected(uuid, boolean) from public, anon;
grant execute on function public.set_project_file_selected(uuid, boolean) to authenticated;

-- 5. RPC para registrar / substituir arquivo do projeto
create or replace function public.save_project_file(
  p_project_id uuid,
  p_name text,
  p_filename text,
  p_path text,
  p_mime text,
  p_size integer,
  p_sha256 text,
  p_replace_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_proj public.projects;
  v_file public.project_files;
  v_old_path text := null;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select * into v_proj from public.projects where id = p_project_id;
  if not found then raise exception 'Projeto indisponível.'; end if;
  if v_proj.status in ('completed', 'archived') then raise exception 'Projeto em somente leitura.'; end if;
  if not public.is_project_join_manager(p_project_id) then raise exception 'Apenas líderes e gestores podem enviar arquivos ao projeto.'; end if;

  if p_replace_id is not null then
    select * into v_file from public.project_files where id = p_replace_id and project_id = p_project_id for update;
    if not found then raise exception 'Arquivo para substituição não encontrado.'; end if;
    v_old_path := v_file.path;
    update public.project_files
    set name = coalesce(nullif(btrim(p_name), ''), v_file.name),
        filename = p_filename,
        path = p_path,
        mime = p_mime,
        size = p_size,
        sha256 = p_sha256,
        uploader_id = auth.uid(),
        updated_at = now()
    where id = p_replace_id
    returning * into v_file;
    return jsonb_build_object('ok', true, 'file', to_jsonb(v_file), 'old_path', v_old_path);
  else
    insert into public.project_files (
      project_id, name, filename, path, mime, size, sha256, uploader_id, selected_for_package
    ) values (
      p_project_id,
      coalesce(nullif(btrim(p_name), ''), p_filename),
      p_filename,
      p_path,
      p_mime,
      p_size,
      p_sha256,
      auth.uid(),
      false
    ) returning * into v_file;
    return jsonb_build_object('ok', true, 'file', to_jsonb(v_file), 'old_path', null);
  end if;
end $$;
revoke all on function public.save_project_file(uuid, text, text, text, text, integer, text, uuid) from public, anon;
grant execute on function public.save_project_file(uuid, text, text, text, text, integer, text, uuid) to authenticated, service_role;

-- 6. RPC para exclusão de arquivo do projeto
create or replace function public.delete_project_file(p_file_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_file public.project_files;
  v_proj public.projects;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  select * into v_file from public.project_files where id = p_file_id for update;
  if not found then raise exception 'Arquivo não encontrado.'; end if;
  select * into v_proj from public.projects where id = v_file.project_id;
  if v_proj.status in ('completed', 'archived') then raise exception 'Projeto em somente leitura.'; end if;
  if not public.is_project_join_manager(v_file.project_id) then raise exception 'Apenas líderes e gestores podem remover arquivos do projeto.'; end if;

  delete from public.project_files where id = p_file_id;
  return jsonb_build_object('ok', true, 'path', v_file.path);
end $$;
revoke all on function public.delete_project_file(uuid) from public, anon;
grant execute on function public.delete_project_file(uuid) to authenticated, service_role;
