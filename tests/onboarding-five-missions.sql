-- Execute against the isolated fixture after the five-mission migration.
begin;
do $$ begin
  if current_setting('team_link.test_environment',true) is distinct from 'isolated' then raise exception 'Isolated fixture required'; end if;
end $$;
create function pg_temp.mission_assert(ok boolean,label text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception 'FAIL: %',label; end if;
end $$;
create function pg_temp.mission_count(s jsonb) returns int language sql as $$
  select ((s#>>'{missions,biography}')::boolean and (s#>>'{missions,photo}')::boolean)::int
    + (s#>>'{missions,skills}')::boolean::int + (s#>>'{missions,interests}')::boolean::int
    + (s->'missions'->>(s->>'goal'))::boolean::int + (s#>>'{missions,connection}')::boolean::int
$$;
do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid; p uuid; s jsonb; stamp text; kind text;
begin
  insert into profiles(id,full_name) values(a,'Five missions synthetic A'),(b,'Five missions synthetic B');
  perform set_config('request.jwt.claim.sub',a::text,false);
  s:=get_my_onboarding(); perform pg_temp.mission_assert(pg_temp.mission_count(s)=0,'empty account');
  update profiles set bio=E' \t\n ',skills=array[' ',E'\t'],interests=array[' '] where id=a;
  s:=get_my_onboarding(); perform pg_temp.mission_assert(pg_temp.mission_count(s)=0,'whitespace invalid');
  update profiles set bio='Olá' where id=a;
  s:=get_my_onboarding(); perform pg_temp.mission_assert(pg_temp.mission_count(s)=0,'biography alone is not a mission');
  update profiles set bio=null,avatar_url='https://example.test/profile-avatars/photo.jpg' where id=a;
  s:=get_my_onboarding(); perform pg_temp.mission_assert(pg_temp.mission_count(s)=0,'photo alone is not a mission');
  update profiles set bio='Olá' where id=a;
  s:=get_my_onboarding(); perform pg_temp.mission_assert(pg_temp.mission_count(s)=1,'photo plus biography is one mission');
  update profiles set skills=array['Pesquisa'] where id=a;
  s:=get_my_onboarding(); perform pg_temp.mission_assert(pg_temp.mission_count(s)=2,'skills');
  update profiles set interests=array['Educação'] where id=a;
  s:=set_my_onboarding('create',null); perform pg_temp.mission_assert(pg_temp.mission_count(s)=3,'interests and independent goal');
  insert into projects(owner_id,title,slug) values(a,'Synthetic five missions','five-missions-'||a) returning id into p;
  s:=get_my_onboarding(); perform pg_temp.mission_assert(pg_temp.mission_count(s)=4 and s->>'completed_at' is null,'project without vacancy is fourth mission, not completion');
  insert into friendships(user_low,user_high,requester_id) values(least(a,b),greatest(a,b),b);
  s:=get_my_onboarding(); perform pg_temp.mission_assert(pg_temp.mission_count(s)=4,'incoming pending request is not a valid sent action');
  update friendships set requester_id=a where user_low=least(a,b) and user_high=greatest(a,b);
  s:=get_my_onboarding(); stamp:=s->>'completed_at';
  perform pg_temp.mission_assert(pg_temp.mission_count(s)=5 and stamp is not null,'fifth mission completes without acceptance');
  s:=set_my_onboarding(null,false); perform pg_temp.mission_assert(pg_temp.mission_count(s)=5 and not(s->>'hidden')::boolean,'enabled preference does not mean incomplete');
  update projects set status='archived' where id=p;
  delete from friendships where user_low=least(a,b) and user_high=greatest(a,b);
  update profiles set avatar_url='initials' where id=a;
  s:=set_my_onboarding(null,true);
  perform pg_temp.mission_assert(pg_temp.mission_count(s)=4 and (s->>'hidden')::boolean and s->>'completed_at'=stamp,'current identity and historical actions preserved with hidden preference');
  s:=set_my_onboarding(null,false); perform pg_temp.mission_assert(pg_temp.mission_count(s)=4 and not(s->>'hidden')::boolean,'explicit reactivation recalculates real data');

  perform set_config('request.jwt.claim.sub',b::text,false);
  s:=get_my_onboarding(); perform pg_temp.mission_assert(not(s->>'hidden')::boolean and s->>'goal'='participate' and pg_temp.mission_count(s)=0,'account isolation');
  insert into friendships(user_low,user_high,requester_id,state) values(least(a,b),greatest(a,b),a,'accepted');
  insert into project_members(project_id,user_id,role,status) values(p,b,'member','active');
  s:=get_my_onboarding(); perform pg_temp.mission_assert((s#>>'{missions,connection}')::boolean and (s#>>'{missions,participate}')::boolean,'historical accepted friendship and legitimate membership');
  foreach kind in array array['pending','approved','rejected','canceled'] loop
    c:=gen_random_uuid(); insert into profiles(id,full_name) values(c,'Historical synthetic applicant');
    insert into join_requests(project_id,user_id,status) values(p,c,kind);
    perform set_config('request.jwt.claim.sub',c::text,false);
    s:=get_my_onboarding(); perform pg_temp.mission_assert((s#>>'{missions,participate}')::boolean,'historical application '||kind);
    s:=set_my_onboarding('create',null); perform pg_temp.mission_assert(not(s#>>'{missions,create}')::boolean,'independent create condition');
  end loop;
  update onboarding_private.preferences set completed_at='2026-11-01',completion_seen=false,hidden=false where user_id=c;
  s:=set_my_onboarding(null,null,true);
  perform pg_temp.mission_assert((s->>'hidden')::boolean and (s->>'completed_at')::timestamptz='2026-11-01'::timestamptz,'legacy open-tab acknowledgement preserves dismissal and history');
  s:=set_my_onboarding(null,false);
  perform pg_temp.mission_assert(not(s->>'hidden')::boolean,'explicit reactivation after a legacy acknowledgement');
end $$;
set local role authenticated;
do $$ begin
  perform get_my_onboarding();
  begin perform * from onboarding_private.preferences; raise exception 'Direct table access allowed'; exception when insufficient_privilege then null; end;
  begin update onboarding_private.preferences set connected=true; raise exception 'Forged completion allowed'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','',false);
  begin perform get_my_onboarding(); raise exception 'Missing identity allowed'; exception when raise_exception then if sqlerrm='Missing identity allowed' then raise; end if; end;
end $$;
set local role anon;
do $$ begin
  begin perform get_my_onboarding(); raise exception 'Anonymous access allowed'; exception when insufficient_privilege then null; end;
  begin perform set_my_onboarding(null,false); raise exception 'Anonymous write allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
