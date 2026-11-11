
-- Exercise the two existing save RPCs under RLS, with rollback on the isolated fixture.
begin;
do $$ begin
 if current_setting('team_link.test_environment',true) is distinct from 'isolated' then
  raise exception 'Isolated fixture required';
 end if;
end $$;
create function pg_temp.expect_weight(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end $$;

do $$
declare leader_id uuid:=gen_random_uuid(); manager_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid();
 project_id_fixture uuid; v1 uuid; v2 uuid; link1 uuid; link2 uuid;
 react uuid; js uuid; extra uuid; form jsonb; scope_slug text:='test-vacancy-weights-'||leader_id;
 payload jsonb; value jsonb; before_edit jsonb;
begin
 insert into auth.users(id) values(leader_id),(manager_id),(member_id);
 insert into profiles(id,full_name) values(leader_id,'Fixture Leader'),(manager_id,'Fixture Manager'),(member_id,'Fixture Member');
 select id into strict react from conceitos where nome='React' and status='validado' limit 1;
 select id into strict js from conceitos where nome='JavaScript' and status='validado' limit 1;
 select id into strict extra from conceitos where status='validado' and id not in (react,js) order by id limit 1;
 perform set_config('request.jwt.claim.sub',leader_id::text,true);
 execute 'set local role authenticated';
 form:=jsonb_build_object('p_slug',scope_slug,'p_title','Fixture de pesos','p_category','Engenharia',
   'p_secondary_categories','[]'::jsonb,'p_short_description','Resumo sintético','p_description','Descrição sintética',
   'p_status','open','p_visibility','public',
   'p_vacancies',jsonb_build_array(jsonb_build_object('title','Vaga um','description','Descrição','positions',2,'open',true,
    'concept_refs',jsonb_build_array(jsonb_build_object('id',react,'weight',5),jsonb_build_object('id',js)))));
 perform save_project_concepts(form,null,jsonb_build_array(jsonb_build_object('id',js)));
 select id into project_id_fixture from projects where slug=scope_slug;
 select (entry->>'id')::uuid into v1 from jsonb_array_elements(recruitment_vacancies(project_id_fixture)) entry where entry->>'title'='Vaga um';
 v2:=save_vacancy_concepts(project_id_fixture,null,'Vaga dois','Descrição',jsonb_build_array(jsonb_build_object('id',react,'weight',1)),1,true);
 select id into link1 from conceitos_vinculos where vacancy_id=v1 and conceito_id=react;
 select id into link2 from conceitos_vinculos where vacancy_id=v2 and conceito_id=react;
 perform pg_temp.expect_weight((select peso=5 from conceitos_vinculos where id=link1),'project creation retains explicit weight');
 perform pg_temp.expect_weight((select peso=1 from conceitos_vinculos where id=link2),'individual creation has its own weight');
 perform pg_temp.expect_weight((select peso=3 from conceitos_vinculos where vacancy_id=v1 and conceito_id=js),'default only for new skills');
 payload:=get_project_concept_refs(project_id_fixture);
 perform pg_temp.expect_weight(exists(select 1 from jsonb_array_elements(payload->'vacancies') v
  cross join lateral jsonb_array_elements(v->'concepts') c
  where v->>'id'=v1::text and c->>'id'=react::text and c->>'weight'='5'),'edit RPC reads stored weight');
 execute 'reset role';
 insert into project_members(project_id,user_id,role,status) values(project_id_fixture,manager_id,'member','active'),(project_id_fixture,member_id,'member','active');
 insert into project_recruitment_roles(project_id,user_id,level) values(project_id_fixture,manager_id,'manager'),(project_id_fixture,member_id,'member')
 on conflict(project_id,user_id) do update set level=excluded.level;
 execute 'set local role authenticated';
 perform set_config('request.jwt.claim.sub',manager_id::text,true);
 perform save_vacancy_concepts(project_id_fixture,v1,'Vaga um','Revisada',
   jsonb_build_array(jsonb_build_object('id',react,'weight',4),jsonb_build_object('id',extra,'weight',2)),2,true);
 perform pg_temp.expect_weight((select peso=4 from conceitos_vinculos where id=link1),'same link id after add/remove/change');
 perform pg_temp.expect_weight((select peso=1 from conceitos_vinculos where id=link2),'second vacancy independent');
 perform pg_temp.expect_weight(not exists(select 1 from conceitos_vinculos where vacancy_id=v1 and conceito_id=js),'removed requirement deleted');
 perform pg_temp.expect_weight((select peso=2 from conceitos_vinculos where vacancy_id=v1 and conceito_id=extra),'new requirement weight saved');
 perform set_config('request.jwt.claim.sub',leader_id::text,true);
 form:=form||jsonb_build_object('p_project_id',project_id_fixture,'p_vacancies',jsonb_build_array(jsonb_build_object(
  'id',v1,'title','Vaga um','description','Editada no formulário','positions',2,'open',true,
  'concept_refs',jsonb_build_array(jsonb_build_object('id',react),jsonb_build_object('id',extra,'weight',3)))));
 perform save_project_concepts(form,null,jsonb_build_array(jsonb_build_object('id',js)));
 perform pg_temp.expect_weight((select peso=4 from conceitos_vinculos where id=link1),'omitted weight preserves existing value');
 before_edit:=get_project_concept_refs(project_id_fixture);
 for value in select * from jsonb_array_elements('[0,6,2.5,"4",null]') loop
  begin
   perform save_vacancy_concepts(project_id_fixture,v1,'Inválida','',jsonb_build_array(jsonb_build_object('id',react,'weight',value)),1,false);
   raise exception 'Accepted invalid weight';
  exception when invalid_parameter_value then null; end;
 end loop;
 perform pg_temp.expect_weight(before_edit=get_project_concept_refs(project_id_fixture),'invalid save leaves the weights intact');
 perform pg_temp.expect_weight((select entry->>'title'='Vaga um' and entry->>'positions'='2' and entry->>'open'='true' from jsonb_array_elements(recruitment_vacancies(project_id_fixture)) entry where entry->>'id'=v1::text),'invalid save leaves vacancy intact');
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 begin
  perform save_vacancy_concepts(project_id_fixture,v1,'Sem acesso','',jsonb_build_array(jsonb_build_object('id',react,'weight',5)),2,true);
  raise exception 'Member saved a weight';
 exception when insufficient_privilege then null; end;
 begin
  perform save_project_concepts(form,null,jsonb_build_array(jsonb_build_object('id',js)));
  raise exception 'Member saved the project';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 perform pg_temp.expect_weight((select peso=4 from conceitos_vinculos where id=link1),'non-manager cannot change weights');
 perform pg_temp.expect_weight(not has_column_privilege('authenticated','public.conceitos_vinculos','peso','update'),'no direct weight update grant');
 perform pg_temp.expect_weight(not has_function_privilege('anon','public.save_vacancy_concepts(uuid,uuid,text,text,jsonb,integer,boolean)','execute'),'anonymous RPC denied');
 payload:=recommendation_private.requirements(project_id_fixture,v1);
 perform pg_temp.expect_weight(exists(select 1 from jsonb_array_elements(payload) r where r->>'key'=link1::text and r->>'weight'='4'),'graph reads persisted vacancy weights');
 perform pg_temp.expect_weight((select skills @> array['React'] and cardinality(skills)=2 from project_vacancies where id=v1),'legacy label cache stays current');
end $$;
rollback;
