begin;
do $$begin if current_setting('team_link.test_environment',true) is distinct from 'isolated' then raise exception 'Isolated database required';end if;end$$;
create function pg_temp.education_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
create temp table education_original_profiles as select id,to_jsonb(p) value from profiles p;
create temp table education_original_projects as select id,to_jsonb(p) value from projects p;
create temp table education_original_notifications as select id,to_jsonb(n) value from notifications n;
select pg_temp.education_assert(count(*)=1 and bool_and(cursando_atualmente is null),'complete legacy pair migrated with unknown status') from usuario_formacoes where user_id=(select id from profiles where full_name='Education legacy paired');
select pg_temp.education_assert(count(*)=1 and bool_and(curso_id is not null and instituicao_id is not null and cursando_atualmente is null),'official UUID pair preserved') from usuario_formacoes where user_id=(select id from profiles where full_name='Education legacy official');
select pg_temp.education_assert(count(*)=0,'no incomplete or empty legacy formations') from usuario_formacoes where user_id in(select id from profiles where full_name in ('Education legacy institution','Education legacy course','Education legacy empty'));
select pg_temp.education_assert(count(*)=2 and bool_and(not resolved),'both types of incomplete data privately retained') from education_private.legacy where user_id in(select id from profiles where full_name in ('Education legacy institution','Education legacy course'));
select pg_temp.education_assert(bool_and(course is null and university is null and course_id is null and institution_id is null),'partial data is not a public academic projection') from profiles where full_name in ('Education legacy institution','Education legacy course');
select pg_temp.education_assert(not has_column_privilege('authenticated','profiles','course','UPDATE') and not has_column_privilege('authenticated','profiles','education_primary_id','UPDATE'),'legacy caches and primary selection are server managed');

do $$
declare a uuid:=gen_random_uuid();b uuid:=gen_random_uuid(); f1 uuid:=gen_random_uuid(); f2 uuid:=gen_random_uuid();f3 uuid:=gen_random_uuid(); foreign_id uuid:=gen_random_uuid();
 ies uuid;chosen_course uuid;unoffered uuid;s jsonb;values_json jsonb;before_state jsonb;report jsonb;failed boolean;revision bigint:=0;basic jsonb:='{"full_name":"Education test person","bio":"Biography remains explicit"}';
