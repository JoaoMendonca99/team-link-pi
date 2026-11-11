begin;
do $$ begin
  if current_setting('team_link.test_environment',true) is distinct from 'isolated' then
    raise exception 'Isolated fixture required';
  end if;
end $$;
create function pg_temp.assert_project(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;

do $$
declare
  leader uuid:=gen_random_uuid(); manager uuid:=gen_random_uuid(); member uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
  pid uuid; general_id uuid; concept uuid; ticket uuid:=gen_random_uuid();
  path text:=gen_random_uuid()||'.png'; newer text:=gen_random_uuid()||'.png';
  original_slug text:='p47-academic-'||leader; general_slug text:='p47-general-'||leader;
  form jsonb; tags jsonb; current_tag text:='Pesquisa sintética P47 '||left(leader::text,8); state record;
begin
  insert into auth.users(id) values(leader),(manager),(member),(stranger);
  insert into profiles(id,full_name) values(leader,'Fixture Lead'),(manager,'Fixture Manager'),(member,'Fixture Member'),(stranger,'Fixture Guest');
  select id into strict concept from conceitos where nome='React' and status='validado' limit 1;
  tags:=jsonb_build_array(jsonb_build_object('id',concept),jsonb_build_object('label',current_tag,'proposal',true));
  form:=jsonb_build_object('p_slug',original_slug,'p_title','Projeto inicial','p_category','Engenharia','p_secondary_categories','[]'::jsonb,
    'p_short_description','Resumo inicial','p_description','Descrição inicial','p_status','open','p_visibility','private','p_vacancies','[]'::jsonb);
  insert into storage.objects(bucket_id,name) values('project-images',path),('project-images',newer);
  execute 'set local role service_role';
  perform public.manage_project_image_upload(ticket,leader,null,path,null,false);
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',leader::text,true);
  execute 'set local role authenticated';
  perform save_project_concepts(form||jsonb_build_object('p_image_ticket',ticket),
    '{"context":"academic","defaults":{},"period":{"name":"2026.2 — Fixture"}}',tags);
  select id into strict pid from projects where projects.slug=form->>'p_slug';
  perform pg_temp.assert_project(get_project_image_ref(pid)=path,'creation and image committed together');
  perform pg_temp.assert_project(get_project_academics(pid)#>>'{periods,0,name}'='2026.2 — Fixture','initial academic period');
  form:=form||jsonb_build_object('p_project_id',pid,'p_slug','slug-que-nao-muda','p_title','Título editado');
  perform save_project_concepts(form,null,get_project_concept_refs(pid)->'tags');
  perform pg_temp.assert_project((select projects.slug=original_slug and title='Título editado' from projects where id=pid),'title edit preserves slug');
  form:=form||jsonb_build_object('p_description','Descrição editada','p_category','Robótica','p_secondary_categories',jsonb_build_array('Engenharia'));
  perform save_project_concepts(form,null,jsonb_build_array(jsonb_build_object('id',concept)));
  perform save_project_concepts(form,null,jsonb_build_array(jsonb_build_object('id',concept)));
  perform pg_temp.assert_project(get_project_image_ref(pid)=path,'save without image change preserves image');
  perform save_project_concepts(form||jsonb_build_object('p_project_id',null,'p_slug',general_slug,'p_title','Projeto geral','p_visibility','public'),null,tags);
  select id into strict general_id from projects where projects.slug=general_slug;
  execute 'reset role';
  perform pg_temp.assert_project((select description='Descrição editada' and category='Robótica' from projects where id=pid),'description and category saved');
  perform pg_temp.assert_project((select count(*)=1 from project_tags where project_id=pid),'tag removed on edit');
  perform pg_temp.assert_project((select count(*)=2 from project_tags where project_id=general_id),'existing and provisional tags saved');
  perform pg_temp.assert_project(exists(select 1 from conceitos where nome=current_tag and status='provisorio'),'proposal remains provisional');
  insert into project_members(project_id,user_id,role,status) values(pid,member,'member','active'),(pid,manager,'member','active') on conflict do nothing;
  insert into project_recruitment_roles(project_id,user_id,level) values(pid,manager,'manager')
  on conflict(project_id,user_id) do update set level=excluded.level;
  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub','',true);
  perform pg_temp.assert_project(get_project_image_ref(pid) is null,'anonymous cannot resolve private image');
  perform pg_temp.assert_project(not exists(select 1 from get_project_card_state(array[pid])),'anonymous cannot enumerate private card');
  perform pg_temp.assert_project(not has_function_privilege('anon','public.manage_project_image_upload(uuid,uuid,uuid,text,text,boolean)','execute'),'anonymous cannot register upload');
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  perform pg_temp.assert_project(get_project_image_ref(pid) is null,'unrelated user cannot resolve private image');
  insert into project_likes(project_id,user_id) values(general_id,stranger);
  select * into state from get_project_card_state(array[general_id]);
  perform pg_temp.assert_project(state.likes_count=1 and state.liked,'public like and own liked state');
  perform set_config('request.jwt.claim.sub',member::text,true);
  perform pg_temp.assert_project(get_project_image_ref(pid)=path,'active team member can see project logo');
  select * into state from get_project_card_state(array[general_id]);
  perform pg_temp.assert_project(state.likes_count=1 and not state.liked,'another viewer cannot inherit liked state');
  begin
    perform save_project_concepts(form,null,jsonb_build_array(jsonb_build_object('id',concept)));
    raise exception 'Member unexpectedly saved';
  exception when insufficient_privilege then null; end;
  perform pg_temp.assert_project(not has_function_privilege('authenticated','public.manage_project_image_upload(uuid,uuid,uuid,text,text,boolean)','execute'),'browser cannot register upload');
  execute 'reset role';
  ticket:=gen_random_uuid();
  perform manage_project_image_upload(ticket,manager,pid,newer,path,false);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',manager::text,true);
  perform save_project_concepts(form||jsonb_build_object('p_image_ticket',ticket),null,jsonb_build_array(jsonb_build_object('id',concept)));
  perform pg_temp.assert_project(get_project_image_ref(pid)=newer,'authorized manager can replace image');
  perform set_config('request.jwt.claim.sub',leader::text,true);
  begin
    perform save_project_concepts(form||jsonb_build_object('p_image_ticket',ticket,'p_title','Repetição indevida'),null,jsonb_build_array(jsonb_build_object('id',concept)));
    raise exception 'Ticket replay unexpectedly saved';
  exception when invalid_parameter_value then null; end;
  perform pg_temp.assert_project((select title='Título editado' from projects where id=pid),'failure rolls back project fields');
  execute 'reset role';
  ticket:=gen_random_uuid();
  perform manage_project_image_upload(ticket,leader,pid,null,path,false);
  execute 'set local role authenticated';
  begin
    perform save_project_concepts(form||jsonb_build_object('p_image_ticket',ticket),null,jsonb_build_array(jsonb_build_object('id',concept)));
    raise exception 'Stale image change unexpectedly saved';
  exception when serialization_failure then null; end;
  perform pg_temp.assert_project(get_project_image_ref(pid)=newer,'stale editor leaves current image intact');
  execute 'reset role';
  ticket:=gen_random_uuid();
  perform manage_project_image_upload(ticket,leader,pid,null,newer,false);
  execute 'set local role authenticated';
  perform save_project_concepts(form||jsonb_build_object('p_image_ticket',ticket),null,jsonb_build_array(jsonb_build_object('id',concept)));
  perform pg_temp.assert_project(get_project_image_ref(pid) is null,'removal clears reference');
  execute 'reset role';
end $$;
rollback;
