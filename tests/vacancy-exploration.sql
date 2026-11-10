begin;
do $$begin if current_setting('team_link.test_environment',true) is distinct from 'isolated' then raise exception 'Isolated database required';end if;end$$;
create function pg_temp.vacancy_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
do $$
declare actor uuid:=gen_random_uuid(); owner_id uuid:=gen_random_uuid(); occupant uuid:=gen_random_uuid();
 p_open uuid:=gen_random_uuid();p_progress uuid:=gen_random_uuid();p_private uuid:=gen_random_uuid();p_completed uuid:=gen_random_uuid();p_archived uuid:=gen_random_uuid();
 v1 uuid:=gen_random_uuid();v2 uuid:=gen_random_uuid();closed_id uuid:=gen_random_uuid();filled_id uuid:=gen_random_uuid();r1 uuid:=gen_random_uuid();r2 uuid:=gen_random_uuid();cid uuid;result jsonb;preview jsonb;failed boolean;sent uuid;
begin
 insert into auth.users(id)values(actor),(owner_id),(occupant);
 insert into public.profiles(id,full_name)values(actor,'P34 test candidate'),(owner_id,'P34 test owner'),(occupant,'P34 test occupant');
 insert into public.projects(id,owner_id,title,slug,category,status,visibility,description,secondary_categories)values
 (p_open,owner_id,'P34-Control Open','p34-'||p_open,'Engenharia','open','public','Public description',array['Educação e inclusão']),
 (p_progress,owner_id,'P34-Control Progress','p34-'||p_progress,'Saúde e biometria','in_progress','public','Public long description',array['Engenharia']),
 (p_private,owner_id,'P34-Control Secret','p34-'||p_private,'Engenharia','open','private','PRIVATE_MARKER',array[]::text[]),
 (p_completed,owner_id,'P34-Control Completed','p34-'||p_completed,'Engenharia','completed','public','Completed description',array[]::text[]),
 (p_archived,owner_id,'P34-Control Archived','p34-'||p_archived,'Engenharia','archived','public','Archived description',array[]::text[]);
 update public.project_vacancies set open=false where project_id in(p_open,p_progress,p_private,p_completed,p_archived);
 insert into public.project_vacancies(id,project_id,title,description,skills,positions,open,created_at)values
 (v1,p_open,'Alpha vacancy','P34 searchable description',array['JavaScript','Legacy P34 Skill'],1,true,'2026-01-02'),
 (v2,p_progress,'Beta vacancy',repeat('Long readable description. ',100),array['Python'],3,true,'2026-01-03'),
 (closed_id,p_open,'Closed vacancy','Closed',array[]::text[],2,false,'2026-01-04'),
 (filled_id,p_progress,'Filled vacancy','Filled',array[]::text[],1,true,'2026-01-05');
 insert into public.project_vacancies(project_id,title,skills,positions,open)select id,'Invisible vacancy',array['PRIVATE_MARKER'],2,true from public.projects where id in(p_private,p_completed,p_archived);
 insert into public.join_requests(id,project_id,user_id,status)values(r1,p_progress,occupant,'approved'),(r2,p_progress,owner_id,'approved');
 insert into public.join_request_vacancies(request_id,vacancy_id,requested_title,approved_at,released_at)values
 (r1,v2,'Beta vacancy',now(),null),(r2,v2,'Beta vacancy',now(),now()),(r1,filled_id,'Filled vacancy',now(),null);
 insert into public.project_members(project_id,user_id,role,status)values(p_progress,occupant,'member','active') on conflict(project_id,user_id) do update set status='active';
 select id into cid from public.conceitos where nome='JavaScript';
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',actor::text,true);
 result:=public.explore_project_vacancies('{"search":"P34-Control"}');
 perform pg_temp.vacancy_assert((result->>'total')::integer=2,'only open public opportunities in open/in_progress projects; one card per vacancy');
 perform pg_temp.vacancy_assert((result->'items'->0->>'id')::uuid=v2 and (result->'items'->0->>'available')::integer=2,'recent order and unreleased approvals reduce available positions; released approvals do not');
 perform pg_temp.vacancy_assert(result::text not like '%PRIVATE_MARKER%' and result::text not like '%email%','no private or administrative fields in feed');
 perform pg_temp.vacancy_assert((public.explore_project_vacancies('{"search":"Legacy P34 Skill"}')->>'total')::integer=1,'search finds legacy requirements');
 perform pg_temp.vacancy_assert((public.explore_project_vacancies('{"search":"P34-Control","category":"Engenharia"}')->>'total')::integer=2,'category matches main or secondary categories');
 perform pg_temp.vacancy_assert((public.explore_project_vacancies(jsonb_build_object('search','P34-Control','skill',cid))->>'total')::integer=1,'concept UUID matches reliable requirement identity');
 result:=public.explore_project_vacancies('{"search":"P34-Control","sort":"name","size":1}');
 perform pg_temp.vacancy_assert((result->'items'->0->>'id')::uuid=v1 and (result->>'total')::integer=2,'server name ordering and bounded first page');
 result:=public.explore_project_vacancies('{"search":"P34-Control","sort":"name","size":1,"page":1}');
 perform pg_temp.vacancy_assert((result->'items'->0->>'id')::uuid=v2,'second server page has no duplicate');
 perform pg_temp.vacancy_assert((public.explore_project_vacancies('{"search":"P34 nonexistent phrase"}')->>'total')::integer=0,'empty search');
 perform pg_temp.vacancy_assert((public.explore_project_vacancies('{"size":10000,"page":-1}')->>'size')::integer=24,'server page size clamps malicious requests');
 preview:=public.preview_project_vacancy(v2);
 perform pg_temp.vacancy_assert(preview->'project'->>'description'='Public long description' and length(preview->'vacancy'->>'description')>2000,'preview loads complete public descriptions lazily');
 perform pg_temp.vacancy_assert(preview::text not like '%message%' and preview::text not like '%email%' and preview->>'member'='false','preview does not leak applications or team secrets');
 perform pg_temp.vacancy_assert(public.preview_project_vacancy((select (x->>'id')::uuid from jsonb_array_elements(public.recruitment_vacancies(p_private))x limit 1)) is null,'private project preview denied');
 failed:=false;begin perform 1 from vacancy_private.public_vacancies;exception when insufficient_privilege then failed:=true;end;perform pg_temp.vacancy_assert(failed,'private read model cannot be called directly');
 -- Existing application RPC, including multi-vacancy selection, remains the sole writer.
 sent:=public.recruitment_send_application(p_open,array[v1],'Controlled test');
 failed:=false;begin perform public.recruitment_send_application(p_open,array[v1],'Duplicate');exception when raise_exception then failed:=true;end;perform pg_temp.vacancy_assert(failed,'pending application duplicate rejected by server');
 perform public.recruitment_decide(sent,'cancel','{}');
 perform pg_temp.vacancy_assert(public.recruitment_send_application(p_open,array[v1],'Allowed existing reapplication') is not null,'existing canceled-history reapplication preserved');
 failed:=false;begin perform public.recruitment_send_application(p_progress,array[filled_id],'Full');exception when raise_exception then failed:=true;end;perform pg_temp.vacancy_assert(failed,'filled vacancy rejected by existing server guard');
 failed:=false;begin perform public.recruitment_send_application(p_completed,array[v1],'Completed');exception when raise_exception then failed:=true;end;perform pg_temp.vacancy_assert(failed,'completed project cannot accept applications');
 failed:=false;begin perform public.recruitment_send_application(p_private,array[v1],'Private');exception when raise_exception then failed:=true;end;perform pg_temp.vacancy_assert(failed,'private project cannot accept public applications');
 execute 'reset role';
 update public.project_vacancies set open=false where id=v2;
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_temp.vacancy_assert(public.preview_project_vacancy(v2)->'vacancy'->>'open'='false','stale modal sees vacancy closure');
 failed:=false;begin perform public.recruitment_send_application(p_progress,array[v2],'Stale');exception when raise_exception then failed:=true;end;perform pg_temp.vacancy_assert(failed,'server rejects stale application after closure');
 execute 'reset role';update public.project_vacancies set open=true where id=v2;
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform pg_temp.vacancy_assert((public.explore_project_vacancies('{"search":"P34-Control"}')->>'total')::integer=0,'owner does not receive own opportunities');
 perform pg_temp.vacancy_assert(public.preview_project_vacancy(v1)->>'member'='true','owner preview disables redundant application');
 perform set_config('request.jwt.claim.sub',occupant::text,true);
 perform pg_temp.vacancy_assert(public.preview_project_vacancy(v2)->>'member'='true','member preview disables redundant application');
 failed:=false;begin perform public.recruitment_send_application(p_progress,array[v2],'Member');exception when raise_exception then failed:=true;end;perform pg_temp.vacancy_assert(failed,'server rejects active team member');
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claim.sub','',true);
 failed:=false;begin perform public.explore_project_vacancies('{}');exception when insufficient_privilege then failed:=true;end;perform pg_temp.vacancy_assert(failed,'anonymous feed denied; route redirects to login');
 failed:=false;begin perform public.preview_project_vacancy(v1);exception when insufficient_privilege then failed:=true;end;perform pg_temp.vacancy_assert(failed,'anonymous preview denied');
 execute 'reset role';
end $$;
rollback;
