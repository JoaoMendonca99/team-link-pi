alter table public.profile_presence alter column visible set default true;

insert into public.profile_presence as presence (user_id, visible)
select id, true from public.profiles
on conflict (user_id) do update set visible = true, last_activity = null
where not presence.visible;

create or replace function public.get_my_presence_visibility()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and coalesce(
    (select visible from public.profile_presence where user_id = auth.uid()), true
  );
$$;

create or replace function public.record_profile_activity()
returns void language sql security definer set search_path = '' as $$
  insert into public.profile_presence as presence (user_id, last_activity)
    select auth.uid(), now() where auth.uid() is not null
  on conflict (user_id) do update set last_activity = excluded.last_activity
    where presence.visible and (presence.last_activity is null or presence.last_activity < now() - interval '50 seconds');
$$;

-- Notify accepted friends to reread presence without publishing the preference or activity.
create table public.presence_preference_updates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.presence_preference_updates enable row level security;
revoke all on public.presence_preference_updates from public, anon, authenticated;
grant select on public.presence_preference_updates to authenticated;
create policy presence_preference_updates_friends on public.presence_preference_updates for select to authenticated
  using (public.get_profile_social(user_id)->>'relationship' = 'accepted');
alter publication supabase_realtime add table public.presence_preference_updates;

create function public.signal_presence_preference() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and not new.visible)
    or (tg_op = 'UPDATE' and old.visible is distinct from new.visible) then
    insert into public.presence_preference_updates (user_id) values (new.user_id)
    on conflict (user_id) do update set updated_at = clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.signal_presence_preference() from public, anon, authenticated;
create trigger signal_presence_preference after insert or update of visible on public.profile_presence
  for each row execute function public.signal_presence_preference();

-- Keep approved applications as history and keep the unique pending index.
drop index if exists public.idx_join_requests_one_approved_per_user_project;
create index idx_join_requests_approved_history on public.join_requests (project_id, user_id) where status = 'approved';

create or replace function public.recruitment_send_application(p_project uuid,p_vacancies uuid[],p_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_count int;
begin
  if auth.uid() is null then raise exception 'Acesso negado'; end if;
  perform 1 from public.projects where id=p_project and visibility='public' and status='open' for update;
  if not found or exists(select 1 from public.project_members where project_id=p_project and user_id=auth.uid() and status='active')
    then raise exception 'Projeto indisponível para candidatura'; end if;
  if exists(select 1 from public.join_requests where project_id=p_project and user_id=auth.uid() and status='pending')
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

-- Reactivating a historical row grants the same role as a first approval.
create or replace function public.add_member_when_join_request_approved()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    insert into public.project_members (project_id, user_id, role, status)
    values (new.project_id, new.user_id, 'member', 'active')
    on conflict (project_id, user_id) do update
      set role = 'member', status = 'active', updated_at = now()
      where public.project_members.status <> 'active';
  end if;
  return new;
end;
$$;
