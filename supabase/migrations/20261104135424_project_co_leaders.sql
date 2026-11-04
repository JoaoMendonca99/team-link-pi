alter table public.project_recruitment_roles
  drop constraint project_recruitment_roles_level_check,
  add constraint project_recruitment_roles_level_check
    check (level in ('owner','manager','reviewer','member'));

create function public.is_project_leader(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.projects where id = p_project_id and owner_id = auth.uid())
    or exists(
      select 1 from public.project_members m
      join public.project_recruitment_roles r using (project_id,user_id)
      where m.project_id = p_project_id and m.user_id = auth.uid()
        and m.status = 'active' and r.level = 'owner'
    )
  );
$$;
revoke all on function public.is_project_leader(uuid) from public;
grant execute on function public.is_project_leader(uuid) to anon,authenticated;

create policy "Project leaders can read their projects" on public.projects
  for select to authenticated using (public.is_project_leader(id));
create policy "Project leaders can read project tags" on public.project_tags
  for select to authenticated using (public.is_project_leader(project_id));
create policy "Project leaders can read active project members" on public.project_members
  for select to authenticated using (status = 'active' and public.is_project_leader(project_id));

create function public.preserve_project_primary_leader()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'O Líder principal do projeto não pode ser substituído.';
  end if;
  return new;
end;
$$;
create trigger preserve_project_primary_leader before update of owner_id on public.projects
  for each row execute function public.preserve_project_primary_leader();
revoke all on function public.preserve_project_primary_leader() from public,anon,authenticated;

create or replace function public.is_project_join_manager(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_project_leader(p_project_id) or exists(
    select 1 from public.project_members m left join public.project_recruitment_roles r
      using (project_id,user_id)
    where m.project_id = p_project_id and m.user_id = auth.uid() and m.status = 'active'
      and coalesce(r.level,case when m.role in ('owner','admin') then 'manager' else 'member' end) = 'manager'
  );
$$;

create or replace function public.recruitment_set_access(
  p_project uuid,p_user uuid,p_level text,p_display_role text,p_badge_color text
)
returns void language plpgsql security definer set search_path = '' as $$
declare previous text; primary_leader uuid;
begin
  select owner_id into primary_leader from public.projects where id=p_project for update;
  if primary_leader is null or not public.is_project_leader(p_project) or p_user=primary_leader then
    raise exception 'Acesso negado';
  end if;
  if p_level is null or p_level not in ('owner','manager','reviewer','member') then
    raise exception 'Nível inválido';
  end if;
  select coalesce(r.level,case when m.role in ('owner','admin') then 'manager' else 'member' end)
    into previous from public.project_members m left join public.project_recruitment_roles r
      using (project_id,user_id)
    where m.project_id=p_project and m.user_id=p_user and m.status='active' for update of m;
  if not found then raise exception 'Integrante indisponível'; end if;
  if primary_leader <> auth.uid() and (previous = 'owner' or p_level = 'owner') then
    raise exception 'Somente o Líder principal pode alterar o nível de outro Líder.';
  end if;

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

create function public.recruitment_move_member(p_project uuid,p_user uuid,p_previous text,p_level text)
returns void language plpgsql security definer set search_path = '' as $$
declare member public.project_members; current_level text;
begin
  perform 1 from public.projects where id=p_project for update;
  if not public.is_project_leader(p_project) then raise exception 'Acesso negado'; end if;
  select * into member from public.project_members
    where project_id=p_project and user_id=p_user and status='active' for update;
  if not found then raise exception 'Integrante indisponível'; end if;
  current_level := public.recruitment_member_levels(p_project)->>p_user::text;
  if current_level is distinct from p_previous then
    raise exception 'O nível mudou. Reabra a equipe e tente novamente.';
  end if;
  perform public.recruitment_set_access(p_project,p_user,p_level,member.display_role,member.badge_color);
end;
$$;
revoke all on function public.recruitment_move_member(uuid,uuid,text,text) from public,anon;
grant execute on function public.recruitment_move_member(uuid,uuid,text,text) to authenticated;


create or replace function public.recruitment_notify_managers(p_project uuid,p_request uuid,p_title text)
returns void language sql security definer set search_path='' as $$
  insert into public.notifications(recipient_id,actor_id,project_id,join_request_id,notification_type,title,body,href)
  select r.id,auth.uid(),p_project,p_request,'join_request',p_title,'Abra o painel para ver os detalhes.',
    '/projetos/'||p.slug||'/painel#candidaturas'
  from public.projects p cross join lateral (
    select p.owner_id as id union
    select m.user_id from public.project_members m left join public.project_recruitment_roles rr
      on (rr.project_id,rr.user_id)=(m.project_id,m.user_id)
      where m.project_id=p.id and m.status='active'
      and coalesce(rr.level,case when m.role in ('owner','admin') then 'manager' else 'member' end) in ('owner','manager')
  ) r where p.id=p_project and r.id is distinct from auth.uid();
$$;

create or replace function public.recruitment_protect_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.projects where id=old.project_id and owner_id=old.user_id) then
    if tg_op='DELETE' then raise exception 'O Líder principal do projeto não pode ser removido'; end if;
    if (new.project_id,new.user_id,new.role,new.status) is distinct from (old.project_id,old.user_id,old.role,old.status)
      then raise exception 'O nível de acesso do Líder principal não pode ser alterado'; end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

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
    if not found or not public.is_project_leader(p_project_id) then
      raise exception 'Somente Líderes podem editar os dados do projeto.';
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

