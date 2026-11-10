begin;
do $$ begin if current_setting('team_link.test_environment',true) is distinct from 'isolated' then raise exception 'Isolated fixture required'; end if; end $$;
create function pg_temp.concept_assert(ok boolean,label text) returns void language plpgsql as $$ begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
end $$;
revoke select on public.profiles from anon,authenticated;
do $$ declare columns text; begin
 select string_agg(quote_ident(column_name),',') into columns from information_schema.columns where table_schema='public' and table_name='profiles' and column_name<>'email';
 execute 'grant select('||columns||') on public.profiles to anon,authenticated';
end $$;
select pg_temp.concept_assert(not has_column_privilege('anon','public.profiles','email','SELECT') and not has_column_privilege('authenticated','public.profiles','email','SELECT'),'email grants unchanged');
select pg_temp.concept_assert(not has_column_privilege('authenticated','public.project_required_skills','conceito_id','UPDATE'),'legacy reference is server-managed');
select pg_temp.concept_assert(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('search_concepts','save_profile_concepts','save_project_concepts','save_vacancy_concepts','get_my_concept_refs','get_project_concept_refs') and p.prosecdef),'public wrappers respect invoker permissions');

do $$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); js uuid; react uuid; native uuid; ai uuid; ml uuid; ux uuid; ui uuid; pending uuid; merged uuid; pid uuid; vid uuid;
 s jsonb; vals jsonb; project_before jsonb; report jsonb; before_refs text; denied boolean; old_count int; basic jsonb:=jsonb_build_object('full_name','Pessoa sintética','bio','Biografia preservada');
