-- Freeze the previous effective levels before removing creator and legacy role shortcuts.
lock table public.projects, public.project_members, public.project_recruitment_roles
  in share row exclusive mode;

insert into public.project_recruitment_roles (project_id,user_id,level)
select m.project_id,m.user_id,case
  when m.user_id = p.owner_id then 'owner'
  when m.role in ('owner','admin') then 'manager'
  else 'member'
end
from public.project_members m join public.projects p on p.id = m.project_id
where m.status = 'active'
on conflict (project_id,user_id) do nothing;

create or replace function public.is_project_join_manager(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_members m
    join public.project_recruitment_roles r using (project_id,user_id)
    where m.project_id = p_project_id and m.user_id = auth.uid() and m.status = 'active'
      and r.level in ('owner','manager')
  );
$$;

-- Existing callers and views still use this name.
create or replace function public.is_project_leader(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_project_join_manager(p_project_id);
$$;

create or replace function public.add_owner_member_when_project_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.project_members (project_id,user_id,role,status)
    values (new.id,new.owner_id,'owner','active')
    on conflict (project_id,user_id) do update set role='owner',status='active',updated_at=now();
  insert into public.project_recruitment_roles (project_id,user_id,level)
    values (new.id,new.owner_id,'owner')
    on conflict (project_id,user_id) do update set level='owner';
  return new;
end;
$$;

-- The UPDATE takes the same per-project lock as the existing RPCs and writes
-- a new row version. At higher isolation levels a stale writer must retry.
create function public.assert_project_has_administrator(p_project uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.projects set updated_at=clock_timestamp() where id=p_project;
  if not found then return; end if; -- The whole project can be deleted.

  if not exists (
    select 1 from public.project_members m
    join public.project_recruitment_roles r using (project_id,user_id)
    where m.project_id=p_project and m.status='active' and r.level in ('owner','manager')
  ) then
    raise exception 'Este projeto precisa ter pelo menos um Líder ou Gestor. Promova outro integrante antes de realizar esta alteração.';
  end if;
end;
$$;

create function public.guard_project_administrator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'projects' then
    perform public.assert_project_has_administrator(new.id);
  elsif tg_table_name = 'project_members' then
    if old.status = 'active' then
      if tg_op = 'DELETE' then
        perform public.assert_project_has_administrator(old.project_id);
      elsif (old.project_id,old.user_id,old.status) is distinct from
            (new.project_id,new.user_id,new.status) then
        perform public.assert_project_has_administrator(old.project_id);
      end if;
    end if;
  elsif old.level in ('owner','manager') then
    if tg_op = 'DELETE' then
      perform public.assert_project_has_administrator(old.project_id);
    elsif new.level not in ('owner','manager') or
          (old.project_id,old.user_id) is distinct from (new.project_id,new.user_id) then
      perform public.assert_project_has_administrator(old.project_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger recruitment_protect_owner on public.project_members;
create trigger guard_project_administrator_members
  after update of status,project_id,user_id or delete on public.project_members
  for each row execute function public.guard_project_administrator();
create trigger guard_project_administrator_levels
  after update or delete on public.project_recruitment_roles
  for each row execute function public.guard_project_administrator();
create constraint trigger guard_project_administrator_on_create
  after insert on public.projects deferrable initially deferred
  for each row execute function public.guard_project_administrator();

revoke all on function public.assert_project_has_administrator(uuid),
  public.guard_project_administrator() from public,anon,authenticated;

-- Fail atomically if an existing project did not have an active administrator.
do $$
begin
  if exists (
    select 1 from public.projects p where not exists (
      select 1 from public.project_members m
      join public.project_recruitment_roles r using (project_id,user_id)
      where m.project_id=p.id and m.status='active' and r.level in ('owner','manager')
    )
  ) then
    raise exception 'Há projetos existentes sem administrador ativo.';
  end if;
end;
$$;

drop policy if exists "Owners can read their own projects" on public.projects;
drop policy if exists "Owners can update their own projects" on public.projects;
drop policy if exists "Owners can delete their own projects" on public.projects;
create policy "Project administrators can update projects" on public.projects
  for update to authenticated using (public.is_project_join_manager(id))
  with check (public.is_project_join_manager(id));
create policy "Project administrators can delete projects" on public.projects
  for delete to authenticated using (public.is_project_join_manager(id));

drop policy if exists "Owners can read all memberships from their projects" on public.project_members;
drop policy if exists "Owners can insert members in their projects" on public.project_members;
drop policy if exists "Owners can update members in their projects" on public.project_members;
drop policy if exists "Owners can delete members from their projects" on public.project_members;
alter policy "Project leaders can read active project members" on public.project_members
  using (public.is_project_join_manager(project_id));
create policy "Project administrators can remove project members" on public.project_members
  for delete to authenticated using (public.is_project_join_manager(project_id));

create policy "Project administrators can deactivate project members" on public.project_members
  for update to authenticated using (status = 'active' and public.is_project_join_manager(project_id))
  with check (status in ('removed','left') and public.is_project_join_manager(project_id));

-- Clients can change status only. Legacy roles and SAC fields remain RPC-managed.
revoke truncate on public.projects, public.project_members from public,anon,authenticated;
revoke update on public.project_members from public,anon,authenticated;
grant update(status) on public.project_members to authenticated;

drop policy if exists "Owners can delete tags from their own projects" on public.project_tags;
drop policy if exists "Owners can insert tags in their own projects" on public.project_tags;
drop policy if exists "Owners can read tags from their own projects" on public.project_tags;
drop policy if exists "Owners can update tags in their own projects" on public.project_tags;
create policy "Project administrators can manage tags" on public.project_tags
  for all to authenticated using (public.is_project_join_manager(project_id))
  with check (public.is_project_join_manager(project_id));

drop policy if exists "Owners can delete skills from their own projects" on public.project_required_skills;
drop policy if exists "Owners can insert skills in their own projects" on public.project_required_skills;
drop policy if exists "Owners can read skills from their own projects" on public.project_required_skills;
drop policy if exists "Owners can update skills in their own projects" on public.project_required_skills;
create policy "Project administrators can manage skills" on public.project_required_skills
  for all to authenticated using (public.is_project_join_manager(project_id))
  with check (public.is_project_join_manager(project_id));

create or replace function public.recruitment_member_levels(p_project uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(m.user_id,coalesce(r.level,'member')),'{}'::jsonb)
  from public.projects p join public.project_members m on m.project_id=p.id
  left join public.project_recruitment_roles r using (project_id,user_id)
  where p.id=p_project and m.status='active' and (
    (p.visibility='public' and p.status<>'archived')
    or m.user_id=auth.uid() or public.is_project_join_manager(p.id)
  );
$$;

create or replace function public.recruitment_notify_managers(p_project uuid,p_request uuid,p_title text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications(recipient_id,actor_id,project_id,join_request_id,notification_type,title,body,href)
  select m.user_id,auth.uid(),p_project,p_request,'join_request',p_title,'Abra o painel para ver os detalhes.',
    '/projetos/'||p.slug||'/painel#candidaturas'
  from public.projects p join public.project_members m on m.project_id=p.id
  join public.project_recruitment_roles r using (project_id,user_id)
  where p.id=p_project and m.status='active' and r.level in ('owner','manager')
    and m.user_id is distinct from auth.uid();
$$;


create or replace function public.recruitment_set_access(
  p_project uuid,p_user uuid,p_level text,p_display_role text,p_badge_color text
)
returns void language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
  perform 1 from public.projects where id=p_project for update;
  if not public.is_project_join_manager(p_project) then raise exception 'Acesso negado'; end if;
  if p_level is null or p_level not in ('owner','manager','reviewer','member') then
    raise exception 'Nível inválido';
  end if;
  select coalesce(r.level,'member')
    into previous from public.project_members m left join public.project_recruitment_roles r
      using (project_id,user_id)
    where m.project_id=p_project and m.user_id=p_user and m.status='active' for update of m;
  if not found then raise exception 'Integrante indisponível'; end if;
  update public.project_members set display_role=nullif(btrim(p_display_role),''),badge_color=p_badge_color
    where project_id=p_project and user_id=p_user;
  if previous is distinct from p_level then
    insert into public.project_recruitment_roles(project_id,user_id,level) values(p_project,p_user,p_level)
      on conflict(project_id,user_id) do update set level=excluded.level;
    insert into public.project_recruitment_role_history(project_id,user_id,actor_id,previous_level,level)
      values(p_project,p_user,auth.uid(),previous,p_level);
    insert into public.notifications(recipient_id,actor_id,project_id,notification_type,title,body,href)
      values(p_user,auth.uid(),p_project,'join_request','Nível de acesso alterado',
        'Seu nível de acesso no projeto mudou.','/projetos/'||p_project::text);
  end if;
end;
$$;

CREATE OR REPLACE FUNCTION public.update_project_member_visual_role(p_project_id uuid, p_user_id uuid, p_display_role text, p_badge_color text)
 RETURNS TABLE(member_id uuid, project_id uuid, user_id uuid, role text, display_role text, badge_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth_user uuid;
  v_is_allowed boolean;
  v_display_role text;
  v_badge_color text;
begin
  v_auth_user := auth.uid();

  if v_auth_user is null then
    raise exception 'Usuário não autenticado.';
  end if;

  perform 1 from public.projects where id=p_project_id for update;
  v_is_allowed := public.is_project_join_manager(p_project_id);

  if not v_is_allowed then
    raise exception 'Você não tem permissão para alterar cargos deste projeto.';
  end if;

  -- Confere se o usuário alvo realmente é membro ativo do projeto.
  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
      and pm.status = 'active'
  ) then
    raise exception 'Membro não encontrado neste projeto.';
  end if;

  v_display_role := nullif(trim(coalesce(p_display_role, '')), '');
  v_badge_color := nullif(trim(coalesce(p_badge_color, '')), '');

  if v_display_role is not null and length(v_display_role) > 40 then
    raise exception 'O cargo deve ter no máximo 40 caracteres.';
  end if;

  -- Cores permitidas para evitar valor livre perigoso no front.
  if v_badge_color is not null and v_badge_color not in (
    'blue',
    'green',
    'emerald',
    'cyan',
    'violet',
    'purple',
    'amber',
    'orange',
    'rose',
    'red',
    'slate'
  ) then
    raise exception 'Cor inválida.';
  end if;

  update public.project_members pm
  set
    display_role = v_display_role,
    badge_color = v_badge_color
  where pm.project_id = p_project_id
    and pm.user_id = p_user_id
    and pm.status = 'active';

  return query
  select
    pm.id as member_id,
    pm.project_id,
    pm.user_id,
    pm.role,
    pm.display_role,
    pm.badge_color
  from public.project_members pm
  where pm.project_id = p_project_id
    and pm.user_id = p_user_id
    and pm.status = 'active';
end;
$function$;


create or replace function public.save_project_form(
  p_project_id uuid, p_slug text, p_title text, p_category text,
  p_secondary_categories text[], p_project_url text, p_short_description text,
  p_description text, p_status text, p_visibility text, p_tags text[], p_vacancies jsonb
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  saved public.projects;
  current_category text;
  vacancy record;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar o projeto.'; end if;
  if p_project_id is not null then
    select category into current_category from public.projects
      where id = p_project_id for update;
    if not found or not public.is_project_join_manager(p_project_id) then
      raise exception 'Somente Líderes ou Gestores podem editar os dados do projeto.';
    end if;
  end if;

  if p_category is null or (p_category is distinct from current_category and p_category not in (
    'Sistemas embutidos', 'Saúde e biometria', 'Educação e inclusão',
    'Sustentabilidade', 'Robótica', 'Data & comunidade', 'Tecnologia e inovação', 'Engenharia'
  )) then raise exception 'Selecione uma categoria principal válida.'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 120 then
    raise exception 'Informe um título de até 120 caracteres.';
  end if;
  if nullif(btrim(p_short_description), '') is null or nullif(btrim(p_description), '') is null then
    raise exception 'Preencha a descrição curta e a descrição completa.';
  end if;
  if not exists (select 1 from unnest(p_tags) as tag where length(btrim(tag)) > 0) then
    raise exception 'Adicione pelo menos uma tag geral.';
  end if;
  if p_project_url is not null and p_project_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'Informe um link externo válido.';
  end if;

  if p_project_id is null then
    if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Informe um título que gere um endereço válido.';
    end if;
    insert into public.projects (
      owner_id, slug, title, category, secondary_categories, project_url,
      short_description, description, status, visibility
    ) values (
      auth.uid(), p_slug, btrim(p_title), p_category, p_secondary_categories, p_project_url,
      btrim(p_short_description), btrim(p_description), p_status, p_visibility
    ) returning * into saved;
  else
    update public.projects set title = btrim(p_title), category = p_category,
      secondary_categories = p_secondary_categories, project_url = p_project_url,
      short_description = btrim(p_short_description), description = btrim(p_description),
      status = p_status, visibility = p_visibility
    where id = p_project_id
    returning * into saved;
    if not found then raise exception 'Não foi possível salvar o projeto.'; end if;
  end if;

  delete from public.project_tags
    where project_id = saved.id and not exists (
      select 1 from unnest(p_tags) as tag where btrim(tag) = project_tags.tag
    );
  insert into public.project_tags (project_id, tag)
    select distinct saved.id, btrim(tag) from unnest(p_tags) as tag where length(btrim(tag)) > 0
    on conflict do nothing;

  for vacancy in select * from jsonb_to_recordset(p_vacancies) as v(
    id uuid, title text, description text, skills text[], positions integer, open boolean
  ) loop
    perform public.recruitment_save_vacancy(saved.id, vacancy.id, vacancy.title,
      vacancy.description, vacancy.skills, vacancy.positions, vacancy.open);
  end loop;
  return saved.slug;
end;
$$;

create or replace function public.recruitment_send_application(p_project uuid,p_vacancies uuid[],p_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count int;
begin
  if auth.uid() is null then raise exception 'Acesso negado'; end if;
  perform 1 from public.projects where id=p_project and visibility='public' and status='open' for update;
  if not found or exists(select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active')
    then raise exception 'Projeto indisponível para candidatura'; end if;
  if exists(select 1 from public.join_requests where project_id=p_project and user_id=auth.uid() and status in ('pending','approved'))
    then raise exception 'Já existe uma candidatura ativa'; end if;
  v_count := coalesce(cardinality(p_vacancies),0);
  if v_count not between 1 and 50 or length(coalesce(p_message,''))>4000 then
    raise exception 'Selecione pelo menos uma vaga e confira a apresentação';
  end if;
  if v_count <> (select count(*) from public.project_vacancies v where v.project_id=p_project and v.open and v.id=any(p_vacancies)
    and v.positions>(select count(*) from public.join_request_vacancies j where j.vacancy_id=v.id and j.approved_at is not null and j.released_at is null))
    then raise exception 'Uma das vagas selecionadas está indisponível'; end if;
  insert into public.join_requests(project_id,user_id,message,status)
    values(p_project,auth.uid(),nullif(btrim(p_message),''),'pending') returning id into v_id;
  insert into public.join_request_vacancies(request_id,vacancy_id,requested_title)
    select v_id,id,title from public.project_vacancies where id=any(p_vacancies);
  return v_id;
end;
$$;

-- Recruitment write access remains RPC-only, and the original creator loses the legacy read exception.
drop policy if exists "Project owners can read join requests from their projects" on public.join_requests;
drop policy if exists "Project owners can decide join requests" on public.join_requests;
drop policy if exists "Project owners can delete join requests from their projects" on public.join_requests;

drop policy if exists "Owners can read likes from their projects" on public.project_likes;
create policy "Project administrators can read project likes" on public.project_likes
  for select to authenticated using (public.is_project_join_manager(project_id));

drop policy if exists "Owners can read all comments from their projects" on public.project_comments;
drop policy if exists "Owners can hide comments from their projects" on public.project_comments;
drop policy if exists "Owners can delete comments from their projects" on public.project_comments;
create policy "Project administrators can read all project comments" on public.project_comments
  for select to authenticated using (public.is_project_join_manager(project_id));
create policy "Project administrators can hide project comments" on public.project_comments
  for update to authenticated using (public.is_project_join_manager(project_id))
  with check (public.is_project_join_manager(project_id) and status in ('visible','hidden','deleted'));
create policy "Project administrators can delete project comments" on public.project_comments
  for delete to authenticated using (public.is_project_join_manager(project_id));

-- Legacy chat policies ask about the current session's project administrator.
create or replace function public.is_project_owner(p_project_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p_user_id = auth.uid(), false) and public.is_project_join_manager(p_project_id);
$$;

CREATE OR REPLACE FUNCTION public.delete_project_group_conversation(p_conversation_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_kind text;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select
    c.project_id,
    c.kind,
    c.status
  into
    v_project_id,
    v_kind,
    v_status
  from public.project_conversations c
  where c.id = p_conversation_id;

  if not found then
    raise exception 'Conversa não encontrada.';
  end if;

  if v_kind = 'general' then
    raise exception 'A conversa geral do projeto não pode ser excluída.';
  end if;

  if v_kind <> 'group' then
    raise exception 'Apenas grupos podem ser excluídos por esta ação.';
  end if;

  if v_status = 'deleted' then
    return true;
  end if;

  -- Preserve conversation-level administrators alongside project administrators.
  if not exists (
    select 1
    from public.project_conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = v_user_id
      and cm.role = 'admin'
  )
  and not public.is_project_join_manager(v_project_id) then
    raise exception 'Você não tem permissão para excluir este grupo.';
  end if;

  update public.project_conversations
  set
    status = 'deleted',
    deleted_at = now(),
    deleted_by = v_user_id,
    updated_at = now()
  where id = p_conversation_id;

  return true;
end;
$function$;
