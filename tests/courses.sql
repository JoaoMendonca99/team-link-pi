begin;
do $$ begin if current_setting('team_link.test_environment',true) is distinct from 'isolated' then raise exception 'Isolated fixture required'; end if; end $$;
create function pg_temp.course_assert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
end $$;
revoke select on public.profiles from anon,authenticated;
do $$ declare columns text; begin
 select string_agg(quote_ident(column_name),',') into columns from information_schema.columns where table_schema='public' and table_name='profiles' and column_name<>'email';
 execute 'grant select('||columns||') on public.profiles to anon,authenticated';
end $$;
select pg_temp.course_assert(not has_column_privilege('anon','public.profiles','email','SELECT') and not has_column_privilege('authenticated','public.profiles','email','SELECT'),'email stays inaccessible through public profile queries');
create function pg_temp.fail_legacy_link() returns trigger language plpgsql as $$ begin raise exception 'Controlled legacy link failure'; end $$;
create trigger fixture_course_link_failure before update of course_id on profiles for each row when (new.course_id is not null and old.course_id is null) execute function pg_temp.fail_legacy_link();
select pg_temp.course_assert(count(*)=1743,'canonical course count') from cursos;
select pg_temp.course_assert(count(*)=353 and bool_or(codigo='0714E04'),'Cine codes remain text, including E and leading zeros') from cursos_cine;
select pg_temp.course_assert(count(*)=139,'normalized hierarchy') from cursos_cine_areas;
select pg_temp.course_assert(count(*)=46150 and count(distinct codigo_inep)=46150 and bool_and(instituicao_id is not null),'one linked offering per official code, not geographical row') from cursos_ofertas;
select pg_temp.course_assert(count(*)=1745,'deduplicated validated aliases') from cursos_aliases;
select pg_temp.course_assert(count(*)>=2,'same-name formations with different classifications stay separate') from cursos where nome_normalizado='administracao';
select pg_temp.course_assert(count(*)>=2,'same Cine label does not merge distinct names') from cursos where codigo_cine='0714E04';
select pg_temp.course_assert(count(*)=1,'explicit reviewed de/da equivalence') from cursos where nome_normalizado in ('engenharia de computacao','engenharia da computacao') and codigo_cine='0714E04' and grau_academico=1;