begin
 report:=education_private.migrate();perform pg_temp.education_assert(report=education_private.migrate(),'idempotent initial migration');
 select id into ies from instituicoes_ensino where sigla='UNISO' limit 1;
 select id into chosen_course from cursos where nome_normalizado='engenharia de computacao' and codigo_cine='0714E04' limit 1;
 select c.id into unoffered from cursos c where c.status_validacao='validado' and not exists(select 1 from cursos_ofertas o where o.curso_id=c.id and o.instituicao_id=ies) limit 1;
 perform pg_temp.education_assert(ies is not null and chosen_course is not null and unoffered is not null,'official catalog references and a course outside 2024 offers');
 insert into auth.users(id)values(a),(b);
 insert into profiles(id,full_name)values(a,'Education new without academic data'),(b,'Education foreign owner');
 perform pg_temp.education_assert(not exists(select 1 from usuario_formacoes where user_id=a),'new account requires no education');
 insert into usuario_formacoes(id,user_id,instituicao_manual,curso_manual,cursando_atualmente)values(foreign_id,b,'Foreign university','Foreign course',false);
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',a::text,true);
 perform save_profile_with_education(basic,'[]','[]','[]',null,revision,false);revision:=revision+1;
 perform pg_temp.education_assert((get_my_education()->'formations')='[]'::jsonb,'optional empty history can save');
 values_json:=jsonb_build_array(
  jsonb_build_object('id',f1,'instituicao_id',ies,'curso_id',chosen_course,'cursando_atualmente',true),
  jsonb_build_object('id',f2,'instituicao_manual','Manual University Beta','curso_manual','Manual Course Beta','cursando_atualmente',true),
  jsonb_build_object('id',f3,'instituicao_id',ies,'curso_id',unoffered,'cursando_atualmente',false));
 perform save_profile_with_education(basic,'[]','[]',values_json,null,revision,false);revision:=revision+1;
 s:=get_my_education();
 perform pg_temp.education_assert((s->'formations'->0->>'id')=f1::text and (s->'formations'->1->>'id')=f2::text and (s->'formations'->2->>'id')=f3::text,'stable card order is preserved independently of primary choice');
 perform pg_temp.education_assert(jsonb_array_length(s->'formations')=3 and (select count(*)=2 from usuario_formacoes where user_id=a and cursando_atualmente),'multiple institutions/courses and two current formations');
 perform pg_temp.education_assert((select course is null and university is null from profiles where id=a),'multiple formations do not choose a primary by order/current status');
 perform save_profile_with_education(basic,'[]','[]',values_json,f1,revision,false);revision:=revision+1;
 perform pg_temp.education_assert((select course_id=chosen_course and institution_id=ies from profiles where id=a),'explicit primary gives paired official projection');
 before_state:=get_my_education();
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'instituicao_id',ies,'cursando_atualmente',false)),null,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed and get_my_education()=before_state,'institution without course rejected atomically');
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'curso_id',chosen_course,'cursando_atualmente',false)),null,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed and get_my_education()=before_state,'course without institution rejected');
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'instituicao_id',ies,'instituicao_manual','Forged duplicate representation','curso_id',chosen_course,'cursando_atualmente',false)),null,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed,'official and manual values are mutually exclusive');
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'instituicao_manual','   ','curso_manual','Course','cursando_atualmente',false)),null,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed,'whitespace is not a complete formation');
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'instituicao_id',gen_random_uuid(),'curso_id',chosen_course,'cursando_atualmente',false)),null,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed,'missing official references rejected');
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'instituicao_manual','University','curso_manual','Course','origem','legacy','cursando_atualmente',null)),null,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed,'new users cannot forge legacy unknown status');
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',values_json,f1,revision-1,false);exception when serialization_failure then failed:=true;end;
 perform pg_temp.education_assert(failed and get_my_education()=before_state,'stale revision never overwrites newer selections');
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',values_json,foreign_id,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed,'foreign primary cannot be selected');
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',jsonb_build_array(jsonb_build_object('id',foreign_id,'instituicao_manual','Attack','curso_manual','Attack','cursando_atualmente',false)),null,revision,false);exception when insufficient_privilege then failed:=true;end;
 perform pg_temp.education_assert(failed,'cannot modify formations of another account');
 failed:=false;begin update usuario_formacoes set cursando_atualmente=true where id=foreign_id;exception when insufficient_privilege then failed:=true;end;
 perform pg_temp.education_assert(failed,'no direct formation writes bypass transactional API');
 failed:=false;begin update profiles set course='Independent cache' where id=a;exception when insufficient_privilege then failed:=true;end;
 perform pg_temp.education_assert(failed,'old academic columns are not an independent editable state');
 failed:=false;begin perform save_profile_concepts(basic||jsonb_build_object('course','Independent cache'),'[]','[]');exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed,'old RPC refuses changed independent academic fields');
 -- Education changes are rolled back if a later concept/profile operation fails.
 failed:=false;begin perform save_profile_with_education(basic,(select jsonb_agg(jsonb_build_object('id',(select id from conceitos where nome='JavaScript'))) from generate_series(1,17)),'[]','[]',null,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed and get_my_education()=before_state,'whole profile transaction rolls back on concept failure');
 values_json:=jsonb_set(values_json,'{1,cursando_atualmente}','false');
 perform save_profile_with_education(basic,'[]','[]',values_json,f2,revision,false);revision:=revision+1;
 perform pg_temp.education_assert((select course='Manual Course Beta' and university='Manual University Beta' and course_id is null and institution_id is null from profiles where id=a),'manual primary projection is paired');
 perform pg_temp.education_assert((select cursando_atualmente=false from usuario_formacoes where id=f2),'unchecking only changes current status');
 -- Identical pairs may be distinct episodes only after explicit confirmation; never auto-merged.
 failed:=false;begin perform save_profile_with_education(basic,'[]','[]',values_json||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'instituicao_id',ies,'curso_id',chosen_course,'cursando_atualmente',true)),f2,revision,false);exception when sqlstate '22023' then failed:=true;end;
 perform pg_temp.education_assert(failed,'accidental duplicate episode rejected');
 perform save_profile_with_education(basic,'[]','[]',values_json||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'instituicao_id',ies,'curso_id',chosen_course,'cursando_atualmente',true,'duplicate_ack',true)),f2,revision,false);revision:=revision+1;
 perform pg_temp.education_assert((select count(*)=4 from usuario_formacoes where user_id=a),'explicit identical episodes retain separate UUIDs');
 values_json:=jsonb_build_array(values_json->2);
 perform save_profile_with_education(basic,'[]','[]',values_json,null,revision,false);revision:=revision+1;
 perform pg_temp.education_assert((select count(*)=1 and bool_and(id=f3) from usuario_formacoes where user_id=a),'removing others preserves the retained formation');
 perform pg_temp.education_assert((select course_id=unoffered and institution_id=ies from profiles where id=a),'single remaining formation deterministically projects itself');
 -- Owners can recover only their own incomplete history, without blocking ordinary use.
 execute 'reset role';select id into b from profiles where full_name='Education legacy institution';
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',b::text,true);
 s:=get_my_education();perform pg_temp.education_assert(s->'legacy'->>'university'='Instituição incompleta' and jsonb_array_length(s->'formations')=0,'owner recovery of incomplete legacy data');
 failed:=false;begin perform 1 from education_private.legacy;exception when insufficient_privilege then failed:=true;end;perform pg_temp.education_assert(failed,'raw backups never exposed to application roles');
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claim.sub','',true);
 perform pg_temp.education_assert((select count(*)=1 from usuario_formacoes where id=f3),'public education follows existing public profile visibility');
 perform pg_temp.education_assert((select i.nome is not null from usuario_formacoes f join instituicoes_ensino i on i.id=f.instituicao_id where f.id=f3),'anonymous public history resolves official institution labels');
 failed:=false;begin perform fonte from instituicoes_ensino;exception when insufficient_privilege then failed:=true;end;perform pg_temp.education_assert(failed,'anonymous catalog access is limited to public labels');
 failed:=false;begin perform get_my_education();exception when insufficient_privilege then failed:=true;end;perform pg_temp.education_assert(failed,'anonymous private education state denied');
 execute 'reset role';
