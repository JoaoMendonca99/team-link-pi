-- Permit recruitment in public projects that are open or already in progress.
-- Preserve manager access, vacancy-specific openness, capacity checks and all other guards.
-- Keep signatures and SECURITY DEFINER semantics consistent with existing recruitment RPCs.

create or replace function public.recruitment_vacancies(p_project uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', v.id, 'title', v.title, 'description', v.description, 'skills', v.skills,
    'positions', v.positions, 'available', v.positions - occupied.total,
    'open', v.open, 'legacy', v.legacy
  ) order by v.created_at, v.id), '[]'::jsonb)
  from public.project_vacancies v
  join public.projects p on p.id = v.project_id
  cross join lateral (
    select count(*) as total
    from public.join_request_vacancies x
    where x.vacancy_id = v.id
      and x.approved_at is not null
      and x.released_at is null
  ) occupied
  where v.project_id = p_project
    and (
      public.is_project_join_manager(p_project)
      or (
        p.visibility = 'public'
        and p.status in ('open', 'in_progress')
        and v.open
      )
    );
$$;

create or replace function public.recruitment_send_application(
  p_project uuid, p_vacancies uuid[], p_message text
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'Acesso negado'; end if;

  perform 1 from public.projects
  where id = p_project and visibility = 'public'
    and status in ('open', 'in_progress')
  for update;

  if not found or exists (
    select 1 from public.project_members
    where project_id = p_project and user_id = auth.uid() and status = 'active'
  ) then raise exception 'Projeto indisponível para candidatura'; end if;

  if exists (
    select 1 from public.join_requests
    where project_id = p_project and user_id = auth.uid() and status = 'pending'
  ) then raise exception 'Já existe uma candidatura ativa'; end if;

  v_count := coalesce(cardinality(p_vacancies), 0);
  if v_count not between 1 and 50 or length(coalesce(p_message, '')) > 4000 then
    raise exception 'Selecione pelo menos uma vaga e confira a apresentação';
  end if;

  if v_count <> (
    select count(*) from public.project_vacancies v
    where v.project_id = p_project and v.open and v.id = any(p_vacancies)
      and v.positions > (
        select count(*) from public.join_request_vacancies j
        where j.vacancy_id = v.id and j.approved_at is not null and j.released_at is null
      )
  ) then raise exception 'Uma das vagas selecionadas está indisponível'; end if;

  insert into public.join_requests(project_id, user_id, message, status)
  values (p_project, auth.uid(), nullif(btrim(p_message), ''), 'pending')
  returning id into v_id;

  insert into public.join_request_vacancies(request_id, vacancy_id, requested_title)
  select v_id, id, title from public.project_vacancies
  where id = any(p_vacancies);

  return v_id;
end;
$$;
