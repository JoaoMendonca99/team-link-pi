alter table public.projects
  add column secondary_categories text[] not null default '{}',
  add constraint projects_category_required check (length(btrim(category)) > 0),
  add constraint projects_secondary_categories_valid check (
    cardinality(secondary_categories) <= 2
    and secondary_categories <@ array[
      'Sistemas embutidos', 'Saúde e biometria', 'Educação e inclusão',
      'Sustentabilidade', 'Robótica', 'Data & comunidade', 'Tecnologia e inovação', 'Engenharia'
    ]
    and not (category = any(secondary_categories))
    and (cardinality(secondary_categories) < 2 or secondary_categories[1] <> secondary_categories[2])
    and (cardinality(secondary_categories) = 0 or
      (array_ndims(secondary_categories) = 1 and array_lower(secondary_categories, 1) = 1))
  );

create function public.save_project_form(
  p_project_id uuid, p_slug text, p_title text, p_category text,
  p_secondary_categories text[], p_project_url text, p_short_description text,
  p_description text, p_status text, p_visibility text, p_tags text[], p_vacancies jsonb
)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  saved public.projects;
  current_category text;
  vacancy record;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para salvar o projeto.'; end if;
  if p_project_id is not null then
    select category into current_category from public.projects
      where id = p_project_id and owner_id = auth.uid() for update;
    if not found then raise exception 'Somente o dono pode editar os dados do projeto.'; end if;
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
    where id = p_project_id and owner_id = auth.uid()
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

revoke all on function public.save_project_form(uuid,text,text,text,text[],text,text,text,text,text,text[],jsonb)
  from public, anon;
grant execute on function public.save_project_form(uuid,text,text,text,text[],text,text,text,text,text,text[],jsonb)
  to authenticated;

create or replace view public.project_public_cards with (security_invoker = true) as
select p.id, p.owner_id, p.title, p.slug, p.short_description, p.category, p.status, p.visibility,
  p.open_spots, p.desired_profile, p.created_at, p.updated_at,
  pr.full_name as owner_name, pr.course as owner_course, pr.avatar_url as owner_avatar_url,
  coalesce(array_agg(distinct pt.tag) filter (where pt.tag is not null), '{}'::text[]) as tags,
  coalesce(array_agg(distinct prs.skill) filter (where prs.skill is not null), '{}'::text[]) as required_skills,
  count(distinct pl.id)::integer as likes_count,
  (count(distinct pc.id) filter (where pc.status = 'visible'))::integer as comments_count,
  (count(distinct pm.id) filter (where pm.status = 'active'))::integer as members_count,
  p.secondary_categories,
  case when p.status = 'open' then (
    select coalesce(sum(v.available), 0)::integer
    from jsonb_to_recordset(public.recruitment_vacancies(p.id)) as v(available integer, open boolean)
    where v.open and v.available > 0
  ) else 0 end as available_positions
from public.projects p
left join public.profiles pr on pr.id = p.owner_id
left join public.project_tags pt on pt.project_id = p.id
left join public.project_required_skills prs on prs.project_id = p.id
left join public.project_likes pl on pl.project_id = p.id
left join public.project_comments pc on pc.project_id = p.id and pc.status = 'visible'
left join public.project_members pm on pm.project_id = p.id and pm.status = 'active'
where p.visibility = 'public' and p.status <> 'archived'
group by p.id, pr.full_name, pr.course, pr.avatar_url;
