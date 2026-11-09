-- Destructive migration scenarios are allowed only in the isolated fixture.
begin;
do $$ begin if current_setting('team_link.test_environment',true) is distinct from 'isolated' then raise exception 'Isolated fixture required'; end if; end $$;
create function pg_temp.catalog_assert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
end $$;
select pg_temp.catalog_assert(count(*)=2561,'complete official catalog') from instituicoes_ensino;
select pg_temp.catalog_assert(institution_private.normalize('  UNIVERSIDÁDE---de   Sorocaba! ')='universidade de sorocaba','Unicode accents punctuation and spacing');
select pg_temp.catalog_assert(count(*)=1 and min(codigo_inep)=150,'official UNISO identifier') from instituicoes_ensino where sigla='UNISO';

create function pg_temp.fail_reset_notice() returns trigger language plpgsql as $$ begin
 if new.notification_type='profile_academic_reset' then raise exception 'Controlled notification failure'; end if; return new;
end $$;
create trigger fixture_fail_notice before insert on notifications for each row execute function pg_temp.fail_reset_notice();
do $$ begin
 begin perform institution_private.reset_existing_profiles(); raise exception 'Failure was not propagated';
 exception when raise_exception then if sqlerrm<>'Controlled notification failure' then raise; end if; end;
 perform pg_temp.catalog_assert(not exists(select 1 from institution_private.profile_academic_backup),'backup rolls back after failure');
 perform pg_temp.catalog_assert(not exists(select 1 from institution_private.profile_reset_run),'run marker rolls back after failure');
end $$;
drop trigger fixture_fail_notice on notifications;

do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); newcomer uuid:=gen_random_uuid();
 ies uuid; other_ies uuid; project uuid; s jsonb; defaults jsonb; snap text; unchanged text; profile_snapshot text; cohort int; notice_count int; push_count int; saved_slug text;