create or replace view public.project_public_members as
select pm.id, pm.project_id, pm.user_id, pm.role, pm.status, pm.joined_at,
  pr.full_name, pr.course, pr.bio, pr.avatar_url, pr.skills, pr.interests, pm.display_role, pm.badge_color
from public.project_members pm
join public.projects p on p.id = pm.project_id
join public.profiles pr on pr.id = pm.user_id
where pm.status = 'active' and (
  (p.visibility = 'public' and p.status <> 'archived') or public.is_project_leader(p.id)
);

create or replace view public.project_public_details with (security_invoker = true) as
 SELECT p.id,
    p.owner_id,
    p.title,
    p.slug,
    p.short_description,
    p.description,
    p.category,
    p.status,
    p.visibility,
    p.open_spots,
    p.desired_profile,
    p.created_at,
    p.updated_at,
    pr.full_name AS owner_name,
    pr.course AS owner_course,
    pr.bio AS owner_bio,
    pr.avatar_url AS owner_avatar_url,
    COALESCE(array_agg(DISTINCT pt.tag) FILTER (WHERE (pt.tag IS NOT NULL)), '{}'::text[]) AS tags,
    COALESCE(array_agg(DISTINCT prs.skill) FILTER (WHERE (prs.skill IS NOT NULL)), '{}'::text[]) AS required_skills,
    (count(DISTINCT pl.id))::integer AS likes_count,
    (count(DISTINCT pc.id) FILTER (WHERE (pc.status = 'visible'::text)))::integer AS comments_count,
    (count(DISTINCT pm.id) FILTER (WHERE (pm.status = 'active'::text)))::integer AS members_count,
    p.secondary_categories
   FROM ((((((projects p
     LEFT JOIN profiles pr ON ((pr.id = p.owner_id)))
     LEFT JOIN project_tags pt ON ((pt.project_id = p.id)))
     LEFT JOIN project_required_skills prs ON ((prs.project_id = p.id)))
     LEFT JOIN project_likes pl ON ((pl.project_id = p.id)))
     LEFT JOIN project_comments pc ON (((pc.project_id = p.id) AND (pc.status = 'visible'::text))))
     LEFT JOIN project_members pm ON (((pm.project_id = p.id) AND (pm.status = 'active'::text))))
  WHERE (p.visibility = 'public' and p.status <> 'archived') or public.is_project_leader(p.id)
  GROUP BY p.id, pr.full_name, pr.course, pr.bio, pr.avatar_url;
