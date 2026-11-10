-- Isolated synthetic database only; test housekeeping without changing committed evidence.
begin;
do $$
declare actor uuid:=gen_random_uuid();old_id uuid:=gen_random_uuid();recent_id uuid:=gen_random_uuid();ready_id uuid:=gen_random_uuid();claims jsonb;
begin
 insert into documentation_private.upload_batches(id,actor_id,client_id,scope,files,state,created_at) values
 (old_id,actor,gen_random_uuid(),'reference','[{"name":"old.pdf"}]','pending',now()-interval '2 hours'),
 (recent_id,actor,gen_random_uuid(),'reference','[{"name":"recent.pdf"}]','pending',now()),
 (ready_id,actor,gen_random_uuid(),'reference','[{"name":"saved.pdf"}]','ready',now()-interval '2 hours');
 claims:=documentation_private.claim_cleanup();
 if not exists(select from jsonb_array_elements(claims)c where c->>'id'=old_id::text) then raise exception 'Expired batch was not claimed';end if;
 if exists(select from jsonb_array_elements(claims)c where c->>'id' in (recent_id::text,ready_id::text)) then raise exception 'Cleanup touched recent/committed evidence';end if;
 if exists(select from jsonb_array_elements(documentation_private.claim_cleanup())c where c->>'id'=old_id::text) then raise exception 'Duplicate cleanup claim';end if;
 perform documentation_private.finish_cleanup(old_id);
 if not exists(select from documentation_private.upload_batches where id=old_id and cleaned and state='expired') then raise exception 'Cleanup completion not recorded';end if;
end$$;
rollback;
