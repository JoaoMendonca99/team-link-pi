-- An older open tab may acknowledge the previous conclusion after the upgrade.
-- Use the same hidden preference, while explicit reactivation still wins.
create or replace function public.set_my_onboarding(p_goal text default null, p_hidden boolean default null, p_seen boolean default null) returns jsonb
language sql security invoker set search_path = '' as $$
  select onboarding_private.state(p_goal, case when p_seen then coalesce(p_hidden,true) else p_hidden end, p_seen)
$$;