do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); computer uuid; math uuid; ies uuid; project uuid; s jsonb; marker jsonb; old text; frozen text; legacy text; protected_before text;
begin
 select id into computer from cursos where nome_normalizado='engenharia de computacao' and codigo_cine='0714E04' and grau_academico=1;
 select id into math from cursos where nome_normalizado='matematica' and grau_academico=1;
 select id into ies from instituicoes_ensino where codigo_inep=150;
 insert into profiles(id,full_name,course,university,institution_id,bio,skills,interests) values
 (a,'Synthetic legacy','Engenharia da Computação','UNIVERSIDADE DE SOROCABA',ies,'Preservar biografia',array['Pesquisa'],array['Tecnologia']),
 (b,'Synthetic ambiguous','Administração',null,null,null,'{}','{}'),
 (c,'Synthetic absent','Curso internacional não catalogado',null,null,null,'{}','{}'),
 (d,'Synthetic blank',null,null,null,null,'{}','{}');
 select md5(jsonb_build_object('institutions',(select jsonb_agg(i order by codigo_inep) from instituicoes_ensino i),'periods',(select jsonb_agg(i order by id) from activity_periods i),'notices',(select jsonb_agg(i order by id) from notifications i),'reset',(select jsonb_agg(i order by user_id) from institution_private.profile_academic_backup i),'reset_run',(select jsonb_agg(i order by key) from institution_private.profile_reset_run i),'missions',(select jsonb_agg(i order by user_id) from onboarding_private.preferences i))::text) into protected_before;
 begin perform course_private.link_existing_courses(); raise exception 'Failure was not propagated';
 exception when raise_exception then if sqlerrm<>'Controlled legacy link failure' then raise; end if; end;
 perform pg_temp.course_assert(not exists(select 1 from course_private.link_migration) and (select course_id is null from profiles where id=a),'failed legacy link rolls back marker and selections');
 execute 'drop trigger fixture_course_link_failure on public.profiles';
 s:=course_private.link_existing_courses();
 perform pg_temp.course_assert((select course_id=computer and course='Engenharia da Computação' and institution_id=ies and bio='Preservar biografia' from profiles where id=a),'legacy link preserves original text, institution and other profile values');
 perform pg_temp.course_assert((select course_id is null and course='Administração' from profiles where id=b),'ambiguous legacy remains manual');
 perform pg_temp.course_assert((select course_id is null and course='Curso internacional não catalogado' from profiles where id=c),'unknown legacy remains unchanged');
 perform pg_temp.course_assert((select course_id is null and course is null from profiles where id=d),'no synthetic unknown-course entity');
 perform pg_temp.course_assert((select md5(jsonb_build_object('institutions',(select jsonb_agg(i order by codigo_inep) from instituicoes_ensino i),'periods',(select jsonb_agg(i order by id) from activity_periods i),'notices',(select jsonb_agg(i order by id) from notifications i),'reset',(select jsonb_agg(i order by user_id) from institution_private.profile_academic_backup i),'reset_run',(select jsonb_agg(i order by key) from institution_private.profile_reset_run i),'missions',(select jsonb_agg(i order by user_id) from onboarding_private.preferences i))::text))=protected_before,'no institution changes, period changes, reset, notices, backup changes or onboarding changes');
 update profiles set course_id=math,course='canonicalize explicitly' where id=a;
 perform course_private.import_batch('courses',(select jsonb_build_array(jsonb_build_array(identidade,nome,codigo_cine,grau_academico,nivel_academico,jsonb_build_array(nome))) from cursos where id=math));
 perform pg_temp.course_assert((select course_id=math and course=(select nome from cursos where id=math) and institution_id=ies from profiles where id=a),'change course independently of institution');
 update profiles set course_id=null,course='Engenharia da Computação' where id=c;
 s:=course_private.link_existing_courses();
 perform pg_temp.course_assert((s->>'already_completed')::boolean and (select course_id=math from profiles where id=a) and (select course_id is null from profiles where id=c),'no repeated migration over new choices/manual entries');
 perform set_config('request.jwt.claim.sub',a::text,false);
 perform save_project_form_with_academics(jsonb_build_object('p_slug','course-optional-'||a,'p_title','Synthetic optional course','p_category','Engenharia','p_secondary_categories','[]'::jsonb,'p_project_url',null,'p_short_description','Resumo','p_description','Descrição','p_status','open','p_visibility','public','p_tags',jsonb_build_array('pesquisa'),'p_vacancies','[]'::jsonb),jsonb_build_object('context','academic','defaults',jsonb_build_object('course','','institution','','city',''),'period',jsonb_build_object('name','Inicial')));
 perform pg_temp.course_assert((select academic_course_id is null and academic_course is null and academic_institution_id is null from projects where slug='course-optional-'||a),'academic project can be created with no course or institution');
 legacy:=save_project_form_with_academics(jsonb_build_object('p_slug','synthetic-course-'||a,'p_title','Synthetic course project','p_category','Engenharia','p_secondary_categories','[]'::jsonb,'p_project_url',null,'p_short_description','Resumo','p_description','Descrição','p_status','open','p_visibility','public','p_tags',jsonb_build_array('pesquisa'),'p_vacancies','[]'::jsonb),jsonb_build_object('context','academic','defaults',jsonb_build_object('course_id',computer,'course','client cannot override official name','institution_id',ies,'institution','UNIVERSIDADE DE SOROCABA','city',''),'period',jsonb_build_object('name','2026.2','discipline','Histórico','advisor','Orientador','starts_on','2026-08-01','ends_on','2026-12-01')));
 select id into project from projects where slug=legacy;
 s:=get_project_academics(project);
 perform pg_temp.course_assert(s#>>'{defaults,course_id}'=computer::text and s#>>'{defaults,course}'=(select nome from cursos where id=computer),'project created through existing transaction with canonical course');
 select jsonb_agg(p order by id)::text into frozen from activity_periods p where project_id=project;
 perform save_project_academics(project,(s->>'revision')::integer,'academic',jsonb_build_object('course_id',math,'course','different client cache','institution_id',ies,'institution','UNIVERSIDADE DE SOROCABA','city',''),'[]');
 perform pg_temp.course_assert((select academic_course_id=math and academic_institution_id=ies from projects where id=project),'authorized project course edit');
 perform pg_temp.course_assert((select jsonb_agg(p order by id)::text from activity_periods p where project_id=project)=frozen,'periods, dates, discipline and advisor remain frozen');
 perform set_config('request.jwt.claim.sub',b::text,false);
 begin perform save_project_academics(project,1,'academic','{}','[]'); raise exception 'Foreign edit accepted'; exception when raise_exception then if sqlerrm='Foreign edit accepted' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',a::text,false);
 -- Missing institutions retain the actual original code and a pending link.
 perform course_private.import_batch('offers',jsonb_build_array(jsonb_build_array(99999999,99999999,(select identidade from cursos where id=computer),'0714E04',1,1,1,2024,jsonb_build_array(1),'Synthetic missing institution')));
 perform pg_temp.course_assert((select instituicao_id is null and codigo_ies_original=99999999 and status_vinculo='instituicao_pendente' from cursos_ofertas where codigo_inep=99999999),'missing institution produces no fictitious university');
end $$;
set local role authenticated;
select pg_temp.course_assert(count(*)=1 and bool_and(codigo_cine='0714E04'),'validated alias search, accent and punctuation normalization') from search_courses('  Eng. de Computação! ');
select pg_temp.course_assert(bool_or(nome ilike 'Engenharia De Computação'),'partial course search') from search_courses('engenharia de comp');
select pg_temp.course_assert(count(*)>=2,'ambiguous search is explicit') from search_courses('matematica');
select pg_temp.course_assert(count(*)<=15,'bounded search') from search_courses('engenharia',999);
select pg_temp.course_assert(count(*)=0,'short query and no results') from search_courses('x');
select pg_temp.course_assert(count(*)=0,'absent course') from search_courses('zzzzcoursenotfoundzzzz');
do $$ declare own uuid:=auth.uid(); other uuid; ies uuid; cid uuid; begin
 select id into other from profiles where id<>own limit 1;
 select id into ies from instituicoes_ensino where codigo_inep=150;
 select id into cid from cursos where nome_normalizado='engenharia de computacao' and codigo_cine='0714E04';
 update profiles set course_id=cid,course='force canonical name',institution_id=null,university=null where id=own;
 perform pg_temp.course_assert((select course_id=cid and course=(select nome from cursos where id=cid) and institution_id is null from profiles where id=own),'course without university');
 update profiles set course='Legacy client unknown course' where id=own;
 perform pg_temp.course_assert((select course_id is null and course='Legacy client unknown course' from profiles where id=own),'old clients clear stale course references');
 update profiles set course_id=null,course=null,institution_id=ies,university='UNIVERSIDADE DE SOROCABA' where id=own;
 perform pg_temp.course_assert((select course is null and course_id is null and institution_id=ies from profiles where id=own),'institution without course');
 update profiles set course_id=null,course=null,institution_id=null,university=null where id=own;
 perform pg_temp.course_assert(found,'both academic fields optional');
 update profiles set course='Forbidden foreign profile edit' where id=other;
 perform pg_temp.course_assert(not found,'profile ownership policy preserved');
 begin update profiles set course_id=gen_random_uuid() where id=own; raise exception 'Unknown ID accepted'; exception when raise_exception then if sqlerrm='Unknown ID accepted' then raise; end if; end;
 begin update cursos set nome='Forged'; raise exception 'Catalog write allowed'; exception when insufficient_privilege then null; end;
 begin insert into cursos_aliases(curso_id,nome_alternativo,normalizado,origem,validado) values(cid,'Forged','forged','browser',true); raise exception 'Alias write allowed'; exception when insufficient_privilege then null; end;
 begin perform course_private.import_batch('courses','[]'); raise exception 'Import allowed'; exception when insufficient_privilege then null; end;
 begin perform course_private.link_existing_courses(); raise exception 'Legacy migration exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into cursos_aliases(curso_id,nome_alternativo,normalizado,origem,validado) select id,'Unvalidated synthetic alias','unvalidated synthetic alias','fixture',false from cursos limit 1;
set local role anon;
select pg_temp.course_assert(count(*)=0,'unvalidated alias is excluded') from search_courses('unvalidated synthetic alias');
select pg_temp.course_assert(count(*)=1,'signup can search official names without accessing private profiles') from search_courses('Eng. de Computação');
do $$ begin
 begin update cursos set nome='Forged anonymous course'; raise exception 'Anonymous catalog write allowed'; exception when insufficient_privilege then null; end;
 begin perform * from course_private.link_migration; raise exception 'Private control exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
