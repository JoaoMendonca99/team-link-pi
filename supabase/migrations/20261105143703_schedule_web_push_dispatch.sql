create extension if not exists pg_net with schema extensions;

-- No credential is embedded in the job definition or migration history.
create function public.invoke_web_push_dispatch() returns bigint
language plpgsql security definer set search_path='' as $$
declare dispatch_secret text; request_id bigint;
begin
 select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='push_dispatch_secret';
 if dispatch_secret is null or length(dispatch_secret)<32 then
   raise exception 'Push dispatch secret is not configured';
 end if;
 select net.http_post(
   url:='https://yjvtjqvkclkujcttvtwi.supabase.co/functions/v1/push-delivery',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||dispatch_secret),
   body:='{}'::jsonb,timeout_milliseconds:=15000
 ) into request_id;
 return request_id;
end;
$$;
revoke all on function public.invoke_web_push_dispatch() from public,anon,authenticated,service_role;

-- Enable only after the Edge Function and matching Vault secret are validated.
select cron.schedule('team-link-web-push-dispatch','* * * * *','select public.invoke_web_push_dispatch()');
select cron.alter_job(job_id:=jobid,active:=false) from cron.job where jobname='team-link-web-push-dispatch';
