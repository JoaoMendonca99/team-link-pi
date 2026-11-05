alter table public.join_request_vacancies add column rejected_at timestamptz;
create index join_request_vacancies_undecided_idx on public.join_request_vacancies(vacancy_id)
  where rejected_at is null and approved_at is null;
alter table public.join_requests add column decision_reason text check (decision_reason = 'vacancy_filled');

alter table public.project_members drop constraint if exists project_members_display_role_len_check;
alter table public.project_members add constraint project_members_display_role_len_check
  check (display_role is null or char_length(btrim(display_role)) between 1 and 120);

create function public.guard_filled_vacancy_decision() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.rejected_at is not null and new.approved_at is distinct from old.approved_at then
    raise exception 'Esta opção foi recusada porque a vaga foi preenchida.';
  end if;
  return new;
end;
$$;
create trigger guard_filled_vacancy_decision before update of approved_at on public.join_request_vacancies
  for each row execute function public.guard_filled_vacancy_decision();

-- recruitment_decide holds the project lock through approval and these updates.
create function public.finish_recruitment_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
declare affected record; project_title text; project_slug text; alternatives text;
begin
  update public.project_members m set display_role = (
    select x.requested_title from public.join_request_vacancies x
    where x.request_id = new.id and x.approved_at is not null
    order by x.requested_title, x.vacancy_id limit 1
  )
  where m.project_id = new.project_id and m.user_id = new.user_id and m.status = 'active'
    and exists(select 1 from public.join_request_vacancies x where x.request_id = new.id and x.approved_at is not null);

  select p.title, p.slug into project_title, project_slug from public.projects p where p.id = new.project_id;
  select string_agg(v.title, ', ' order by v.title) into alternatives
  from (select v.title from public.project_vacancies v where v.project_id = new.project_id and v.open
    and v.positions > (select count(*) from public.join_request_vacancies x
      where x.vacancy_id = v.id and x.approved_at is not null and x.released_at is null)
    order by v.title, v.id limit 5) v;

  for affected in
    with filled as (
      select v.id, v.title from public.join_request_vacancies own
      join public.project_vacancies v on v.id = own.vacancy_id
      where own.request_id = new.id and own.approved_at is not null
        and v.positions <= (select count(*) from public.join_request_vacancies x
          where x.vacancy_id = v.id and x.approved_at is not null and x.released_at is null)
    ), rejected as (
      update public.join_request_vacancies x set rejected_at = now()
      from filled f, public.join_requests j
      where x.vacancy_id = f.id and x.request_id = j.id and j.project_id = new.project_id
        and j.status = 'pending' and x.rejected_at is null and x.approved_at is null
      returning x.request_id, j.user_id, f.title
    )
    select r.request_id, r.user_id, string_agg(distinct r.title, ', ' order by r.title) as titles
    from rejected r group by r.request_id, r.user_id
  loop
    if not exists(select 1 from public.join_request_vacancies x where x.request_id = affected.request_id and x.rejected_at is null) then
      update public.join_requests set status = 'rejected', decision_reason = 'vacancy_filled', decided_at = now()
      where id = affected.request_id and status = 'pending';
    else
      insert into public.recruitment_updates (request_id, project_id, user_id)
      values (affected.request_id, new.project_id, affected.user_id)
      on conflict (request_id) do update set updated_at = clock_timestamp();
    end if;

    insert into public.notifications (recipient_id, actor_id, project_id, join_request_id, notification_type, title, body, href)
    values (affected.user_id, coalesce(auth.uid(), new.decided_by), new.project_id, affected.request_id, 'join_rejected', 'Vaga preenchida',
      format('Projeto: %s. Vaga preenchida: %s.', project_title, affected.titles) ||
      case when alternatives is not null then format(' Outras vagas abertas: %s.', alternatives) else '' end,
      '/projetos/' || project_slug || '#participar');
  end loop;
  return new;
end;
$$;
revoke all on function public.finish_recruitment_approval() from public, anon, authenticated;
create trigger zz_finish_recruitment_approval after update of status on public.join_requests
  for each row when (new.status = 'approved' and old.status is distinct from new.status)
  execute function public.finish_recruitment_approval();

