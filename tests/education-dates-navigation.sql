begin;
do $$begin if current_setting('team_link.test_environment',true) is distinct from 'isolated' then raise exception 'Isolated database required';end if;end$$;
create function pg_temp.dates_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
do $$
declare actor uuid:=gen_random_uuid();other_user uuid:=gen_random_uuid(); f1 uuid:=gen_random_uuid();f2 uuid:=gen_random_uuid();f3 uuid:=gen_random_uuid();old_id uuid:=gen_random_uuid();
 p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();secret uuid:=gen_random_uuid();pending_id uuid:=gen_random_uuid();vals jsonb;bad jsonb;s jsonb;before_state jsonb;rev bigint:=0;failed boolean;basic jsonb:='{"full_name":"P35 synthetic owner"}';
begin
 insert into auth.users(id)values(actor),(other_user);insert into profiles(id,full_name)values(actor,'P35 synthetic owner'),(other_user,'P35 other owner');
 insert into usuario_formacoes(id,user_id,instituicao_manual,curso_manual,cursando_atualmente,origem)values(old_id,other_user,'Old institution','Old course',false,'user');
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',actor::text,true);
 vals:=jsonb_build_array(
 jsonb_build_object('id',f1,'instituicao_manual','University A','curso_manual','Course A','cursando_atualmente',true,'inicio_mes','2020-02','previsao_conclusao_mes','2021-12'),
 jsonb_build_object('id',f2,'instituicao_manual','University B','curso_manual','Course B','cursando_atualmente',false,'situacao_final','concluido','inicio_mes','2018-02','termino_mes','2022-12'),
 jsonb_build_object('id',f3,'instituicao_manual','University C','curso_manual','Course C','cursando_atualmente',false,'situacao_final','interrompido','inicio_mes','2021-02','termino_mes','2023-06'));
 perform save_profile_with_education(basic,'[]','[]',vals,f1,rev,false);rev:=rev+1;
 s:=get_my_education();perform pg_temp.dates_assert(jsonb_array_length(s->'formations')=3 and s->>'primary_id'=f1::text,'multiple formations and chosen primary persist');
 perform pg_temp.dates_assert((select situacao='cursando' and inicio_mes='2020-02-01' and previsao_conclusao_mes='2021-12-01' and termino_mes is null from usuario_formacoes where id=f1),'month-only persistence and outdated forecast never means completion');
 perform pg_temp.dates_assert((select situacao='concluido' from usuario_formacoes where id=f2) and (select situacao='interrompido' from usuario_formacoes where id=f3),'declared conclusion and interruption stay distinct');
 before_state:=s;
 bad:=jsonb_set(vals,'{0,inicio_mes}','"2025-13"');failed:=false;begin perform save_profile_with_education(basic,'[]','[]',bad,f1,rev,false);exception when sqlstate '22023' then failed:=true;end;perform pg_temp.dates_assert(failed and get_my_education()=before_state,'invalid month is atomic');
 bad:=jsonb_set(vals,'{1,termino_mes}','"2017-12"');failed:=false;begin perform save_profile_with_education(basic,'[]','[]',bad,f1,rev,false);exception when sqlstate '22023' then failed:=true;end;perform pg_temp.dates_assert(failed,'chronology enforced on server');
 bad:=jsonb_set(vals,'{0,cursando_atualmente}','false');failed:=false;begin perform save_profile_with_education(basic,'[]','[]',bad,f1,rev,false);exception when sqlstate '22023' then failed:=true;end;perform pg_temp.dates_assert(failed,'unchecking never silently declares completion');
 vals:=jsonb_set(jsonb_set(bad,'{0,situacao_final}','"concluido"'),'{0,termino_mes}','"2026-06"');
 perform save_profile_with_education(basic,'[]','[]',vals,f1,rev,false);rev:=rev+1;
 vals:=jsonb_set(vals,'{0,cursando_atualmente}','true');perform save_profile_with_education(basic,'[]','[]',vals,f1,rev,false);rev:=rev+1;
 perform pg_temp.dates_assert((select situacao='cursando' and termino_mes='2026-06-01' and previsao_conclusao_mes='2021-12-01' from usuario_formacoes where id=f1),'switching back retains actual ending and forecast independently');
 -- Older clients omit the new keys: preserve dates rather than erasing them.
 vals:=jsonb_set(vals,'{0}',(vals->0)-'inicio_mes'-'previsao_conclusao_mes'-'termino_mes'-'situacao_final');
 perform save_profile_with_education(basic,'[]','[]',vals,f1,rev,false);rev:=rev+1;
 perform pg_temp.dates_assert((select termino_mes='2026-06-01' and previsao_conclusao_mes='2021-12-01' from usuario_formacoes where id=f1),'omitted new fields preserve stored dates');
 failed:=false;begin update usuario_formacoes set inicio_mes='2025-02-01' where id=f1;exception when insufficient_privilege then failed:=true;end;perform pg_temp.dates_assert(failed,'direct writes cannot bypass owner transaction');
 bad:=jsonb_build_array(jsonb_build_object('id',old_id,'instituicao_manual','Forged','curso_manual','Forged','cursando_atualmente',true));failed:=false;begin perform save_profile_with_education(basic,'[]','[]',bad,null,rev,false);exception when insufficient_privilege then failed:=true;end;perform pg_temp.dates_assert(failed,'cannot edit another user formation');
 perform set_config('request.jwt.claim.sub',other_user::text,true);
 vals:=jsonb_build_array(jsonb_build_object('id',old_id,'instituicao_manual','Old institution','curso_manual','Old course','cursando_atualmente',false));
 perform save_profile_with_education('{"full_name":"P35 other owner"}','[]','[]',vals,null,0,false);
 perform pg_temp.dates_assert((select situacao='nao_informada' and inicio_mes is null and termino_mes is null from usuario_formacoes where id=old_id),'old unknown noncurrent record remains editable without invented status/dates');
 execute 'reset role';
 insert into projects(id,owner_id,title,slug,status,visibility)values(p1,actor,'P35 A','p35-'||p1,'open','public'),(p2,other_user,'P35 B','p35-'||p2,'in_progress','public'),(secret,other_user,'SECRET P35','p35-'||secret,'open','private'),(pending_id,other_user,'P35 pending','p35-'||pending_id,'open','public');
 insert into project_members(project_id,user_id,role,status)values(p2,actor,'member','active');
 insert into join_requests(project_id,user_id,status)values(pending_id,actor,'pending');
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',actor::text,true);
 s:=get_my_project_navigation(0,'p35-'||p2);
 perform pg_temp.dates_assert(jsonb_array_length(s->'items')=2 and s->'current'->>'id'=p2::text and s::text not like '%SECRET P35%','submenu includes own/active authorized panels and identifies direct route; private outsiders and pending candidates excluded');
 perform pg_temp.dates_assert(jsonb_array_length(get_my_project_navigation(1,null)->'items')=1,'submenu paginates on server');
 execute 'reset role';delete from project_members where project_id=p2 and user_id=actor;
 execute 'set local role authenticated';perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_temp.dates_assert(get_my_project_navigation(0,'p35-'||p2)->'current'='null'::jsonb,'revoked membership is not a cached authorization');
 failed:=false;begin perform get_project_panel_summary(p2);exception when raise_exception then failed:=true;end;perform pg_temp.dates_assert(failed,'existing panel data RPC still blocks revoked membership');
 execute 'reset role';execute 'set local role anon';perform set_config('request.jwt.claim.sub','',true);
 failed:=false;begin perform get_my_project_navigation(0,null);exception when insufficient_privilege then failed:=true;end;perform pg_temp.dates_assert(failed,'anonymous navigation is denied');
 perform pg_temp.dates_assert(not has_column_privilege('anon','profiles','email','select'),'public education does not expose email');
 execute 'reset role';
end $$;
rollback;