begin
 insert into profiles(id,full_name,course,university,bio,skills,interests) values
 (a,'Synthetic both','Curso anterior','Instituição anterior','Biografia preservada',array['Pesquisa'],array['Educação']),
 (b,'Synthetic course','Somente curso',null,null,'{}','{}'),(c,'Synthetic university',null,'Somente faculdade',null,'{}','{}'),(d,'Synthetic neither',null,null,null,'{}','{}');
 select id into ies from instituicoes_ensino where codigo_inep=150;
 select id into other_ies from instituicoes_ensino where codigo_inep=1;
 insert into push_devices(user_id,active) values(a,true);
 insert into notifications(recipient_id,notification_type,title,body) values(a,'project_like','Notificação anterior','Preservar');
 select count(*) into push_count from push_outbox;
 select count(*) into cohort from profiles;
 select md5(jsonb_agg(to_jsonb(p)-'course'-'university'-'institution_id'-'updated_at' order by id)::text) into profile_snapshot from profiles p;
 select md5(jsonb_build_object('projects',(select jsonb_agg(p order by id) from projects p),'periods',(select jsonb_agg(p order by id) from activity_periods p),'tasks',(select jsonb_agg(p order by id) from activity_tasks p),'missions',(select jsonb_agg(p order by user_id) from onboarding_private.preferences p))::text) into unchanged;
 s:=institution_private.reset_existing_profiles();
 perform pg_temp.catalog_assert((s->>'profiles')::int=cohort and (s->>'notifications')::int=cohort,'all old profiles and one notice each');
 perform pg_temp.catalog_assert(not exists(select 1 from profiles where course is not null or university is not null or institution_id is not null),'academic profile fields reset');
 perform pg_temp.catalog_assert((select old_course='Curso anterior' and old_university='Instituição anterior' from institution_private.profile_academic_backup where user_id=a),'original academic values backed up');
 perform pg_temp.catalog_assert((select old_course='Somente curso' and old_university is null from institution_private.profile_academic_backup where user_id=b),'course-only backup');
 perform pg_temp.catalog_assert((select old_course is null and old_university='Somente faculdade' from institution_private.profile_academic_backup where user_id=c),'university-only backup');
 perform pg_temp.catalog_assert((select old_course is null and old_university is null from institution_private.profile_academic_backup where user_id=d),'empty profile tracked too');
 perform pg_temp.catalog_assert((select md5(jsonb_agg(to_jsonb(p)-'course'-'university'-'institution_id'-'updated_at' order by id)::text) from profiles p)=profile_snapshot,'all other profile values preserved');
 perform pg_temp.catalog_assert((select md5(jsonb_build_object('projects',(select jsonb_agg(p order by id) from projects p),'periods',(select jsonb_agg(p order by id) from activity_periods p),'tasks',(select jsonb_agg(p order by id) from activity_tasks p),'missions',(select jsonb_agg(p order by user_id) from onboarding_private.preferences p))::text))=unchanged,'project/period/task/mission history unchanged');
 perform pg_temp.catalog_assert((select count(*) from push_outbox)=push_count,'reset notices never enqueue push');
 perform pg_temp.catalog_assert((select count(*) from notifications where title='Notificação anterior')=1,'previous notices preserved');
 perform pg_temp.catalog_assert((select bool_and(title='Atualize suas informações acadêmicas' and href='/meu-espaco/perfil/editar#profile-academics' and body like '%O preenchimento é opcional.') from notifications where notification_type='profile_academic_reset'),'notice text and destination');
 update profiles set course='Novo curso' where id=a;
 update profiles set institution_id=ies,university='Client text is not authoritative' where id=b;
 perform pg_temp.catalog_assert((select university='UNIVERSIDADE DE SOROCABA' and course is null from profiles where id=b),'institution alone stores canonical name');
 update profiles set institution_id=null,university='Instituição estrangeira manual' where id=c;
 insert into profiles(id,full_name,course,university) values(newcomer,'Synthetic new account','Curso novo','Instituição nova');
 s:=institution_private.reset_existing_profiles();
 perform pg_temp.catalog_assert((s->>'already_completed')::boolean,'second run is a no-op');
 perform pg_temp.catalog_assert((select course='Novo curso' from profiles where id=a) and (select institution_id=ies from profiles where id=b),'new choices survive rerun');
 perform pg_temp.catalog_assert((select course='Curso novo' and university='Instituição nova' from profiles where id=newcomer) and not exists(select 1 from institution_private.profile_academic_backup where user_id=newcomer),'new accounts excluded from reset');
 perform pg_temp.catalog_assert((select count(*) from notifications where notification_type='profile_academic_reset')=cohort,'no duplicate or new-account notices');
 perform set_config('request.jwt.claim.sub',a::text,false);
 saved_slug:=save_project_form_with_academics(jsonb_build_object('p_slug','institution-test-'||a,'p_title','Synthetic academic project','p_category','Engenharia','p_secondary_categories','[]'::jsonb,'p_project_url',null,'p_short_description','Resumo','p_description','Descrição','p_status','open','p_visibility','public','p_tags',jsonb_build_array('pesquisa'),'p_vacancies','[]'::jsonb),jsonb_build_object('context','academic','defaults',jsonb_build_object('institution_id',ies,'institution','UNIVERSIDADE DE SOROCABA','course','','city','Sorocaba'),'period',jsonb_build_object('name','2026.2','discipline','Disciplina preservada','advisor','Orientador preservado','starts_on','2026-08-01','ends_on','2026-12-01')));
 select id into project from projects where slug=saved_slug;
 s:=get_project_academics(project); perform pg_temp.catalog_assert(s#>>'{defaults,institution_id}'=ies::text,'project relationship via existing transaction');
 select jsonb_agg(p order by id)::text into snap from activity_periods p where project_id=project;
 perform save_project_academics(project,(s->>'revision')::int,'academic',jsonb_build_object('institution_id',other_ies,'institution','Server will canonicalize','course','','city',''), '[]');
 perform pg_temp.catalog_assert((select academic_institution_id=other_ies from projects where id=project),'authorized institution editing');
 perform pg_temp.catalog_assert((select jsonb_agg(p order by id)::text from activity_periods p where project_id=project)=snap,'institution edit does not rewrite periods');
 perform set_config('request.jwt.claim.sub',d::text,false);
 begin perform save_project_academics(project,1,'academic','{}','[]'); raise exception 'Foreign project accepted'; exception when raise_exception then if sqlerrm='Foreign project accepted' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',a::text,false);
end $$;
set local role authenticated;
select pg_temp.catalog_assert(count(*)>=1 and bool_or(codigo_inep=150),'case accent punctuation acronym search') from search_institutions('  UNÍSO.  ');
select pg_temp.catalog_assert(bool_or(codigo_inep=150),'full-name search') from search_institutions('universidade de sorocaba');
select pg_temp.catalog_assert(bool_or(codigo_inep=150),'partial-name search') from search_institutions('sorocaba');
select pg_temp.catalog_assert(count(*)>=2,'ambiguous acronyms remain separate') from search_institutions('UCP') where sigla='UCP';
select pg_temp.catalog_assert(count(*)<=15,'bounded results') from search_institutions('faculdade',999);
select pg_temp.catalog_assert(count(*)=0,'one-character query does not load catalog') from search_institutions('u');
select pg_temp.catalog_assert(count(*)=0,'missing institution') from search_institutions('zzzzinstituicaoinexistentezzzz');
do $$ begin
 begin update instituicoes_ensino set nome='Forged'; raise exception 'Catalog write allowed'; exception when insufficient_privilege then null; end;
 begin perform institution_private.import_batch('[]'); raise exception 'Import allowed'; exception when insufficient_privilege then null; end;
 begin perform * from institution_private.profile_academic_backup; raise exception 'Private backup exposed'; exception when insufficient_privilege then null; end;
 begin perform institution_private.reset_existing_profiles(); raise exception 'Reset allowed'; exception when insufficient_privilege then null; end;
 update profiles set course=null,university=null,institution_id=null where id=auth.uid();
 perform pg_temp.catalog_assert(found,'profile can save without either academic field');
end $$;
set local role anon;
do $$ begin
 begin perform * from instituicoes_ensino; raise exception 'Anonymous catalog read allowed'; exception when insufficient_privilege then null; end;
 begin perform * from search_institutions('uniso'); raise exception 'Anonymous search allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
