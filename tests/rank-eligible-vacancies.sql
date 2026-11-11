begin;
do $$ begin if current_setting('team_link.test_environment',true) is distinct from 'isolated' then raise exception 'Isolated fixture required';end if;end $$;
create function pg_temp.assert_rank(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end $$;
do $$
declare actor uuid:=gen_random_uuid();owner uuid:=gen_random_uuid();p uuid;hidden uuid;old uuid;newest uuid;closed uuid;secret uuid;ranked jsonb;first_page jsonb;next_page jsonb;row jsonb;
begin
 insert into auth.users(id) values(actor),(owner);
 insert into profiles(id,full_name)values(actor,'Filtro ator'),(owner,'Filtro gestor');
 insert into projects(owner_id,title,slug,category,short_description,description,status,visibility)
 values(owner,'Fixture de ranking','rank-'||owner,'Engenharia','Teste','Teste','open','public') returning id into p;
 insert into projects(owner_id,title,slug,category,short_description,description,status,visibility)
 values(owner,'Fixture privada','rank-hidden-'||owner,'Engenharia','Teste','Teste','open','private') returning id into hidden;
 insert into project_vacancies(project_id,title,positions,skills,open,created_at) values(p,'Alvo 00',1,array['React'],true,'2025-01-01') returning id into old;
 insert into project_vacancies(project_id,title,positions,open,created_at)
 select p,'Alvo '||lpad(n::text,2,'0'),1,true,'2026-01-01'::date+n from generate_series(1,15)n;
 select id into newest from project_vacancies where project_id=p and title='Alvo 15';
 insert into project_vacancies(project_id,title,positions,open)values(p,'Alvo fechada',1,false) returning id into closed;
 insert into project_vacancies(project_id,title,positions,open)values(hidden,'Alvo privada',1,true) returning id into secret;
 ranked:=jsonb_build_array(secret,closed,old,old);
 perform set_config('request.jwt.claim.sub',actor::text,true);
 execute 'set local role authenticated';
 first_page:=public.explore_project_vacancies(jsonb_build_object('search','Alvo','category','Engenharia','sort','recommended','size',12,'recommendation_order',ranked));
 next_page:=public.explore_project_vacancies(jsonb_build_object('search','Alvo','category','Engenharia','sort','recommended','size',12,'page',1,'recommendation_order',ranked));
 perform pg_temp.assert_rank((first_page->>'total')::int=16,'filtered total excludes hidden and closed vacancies even when supplied in rank');
 perform pg_temp.assert_rank(first_page->'items'->0->>'id'=old::text,'older ranked vacancy moves from later page to first');
 perform pg_temp.assert_rank(jsonb_array_length(first_page->'items')=12 and jsonb_array_length(next_page->'items')=4,'correct page sizes');
 perform pg_temp.assert_rank(not exists(select 1 from jsonb_array_elements(first_page->'items') x join jsonb_array_elements(next_page->'items') y on x->>'id'=y->>'id'),'no overlap across pages');
 row:=public.explore_project_vacancies(jsonb_build_object('search','Alvo','category','Engenharia','sort','recent','recommendation_order',ranked));
 perform pg_temp.assert_rank(row->'items'->0->>'id'=newest::text,'explicit recent order overrides rank');
 row:=public.explore_project_vacancies(jsonb_build_object('search','Alvo','category','Engenharia','sort','name','recommendation_order',jsonb_build_array(newest)));
 perform pg_temp.assert_rank(row->'items'->0->>'id'=old::text,'explicit name order overrides rank');
 row:=public.explore_project_vacancies(jsonb_build_object('search','Alvo 15','sort','recommended','recommendation_order',ranked));
 perform pg_temp.assert_rank((row->>'total')::int=1 and row->'items'->0->>'id'=newest::text,'search excludes unmatched recommendations');
 row:=public.explore_project_vacancies(jsonb_build_object('search','Alvo','category','categoria inexistente','sort','recommended','recommendation_order',ranked));
 perform pg_temp.assert_rank((row->>'total')::int=0,'category remains authoritative');
 execute 'reset role';
 perform pg_temp.assert_rank(not has_function_privilege('anon','public.explore_project_vacancies(jsonb)','EXECUTE'),'anon ACL remains closed');
 perform pg_temp.assert_rank(not has_table_privilege('authenticated','vacancy_private.public_vacancies','SELECT'),'private view remains inaccessible');
end $$;
rollback;