begin
 select id into js from conceitos where nome='JavaScript'; select id into react from conceitos where nome='React'; select id into native from conceitos where nome='React Native';
 select id into ai from conceitos where nome='Inteligência Artificial'; select id into ml from conceitos where nome='Aprendizado de Máquina';
 select id into ux from conceitos where nome='Experiência do Usuário'; select id into ui from conceitos where nome='Interface do Usuário';
 perform pg_temp.concept_assert((select count(*)=99 from conceitos where source_key is not null) and (select count(*)=3 from conceitos_relacoes where validado),'small reviewed seed and separate relations');
 perform pg_temp.concept_assert(js<>react and react<>native and ai<>ml and ux<>ui and js<>(select id from conceitos where nome='Java'),'different identities');
 perform pg_temp.concept_assert(concept_private.resolve_exact(' JS ')=js and concept_private.resolve_exact('ReactJS')=react,'reviewed aliases');
 perform pg_temp.concept_assert(concept_private.resolve_exact('IA') is null and concept_private.resolve_exact('IHM') is null and concept_private.resolve_exact('UX/UI') is null,'context confirmation and compound text');
 perform pg_temp.concept_assert(concept_private.key('  ROBÓTICA  ')=concept_private.key('robotica') and concept_private.key('C')<>concept_private.key('C++') and concept_private.key('C#')<>concept_private.key('C++'),'normalization preserves meaningful symbols');
 perform pg_temp.concept_assert((select id=js from search_concepts('JS',20) limit 1),'exact alias precedes partial matches');
 perform pg_temp.concept_assert((select count(*)>=2 from search_concepts('React',20)),'partial names');
 perform pg_temp.concept_assert((select count(*)=1 from search_concepts('robotica',20)),'accentless search');
 perform pg_temp.concept_assert((select count(*)=0 from search_concepts('naoexisteconceito',20)),'empty results');
 perform pg_temp.concept_assert((select count(*)<=1 from search_concepts('a',1)) and (select count(*)<=20 from search_concepts('a',999)),'bounded search');
 insert into auth.users(id) values(a),(b); insert into profiles(id,full_name,skills,interests) values(a,'Conceitos A',array['JS','IA','Modelagem'],array['React']), (b,'Conceitos B','{}','{}');
 perform pg_temp.concept_assert((select count(*)=1 from conceitos_vinculos where user_id=a and tipo='skill' and conceito_id=js),'legacy exact alias trigger');
 perform pg_temp.concept_assert((select count(*)=2 from conceitos_vinculos where user_id=a and tipo='skill' and conceito_id is null),'preserved ambiguous and unreviewed chips');
 perform pg_temp.concept_assert((select skills=array['JS','IA','Modelagem'] from profiles where id=a),'legacy text unchanged');
 report:=concept_private.migrate_legacy();perform pg_temp.concept_assert(report=concept_private.migrate_legacy(),'idempotent migration');
 execute 'set local role authenticated'; perform set_config('request.jwt.claim.sub',a::text,true);
 perform pg_temp.concept_assert((get_my_concept_refs()->'skills'->0->>'id')=js::text,'own references under RLS');
 perform pg_temp.concept_assert((select count(*)=0 from conceitos_vinculos where user_id=b),'other profiles hidden');
 vals:=jsonb_build_array(jsonb_build_object('id',js,'label','forged text'));
 perform save_profile_concepts(basic,vals,vals);
 perform pg_temp.concept_assert((select skills=array['JavaScript'] and interests=array['JavaScript'] and bio='Biografia preservada' from profiles where id=a),'authoritative label and atomic profile projections');
 perform pg_temp.concept_assert((select count(*)=2 from conceitos_vinculos where user_id=a and conceito_id=js),'skill and interest independent');
 perform save_profile_concepts(basic,'[]',vals);
 perform pg_temp.concept_assert((select count(*)=1 and bool_and(tipo='interest') from conceitos_vinculos where user_id=a),'remove skill keeps interest');
 perform save_profile_concepts(basic,'[]','[]');
 perform pg_temp.concept_assert((select cardinality(skills)=0 and cardinality(interests)=0 from profiles where id=a),'optional empty lists');
 pending:=concept_private.propose('Engenharia Biomédica Sintética','Engenharia');
 perform pg_temp.concept_assert(pending=concept_private.propose('  engenharia   biomedica sintética ','Engenharia'),'own trivial proposal duplicate');
 perform pg_temp.concept_assert((select status='provisorio' from conceitos where id=pending),'proposal is explicitly provisional');
 perform save_profile_concepts(basic,jsonb_build_array(jsonb_build_object('id',pending)),vals);
 -- Ownership is checked even at the privileged private boundary.
 denied:=false;begin perform concept_private.apply_choices('skill',b,vals);exception when insufficient_privilege then denied:=true;end;perform pg_temp.concept_assert(denied,'foreign profile write denied');
 denied:=false;begin update conceitos set nome='Ataque' where id=js;exception when insufficient_privilege then denied:=true;end;perform pg_temp.concept_assert(denied,'official concepts immutable to users');
 denied:=false;begin insert into conceitos_aliases(conceito_id,nome,origem) values(js,'Java','Ataque');exception when insufficient_privilege then denied:=true;end;perform pg_temp.concept_assert(denied,'official aliases immutable');
 denied:=false;begin perform concept_private.review(pending,'validado','Ataque','Tentativa não autorizada');exception when insufficient_privilege then denied:=true;end;perform pg_temp.concept_assert(denied,'private review is admin only');
 denied:=false;begin perform concept_private.propose(repeat('x',121),'Geral');exception when sqlstate '22023' then denied:=true;end;perform pg_temp.concept_assert(denied,'proposal length');
 denied:=false;begin perform concept_private.propose('<script>','Geral');exception when sqlstate '22023' then denied:=true;end;perform pg_temp.concept_assert(denied,'invalid proposal');
 denied:=false;begin perform concept_private.propose('   ','Geral');exception when sqlstate '22023' then denied:=true;end;perform pg_temp.concept_assert(denied,'empty proposal');
 denied:=false;begin perform save_profile_concepts(basic,(select jsonb_agg(jsonb_build_object('id',js)) from generate_series(1,17)),'[]');exception when sqlstate '22023' then denied:=true;end;perform pg_temp.concept_assert(denied,'bounded profile choices');
 s:=jsonb_build_object('p_slug','concept-synthetic','p_title','Projeto Conceitos','p_category','Engenharia','p_secondary_categories',jsonb_build_array('Robótica'),
 'p_short_description','Resumo','p_description','Descrição','p_status','open','p_visibility','public','p_vacancies',jsonb_build_array(jsonb_build_object('id',null,'title','Pesquisa','description','Texto integral','positions',2,'open',true,'concept_refs',jsonb_build_array(jsonb_build_object('id',react)))));
 perform save_project_concepts(s,null,vals);
 select id into pid from projects where slug='concept-synthetic';
 select (get_project_concept_refs(pid)->'vacancies'->0->>'id')::uuid into vid;
 perform pg_temp.concept_assert((select count(*)=1 from conceitos_vinculos where project_id=pid and tipo='tag' and conceito_id=js) and (select count(*)=1 from conceitos_vinculos where vacancy_id=vid and conceito_id=react),'new project and real vacancy IDs, independent contexts');
 perform pg_temp.concept_assert((select category='Engenharia' and secondary_categories=array['Robótica'] from projects where id=pid),'categories preserved');
 perform save_vacancy_concepts(pid,vid,'Pesquisa revisada','Descrição preservada',jsonb_build_array(jsonb_build_object('id',native)),2,true);
 perform pg_temp.concept_assert((select count(*)=1 from conceitos_vinculos where vacancy_id=vid and conceito_id=native),'vacancy edit');
 perform pg_temp.concept_assert((select count(*)=1 from conceitos_vinculos where project_id=pid and tipo='tag' and conceito_id=js),'vacancy change does not change project tags');
 denied:=false;begin perform save_project_concepts(s||jsonb_build_object('p_project_id',pid),null,'[]');exception when others then denied:=true;end;perform pg_temp.concept_assert(denied,'at least one project tag remains mandatory');
 execute 'reset role';
 select to_jsonb(p) into project_before from projects p where id=pid;
 select count(*) into old_count from join_requests;
 -- Existing old API remains synchronized and cannot invent an identity for IA.
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',a::text,true);
 perform recruitment_save_vacancy(pid,vid,'Pesquisa revisada','Descrição preservada',array['JS','IA'],2,true);
 execute 'reset role';
 perform pg_temp.concept_assert((select skills=array['JS','IA'] from project_vacancies where id=vid) and (select count(*)=1 from conceitos_vinculos where vacancy_id=vid and conceito_id=js) and (select count(*)=1 from conceitos_vinculos where vacancy_id=vid and conceito_id is null),'legacy recruitment writer stays synchronized');
 perform pg_temp.concept_assert(project_before=(select to_jsonb(p) from projects p where id=pid) and old_count=(select count(*) from join_requests),'recruitment and project data preserved');
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',b::text,true);
 denied:=false;begin perform save_vacancy_concepts(pid,vid,'Ataque','Ataque',vals,2,true);exception when insufficient_privilege then denied:=true;end;perform pg_temp.concept_assert(denied,'foreign vacancy denied');
 denied:=false;begin perform get_project_concept_refs(pid);exception when insufficient_privilege then denied:=true;end;perform pg_temp.concept_assert(denied,'manager-only references');
 execute 'reset role';
 -- Quota is enforced at the database, not a client counter.
 insert into conceitos(nome,dominio,status,origem) select 'Quota '||n,'Geral','provisorio','Teste' from generate_series(1,40) n;
 insert into concept_private.propostas(id,autor,chave,dominio) select id,b,nome_normalizado,'Geral' from conceitos where origem='Teste';
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',b::text,true);
 denied:=false;begin perform concept_private.propose('Além da quota','Geral');exception when sqlstate 'P0001' then denied:=true;end;perform pg_temp.concept_assert(denied,'server proposal rate limit');
 execute 'reset role';
 update concept_private.propostas set created_at=now()-interval '2 hours' where autor=b;
 insert into conceitos(nome,dominio,status,origem) select 'Quota diária '||n,'Geral','provisorio','Teste diário' from generate_series(1,60) n;
 insert into concept_private.propostas(id,autor,chave,dominio,created_at) select id,b,nome_normalizado,'Geral',now()-interval '2 hours' from conceitos where origem='Teste diário';
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',b::text,true);
 denied:=false;begin perform concept_private.propose('Além da quota diária','Geral');exception when sqlstate 'P0001' then denied:=true;end;perform pg_temp.concept_assert(denied,'daily server quota');
 execute 'reset role';
 update concept_private.propostas set created_at=now()-interval '2 days' where autor=b;
 insert into conceitos(nome,dominio,status,origem) select 'Quota pendente '||n,'Geral','provisorio','Teste pendente' from generate_series(1,100) n;
 insert into concept_private.propostas(id,autor,chave,dominio,created_at) select id,b,nome_normalizado,'Geral',now()-interval '2 days' from conceitos where origem='Teste pendente';
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',b::text,true);
 denied:=false;begin perform concept_private.propose('Além da quota pendente','Geral');exception when sqlstate 'P0001' then denied:=true;end;perform pg_temp.concept_assert(denied,'active provisional quota');
 execute 'reset role';
 -- A genuinely ambiguous alias never migrates automatically.
 insert into conceitos(nome,dominio,status,origem) values('Outra IA sintética','Saúde','validado','Teste de ambiguidade') returning id into merged;
 insert into conceitos_aliases(conceito_id,nome,origem,validado) values(merged,'IA','Teste',true);
 perform pg_temp.concept_assert(concept_private.resolve_exact('IA') is null,'multiple meanings remain unresolved');
 -- Consolidation preserves references, old UUID redirect, original spellings and separate relationship types.
 perform concept_private.review(pending,'validado','Engenharia Biomédica Sintética','Revisão sintética aprovada');
 insert into conceitos(nome,dominio,status,origem) values('Biomédica duplicada sintética','Engenharia','provisorio','Teste') returning id into merged;
 perform concept_private.replace_refs('interest',a,jsonb_build_array(jsonb_build_object('id',merged,'label','Biomédica duplicada sintética')));
 perform concept_private.consolidate(merged,pending,'Identidade revisada exclusivamente no ambiente sintético');
 perform concept_private.consolidate(merged,pending,'Reexecução idempotente da revisão sintética');
 perform pg_temp.concept_assert((select status='inativo' and consolidado_em=pending from conceitos where id=merged) and (select count(*)=2 from conceitos_vinculos where user_id=a and conceito_id=pending),'merge identity and typed references');
 perform pg_temp.concept_assert((select skills=array['Engenharia Biomédica Sintética'] and interests=array['Engenharia Biomédica Sintética'] from profiles where id=a),'merge compatibility projections');
 denied:=false;begin perform concept_private.consolidate(pending,js,'Identidades incompatíveis não devem ser fundidas');exception when others then denied:=true;end;perform pg_temp.concept_assert(denied,'incompatible domains rejected');
 execute 'set local role anon';perform set_config('request.jwt.claim.sub','',true);
 perform pg_temp.concept_assert((select count(*)>0 from search_concepts('React',12)),'public catalog without profile data');
 denied:=false;begin perform get_my_concept_refs();exception when insufficient_privilege then denied:=true;end;perform pg_temp.concept_assert(denied,'anonymous references denied');
 denied:=false;begin perform concept_private.propose('Anônimo','Geral');exception when insufficient_privilege then denied:=true;end;perform pg_temp.concept_assert(denied,'anonymous proposal denied');
 execute 'reset role';
end $$;

-- Failure during a re-run rolls back the entire operation, including its marker.
create function pg_temp.concept_fail() returns trigger language plpgsql as $$ begin raise exception 'Controlled concept migration failure'; end $$;
create trigger concept_test_failure before insert on public.conceitos_vinculos for each row execute function pg_temp.concept_fail();
do $$ declare before_refs text; failed boolean:=false; begin
 select md5(coalesce(jsonb_agg(to_jsonb(v) order by id)::text,'')) into before_refs from conceitos_vinculos v;
 delete from concept_private.migracoes where nome='initial';
 begin perform concept_private.migrate_legacy();exception when others then failed:=true;end;
 perform pg_temp.concept_assert(failed and not exists(select 1 from concept_private.migracoes where nome='initial'),'migration failure leaves no completed marker');
 perform pg_temp.concept_assert(before_refs=(select md5(coalesce(jsonb_agg(to_jsonb(v) order by id)::text,'')) from conceitos_vinculos v),'migration failure restores previous links');
end $$;
drop trigger concept_test_failure on public.conceitos_vinculos;
select concept_private.migrate_legacy();
rollback;
