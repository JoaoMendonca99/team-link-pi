-- Private, account-scoped onboarding preferences and verified action history only.
-- No profile copies, client-writable completion flags, or changes to existing RLS.
create schema onboarding_private;
revoke all on schema onboarding_private from public, anon, authenticated;
grant usage on schema onboarding_private to authenticated;

create table onboarding_private.preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  goal text not null check (goal in ('create', 'participate')),
  hidden boolean not null default false,
  created_project boolean not null default false,
  participated boolean not null default false,
  connected boolean not null default false,
  completed_at timestamptz,
  completion_seen boolean not null default false
);
alter table onboarding_private.preferences enable row level security;
revoke all on onboarding_private.preferences from public, anon, authenticated;
create policy onboarding_own on onboarding_private.preferences to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The private definer is needed to aggregate own records from RPC-only sources
-- (notably friendships) without exposing the underlying tables or another actor.
create function onboarding_private.state(p_goal text, p_hidden boolean, p_seen boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid(); pref onboarding_private.preferences;
  biography boolean; skills boolean; interests boolean; photo boolean;
  created boolean; participation boolean; connection boolean;
  first_completion boolean; chosen text; complete boolean;
begin
  if actor is null then raise exception 'Entre na sua conta para consultar seus primeiros passos.'; end if;
  if p_goal is not null and p_goal not in ('create', 'participate') then raise exception 'Objetivo inválido.'; end if;
  select nullif(regexp_replace(coalesce(p.bio,''), '\s', '', 'g'),'') is not null,
    exists(select 1 from unnest(p.skills) s where nullif(regexp_replace(s, '\s', '', 'g'),'') is not null),
    exists(select 1 from unnest(p.interests) s where nullif(regexp_replace(s, '\s', '', 'g'),'') is not null),
    coalesce(p.avatar_url ~ '^https://[^[:space:]]+/[^[:space:]]+$', false)
  into biography, skills, interests, photo from public.profiles p where p.id = actor;
  if not found then raise exception 'Perfil indisponível.'; end if;
  select exists(select 1 from public.projects where owner_id = actor),
    exists(select 1 from public.join_requests where user_id = actor)
      or exists(select 1 from public.project_members where user_id = actor and status = 'active'),
    exists(select 1 from public.friendships where actor in (user_low,user_high) and (requester_id = actor or state = 'accepted'))
  into created, participation, connection;

  insert into onboarding_private.preferences(user_id, goal)
    values(actor, coalesce(p_goal, case when created then 'create' else 'participate' end)) on conflict do nothing;
  select * into pref from onboarding_private.preferences where user_id = actor for update;
  chosen := coalesce(p_goal, pref.goal);
  created := created or pref.created_project;
  participation := participation or pref.participated;
  connection := connection or pref.connected;
  complete := biography and skills and interests and case when chosen = 'create' then created else participation end;
  first_completion := pref.completed_at is null and complete;
  if (pref.goal, pref.hidden, pref.created_project, pref.participated, pref.connected, pref.completed_at is not null, pref.completion_seen)
    is distinct from (chosen, coalesce(p_hidden,pref.hidden), created, participation, connection, pref.completed_at is not null or complete,
      pref.completion_seen or (coalesce(p_seen,false) and (pref.completed_at is not null or complete))) then
    update onboarding_private.preferences set goal = chosen, hidden = coalesce(p_hidden,pref.hidden),
      created_project = created, participated = participation, connected = connection,
      completed_at = case when first_completion then now() else pref.completed_at end,
      completion_seen = pref.completion_seen or (coalesce(p_seen,false) and (pref.completed_at is not null or complete))
      where user_id = actor returning * into pref;
  end if;
  return jsonb_build_object('goal',pref.goal,'hidden',pref.hidden,'completed_at',pref.completed_at,
    'first_completion',pref.completed_at is not null and not pref.completion_seen,
    'missions',jsonb_build_object('biography',biography,'skills',skills,'interests',interests,
      'create',created,'participate',participation,'photo',photo,'connection',connection));
end $$;
revoke all on function onboarding_private.state(text,boolean,boolean) from public, anon, authenticated;
grant execute on function onboarding_private.state(text,boolean,boolean) to authenticated;

create function public.get_my_onboarding() returns jsonb
language sql security invoker set search_path = '' as $$ select onboarding_private.state(null,null,null) $$;
create function public.set_my_onboarding(p_goal text default null, p_hidden boolean default null, p_seen boolean default null) returns jsonb
language sql security invoker set search_path = '' as $$ select onboarding_private.state(p_goal,p_hidden,p_seen) $$;
revoke all on function public.get_my_onboarding(), public.set_my_onboarding(text,boolean,boolean) from public, anon;
grant execute on function public.get_my_onboarding(), public.set_my_onboarding(text,boolean,boolean) to authenticated;