end $$;

-- Simulate a failure while capturing an existing legacy pair, not a real profile.
set constraints all immediate;
alter table profiles disable trigger education_capture_signup;
insert into auth.users(id) values('00000000-0000-0000-0000-000000003301');
insert into profiles(id,full_name,course,university) values('00000000-0000-0000-0000-000000003301','Education controlled migration failure','Old course','Old institution');
alter table profiles enable trigger education_capture_signup;
create function pg_temp.fail_education_migration() returns trigger language plpgsql as $$begin if new.user_id='00000000-0000-0000-0000-000000003301' then raise exception 'Controlled migration failure';end if;return new;end$$;
create trigger education_migration_test before insert on usuario_formacoes for each row execute function pg_temp.fail_education_migration();
do $$declare n integer;failed boolean:=false;begin
 select count(*) into n from usuario_formacoes;delete from education_private.migrations where name='initial';
 begin perform education_private.migrate();exception when others then failed:=true;end;
 perform pg_temp.education_assert(failed and (select count(*)=n from usuario_formacoes) and not exists(select 1 from education_private.migrations where name='initial'),'migration rollback restores rows and marker');
 perform pg_temp.education_assert((select course='Old course' and university='Old institution' from profiles where id='00000000-0000-0000-0000-000000003301'),'migration failure does not erase source values');
end $$;
drop trigger education_migration_test on usuario_formacoes;
select education_private.migrate();
select pg_temp.education_assert(not exists(select 1 from education_original_profiles o join profiles p on p.id=o.id where to_jsonb(p)<>o.value),'all original profiles unchanged by isolated write tests');
select pg_temp.education_assert(not exists(select 1 from education_original_projects o join projects p on p.id=o.id where to_jsonb(p)<>o.value),'projects and periods not rewritten');
select pg_temp.education_assert((select count(*) from notifications)=(select count(*) from education_original_notifications) and not exists(select 1 from education_original_notifications o join notifications n on n.id=o.id where to_jsonb(n)<>o.value),'no mass notification or notification changes');
rollback;
