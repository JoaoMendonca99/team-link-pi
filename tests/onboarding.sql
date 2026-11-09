-- Run only in the isolated PostgreSQL fixture, after applying the migration.
begin;
do $$ begin
  if current_setting('team_link.test_environment',true) is distinct from 'isolated' then
    raise exception 'This test requires the isolated fixture';
  end if;
end $$;
create function pg_temp.onboarding_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function pg_temp.onboarding_actor(actor uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub',actor::text,false); end $$;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid;
  p uuid; s jsonb; saved_at text; kind text;
begin
  insert into public.profiles(id,full_name) values(a,'Onboarding synthetic A'),(b,'Onboarding synthetic B');
  perform pg_temp.onboarding_actor(a);
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert(s->>'goal'='participate' and not (s#>>'{missions,biography}')::boolean and s->>'completed_at' is null,'new account');
  update public.profiles set bio=E' \t\n ',skills=array[' ',E'\t'],interests=array[' '] where id=a;
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert(not (s#>>'{missions,biography}')::boolean and not (s#>>'{missions,skills}')::boolean and not (s#>>'{missions,interests}')::boolean,'whitespace is not completion');
  update public.profiles set bio='Olá' where id=a;
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s#>>'{missions,biography}')::boolean and not (s#>>'{missions,skills}')::boolean,'biography updates independently');
  update public.profiles set skills=array['Pesquisa'] where id=a;
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s#>>'{missions,skills}')::boolean and not (s#>>'{missions,interests}')::boolean,'skills updates independently');
  update public.profiles set interests=array['Educação'] where id=a;
  s := public.set_my_onboarding('create',null);
  perform pg_temp.onboarding_assert(s->>'goal'='create' and not (s#>>'{missions,create}')::boolean,'create goal does not count draft');
  insert into public.projects(owner_id,title,slug) values(a,'Synthetic project','onboarding-'||a) returning id into p;
  s := public.get_my_onboarding(); saved_at := s->>'completed_at';
  perform pg_temp.onboarding_assert((s#>>'{missions,create}')::boolean and (s->>'first_completion')::boolean and saved_at is not null,'create project completes without vacancies or other members');
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s->>'first_completion')::boolean,'a background read must not consume the completion notice');
  s := public.set_my_onboarding(null,null,true);
  perform pg_temp.onboarding_assert(not (s->>'first_completion')::boolean,'completion is acknowledged only after presentation');
  update public.projects set status='archived' where id=p;
  s := public.set_my_onboarding(null,true);
  perform pg_temp.onboarding_assert((s#>>'{missions,create}')::boolean and (s->>'hidden')::boolean,'archived project and hide');
  delete from public.projects where id=p;
  update public.profiles set bio=null,avatar_url='initials' where id=a;
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s#>>'{missions,create}')::boolean and not (s#>>'{missions,biography}')::boolean and s->>'completed_at'=saved_at and (s->>'hidden')::boolean,'action history retained; profile reflects current value; hidden completion retained');
  perform pg_temp.onboarding_assert(not (s#>>'{missions,photo}')::boolean,'initials do not count as photo');
  update public.profiles set avatar_url='https://example.test/storage/profile-avatars/photo.jpg' where id=a;
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s#>>'{missions,photo}')::boolean,'custom photo');
  update public.profiles set avatar_url=null where id=a;
  insert into public.friendships(user_low,user_high,requester_id) values(least(a,b),greatest(a,b),b);
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert(not (s#>>'{missions,connection}')::boolean,'incoming pending does not count');
  update public.friendships set requester_id=a where user_low=least(a,b) and user_high=greatest(a,b);
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s#>>'{missions,connection}')::boolean,'outgoing request counts without acceptance');
  delete from public.friendships where user_low=least(a,b) and user_high=greatest(a,b);
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s#>>'{missions,connection}')::boolean,'observed connection action is retained');

  perform pg_temp.onboarding_actor(b);
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert(not (s->>'hidden')::boolean and s->>'goal'='participate' and not (s#>>'{missions,create}')::boolean,'account preferences isolated');
  insert into public.friendships(user_low,user_high,requester_id,state) values(least(a,b),greatest(a,b),a,'accepted');
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s#>>'{missions,connection}')::boolean,'existing accepted friendship counts');
  insert into public.projects(owner_id,title,slug) values(a,'Synthetic membership','onboarding-membership-'||a) returning id into p;
  insert into public.project_members(project_id,user_id,role,status) values(p,b,'member','active');
  s := public.get_my_onboarding();
  perform pg_temp.onboarding_assert((s#>>'{missions,participate}')::boolean and not (s#>>'{missions,create}')::boolean,'legitimate member does not need artificial application');

  foreach kind in array array['pending','approved','rejected','canceled'] loop
    c := gen_random_uuid();
    insert into public.profiles(id,full_name) values(c,'Historical synthetic applicant');
    insert into public.join_requests(project_id,user_id,status) values(p,c,kind);
    perform pg_temp.onboarding_actor(c);
    s := public.get_my_onboarding();
    perform pg_temp.onboarding_assert((s#>>'{missions,participate}')::boolean,'historical application '||kind);
    s := public.set_my_onboarding('create',true);
    perform pg_temp.onboarding_assert(not (s#>>'{missions,create}')::boolean and (s->>'hidden')::boolean,'goals stay independent');
    s := public.set_my_onboarding('participate',false);
    perform pg_temp.onboarding_assert((s#>>'{missions,participate}')::boolean and not (s->>'hidden')::boolean,'goal change preserves participation and visibility preference');
  end loop;
  begin perform public.set_my_onboarding('invalid',null); raise exception 'Invalid goal accepted'; exception when raise_exception then if sqlerrm='Invalid goal accepted' then raise; end if; end;
end $$;

set local role authenticated;
do $$ begin
  perform public.get_my_onboarding();
  begin perform * from onboarding_private.preferences; raise exception 'Direct private read allowed'; exception when insufficient_privilege then null; end;
  begin update onboarding_private.preferences set hidden=true; raise exception 'Direct private update allowed'; exception when insufficient_privilege then null; end;
  begin insert into onboarding_private.preferences(user_id,goal) values(gen_random_uuid(),'create'); raise exception 'Completion spoofing allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',false);
  begin perform public.get_my_onboarding(); raise exception 'Null identity allowed'; exception when raise_exception then if sqlerrm='Null identity allowed' then raise; end if; end;
end $$;
set local role anon;
do $$ begin
  begin perform public.get_my_onboarding(); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform public.set_my_onboarding('create',true); raise exception 'Anonymous write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.onboarding_assert(c.relrowsecurity,'private table RLS enabled') from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='onboarding_private' and c.relname='preferences';
rollback;