-- Backfill unassigned roles and the specifically reported discrepancy.
with roles as (
  select j.project_id, j.user_id, array_agg(distinct x.requested_title order by x.requested_title) as vacancy_roles
  from public.join_requests j join public.join_request_vacancies x on x.request_id = j.id
  where j.status = 'approved' and x.approved_at is not null and x.released_at is null
  group by j.project_id, j.user_id
), reported as (
  select m.project_id, m.user_id
  from public.project_members m join public.profiles p on p.id = m.user_id
  join roles r on r.project_id = m.project_id and r.user_id = m.user_id
  where p.full_name = 'Arthur Raposo de Castro' and m.status = 'active'
    and m.display_role = 'Desenvolvedor'
    and r.vacancy_roles = array['Analista de UX/UI e Melhorias Visuais']
)
update public.project_members m set display_role = roles.vacancy_roles[1]
from roles
where m.project_id = roles.project_id and m.user_id = roles.user_id and m.status = 'active'
  and cardinality(roles.vacancy_roles) > 0
  and (m.display_role is null or (
    (select count(*) from reported) = 1
    and (m.project_id, m.user_id) in (select project_id, user_id from reported)
  ));

CREATE OR REPLACE FUNCTION public.notify_join_request_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project_title text;
  v_actor_id uuid;
  v_notification_type text;
  v_title text;
  v_body text;
begin
  if new.decision_reason = 'vacancy_filled' or new.status not in ('approved', 'rejected') then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  select title, owner_id
  into v_project_title, v_actor_id
  from public.projects
  where id = new.project_id;

  if new.status = 'approved' then
    v_notification_type := 'join_approved';
    v_title := 'Participação aceita';
    v_body := 'Sua solicitação para participar do projeto "' || coalesce(v_project_title, 'Projeto') || '" foi aceita.';
  else
    v_notification_type := 'join_rejected';
    v_title := 'Participação recusada';
    v_body := 'Sua solicitação para participar do projeto "' || coalesce(v_project_title, 'Projeto') || '" foi recusada.';
  end if;

  perform public.create_notification(
    new.user_id,
    coalesce(auth.uid(), v_actor_id),
    new.project_id,
    null,
    null,
    new.id,
    v_notification_type,
    v_title,
    v_body,
    '/projetos/' || new.project_id::text,
    jsonb_build_object(
      'project_title', v_project_title,
      'join_request_id', new.id,
      'status', new.status
    )
  );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recruitment_applications(p_project uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',j.id,'project_id',j.project_id,'project_title',p.title,'slug',p.slug,
    'user_id',j.user_id,'name',a.full_name,'avatar',a.avatar_url,'message',j.message,
    'created_at',j.created_at,'decided_at',j.decided_at,'decision_reason',j.decision_reason,
    'status',case when j.status='pending' and j.recruitment_review_started_at is not null then 'review' else j.status end,
    'vacancies',(select coalesce(jsonb_agg(jsonb_build_object('id',x.vacancy_id,'title',x.requested_title,
      'approved',x.approved_at is not null,'rejected',x.rejected_at is not null) order by x.requested_title,x.vacancy_id),'[]'::jsonb)
      from public.join_request_vacancies x where x.request_id=j.id),
    'unread',(select count(*) from public.join_request_messages m where m.request_id=j.id and m.sender_id is distinct from auth.uid()
      and m.id>coalesce((select last_message_id from public.join_request_message_reads
        where request_id=j.id and user_id=auth.uid()),0))
  ) order by j.created_at desc,j.id),'[]'::jsonb)
  from public.join_requests j join public.projects p on p.id=j.project_id
    left join public.profiles a on a.id=j.user_id
  where auth.uid() is not null and ((p_project is null and j.user_id=auth.uid()) or
    (j.project_id=p_project and (j.user_id=auth.uid() or public.is_project_join_manager(p_project))));
$function$;

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

  if v_display_role is not null and length(v_display_role) > 120 then
    raise exception 'O cargo deve ter no máximo 120 caracteres.';
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
