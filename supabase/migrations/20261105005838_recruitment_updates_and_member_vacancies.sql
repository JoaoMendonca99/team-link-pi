-- Realtime exposes only a change signal; message content remains in the authorized RPC.
create table public.recruitment_updates (
  request_id uuid primary key references public.join_requests(id) on delete cascade,
  project_id uuid not null,
  user_id uuid not null,
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.recruitment_updates enable row level security;
revoke all on public.recruitment_updates from public, anon, authenticated;
grant select on public.recruitment_updates to authenticated;
create policy recruitment_updates_participants on public.recruitment_updates for select to authenticated
  using (user_id = (select auth.uid()) or public.is_project_join_manager(project_id));

create function public.signal_recruitment_update() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name in ('join_request_messages', 'join_request_vacancies') then
    insert into public.recruitment_updates (request_id, project_id, user_id)
      select j.id, j.project_id, j.user_id from public.join_requests j where j.id = new.request_id
      on conflict (request_id) do update set updated_at = clock_timestamp();
  else
    insert into public.recruitment_updates (request_id, project_id, user_id)
      values (new.id, new.project_id, new.user_id)
      on conflict (request_id) do update set updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.signal_recruitment_update() from public, anon, authenticated;

create trigger recruitment_message_update after insert on public.join_request_messages
  for each row execute function public.signal_recruitment_update();
create trigger recruitment_request_update after insert or update of status on public.join_requests
  for each row execute function public.signal_recruitment_update();
create trigger recruitment_vacancy_release after update of released_at on public.join_request_vacancies
  for each row when (old.released_at is distinct from new.released_at)
  execute function public.signal_recruitment_update();
alter publication supabase_realtime add table public.recruitment_updates;

-- The approved, unreleased vacancy records are already the persisted assignments.
-- Keep the public member view's existing visibility predicate and manual role column.
create or replace view public.project_public_members as
select pm.id, pm.project_id, pm.user_id, pm.role, pm.status, pm.joined_at,
  pr.full_name, pr.course, pr.bio, pr.avatar_url, pr.skills, pr.interests,
  pm.display_role, pm.badge_color,
  array(
    select distinct x.requested_title
    from public.join_requests j
    join public.join_request_vacancies x on x.request_id = j.id
    where j.project_id = pm.project_id and j.user_id = pm.user_id and j.status = 'approved'
      and x.approved_at is not null and x.released_at is null
    order by x.requested_title
  ) as vacancy_roles
from public.project_members pm
join public.projects p on p.id = pm.project_id
join public.profiles pr on pr.id = pm.user_id
where pm.status = 'active' and ((p.visibility = 'public' and p.status <> 'archived') or public.is_project_leader(p.id));
