create table public.push_preferences(user_id uuid primary key references public.profiles on delete cascade,
 settings jsonb not null default '{"private":true,"projects":true,"social":true,"activities":true,"deadlines":true,"preview":false,"sound":false}');
alter table public.push_preferences enable row level security;
revoke all on public.push_preferences from public,anon,authenticated;
grant select,insert,update on public.push_preferences to authenticated;
create policy push_preferences_own on public.push_preferences to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create table public.push_devices(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,
 endpoint text not null unique, p256dh text not null, auth text not null, label text not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),active boolean not null default true);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from public,anon,authenticated;
create function public.manage_push_device(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); v_endpoint text:=p_data->>'endpoint'; result uuid;
begin
 if actor is null then raise exception 'Acesso negado'; end if;
 if p_action='owns' then return (select jsonb_build_object('id',id) from public.push_devices where push_devices.endpoint=v_endpoint and user_id=actor and active); end if;
 if p_action='list' then return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label,'updated_at',updated_at)),'[]') from public.push_devices where user_id=actor and active); end if;
 if p_action='remove' then
   update public.push_devices set active=false where user_id=actor and (id=nullif(p_data->>'id','')::uuid or push_devices.endpoint=v_endpoint);
   return 'null';
 end if;
 if p_action<>'save' or v_endpoint !~ '^https://([a-z0-9-]+\.)*(fcm.googleapis.com|push.services.mozilla.com|notify.windows.com|push.apple.com)/[^[:space:]]+$'
 or length(v_endpoint)>2048 or (p_data->>'p256dh') !~ '^[A-Za-z0-9_-]{87}=?$' or (p_data->>'auth') !~ '^[A-Za-z0-9_-]{22}={0,2}$'
 then raise exception 'Assinatura inválida'; end if;
 if v_endpoint is null or p_data->>'p256dh' is null or p_data->>'auth' is null then raise exception 'Assinatura inválida'; end if;
 if (select count(*) from public.push_devices where user_id=actor and active)>=20 and not exists(select 1 from public.push_devices where push_devices.endpoint=v_endpoint and user_id=actor) then raise exception 'Remova um dispositivo antes de adicionar outro.'; end if;
 insert into public.push_devices(user_id,endpoint,p256dh,auth,label) values(actor,v_endpoint,p_data->>'p256dh',rtrim(p_data->>'auth','='),left(coalesce(p_data->>'label','Navegador'),100))
 on conflict(endpoint) do update set user_id=actor,p256dh=excluded.p256dh,auth=excluded.auth,label=excluded.label,active=true,updated_at=now() returning id into result;
 return jsonb_build_object('id',result);
end;
$$;
revoke all on function public.manage_push_device(text,jsonb) from public,anon;
grant execute on function public.manage_push_device(text,jsonb) to authenticated;
create table public.push_outbox(id bigint generated always as identity primary key,notification_id uuid not null references public.notifications on delete cascade,
 device_id uuid not null references public.push_devices on delete cascade,owner_id uuid not null,attempts int not null default 0,
 available_at timestamptz not null default now(),state text not null default 'pending',unique(notification_id,device_id));
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from public,anon,authenticated;
create index push_outbox_pending on public.push_outbox(available_at) where state='pending';
create function public.queue_notification_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.recipient_id is distinct from new.actor_id then
 insert into public.push_outbox(notification_id,device_id,owner_id) select new.id,id,user_id from public.push_devices where user_id=new.recipient_id and active on conflict do nothing;
 end if;
 return new;
end;
$$;
revoke all on function public.queue_notification_push() from public,anon,authenticated;
create trigger queue_notification_push after insert on public.notifications for each row execute function public.queue_notification_push();
create function public.claim_push_batch() returns jsonb language plpgsql security definer set search_path='' as $$
declare job record; n public.notifications%rowtype; d public.push_devices%rowtype; settings jsonb; category text; href text; payload jsonb; batch jsonb:='[]';
begin
 for job in select * from public.push_outbox where state='pending' and available_at<=now() and attempts<5 order by id limit 30 for update skip locked loop
   select * into n from public.notifications where id=job.notification_id;
   select * into d from public.push_devices where id=job.device_id and user_id=job.owner_id and active;
   if not found or n.read_at is not null or n.created_at<now()-interval '1 day' or (n.project_id is not null and not exists(select 1 from public.project_members where project_id=n.project_id and user_id=n.recipient_id and status='active')) then
     update public.push_outbox set state='skipped' where id=job.id;continue;
   end if;
   if n.notification_type='friend_message' and not exists(select 1 from public.friend_chat_conversations c join public.friendships f using(user_low,user_high) where c.id=nullif(n.metadata->>'friend_chat_id','')::uuid and n.recipient_id in(c.user_low,c.user_high) and f.state='accepted') then
     update public.push_outbox set state='skipped' where id=job.id;continue;
   end if;
   if n.conversation_id is not null and not exists(select 1 from public.project_conversation_members where conversation_id=n.conversation_id and user_id=n.recipient_id) then update public.push_outbox set state='skipped' where id=job.id;continue; end if;
   category:=case when n.notification_type='friend_message' then 'private' when n.notification_type='chat_message' then 'projects' when n.title like 'Prazo de %' then 'deadlines' when n.title='Atualização de atividade' then 'activities' else 'social' end;
   select p.settings into settings from public.push_preferences p where user_id=n.recipient_id;
   if coalesce(settings->category,'true')<>'true'::jsonb then update public.push_outbox set state='skipped' where id=job.id;continue; end if;
   href:=case when n.href ~ '^/(mensagens|projetos|usuarios|perfil)(/|\?|$)' and n.href !~ '[\\[:cntrl:]]' then n.href else '/perfil' end;
   payload:=jsonb_build_object('user',n.recipient_id,'title','Team Link','body','Você tem uma nova notificação.','href',href,'tag','notification-'||n.id,'silent',not coalesce(settings->'sound'='true'::jsonb,false));
   if category in ('private','projects') then
     payload:=payload||jsonb_build_object('body','Você recebeu uma nova mensagem.');
     if settings->'preview'='true'::jsonb then payload:=payload||jsonb_build_object('title','Team Link — '||left(coalesce((select p.title||' / '||c.title from public.project_conversations c join public.projects p on p.id=c.project_id where c.id=n.conversation_id),'Nova mensagem'),100),'body',left(coalesce((select full_name from public.profiles where id=n.actor_id),'Integrante')||': '||n.body,160)); end if;
   else payload:=payload||jsonb_build_object('title','Team Link — '||left(n.title,100),'body',left(n.body,160)); end if;
   update public.push_outbox set attempts=attempts+1,available_at=now()+interval '5 minutes' where id=job.id;
   batch:=batch||jsonb_build_array(jsonb_build_object('id',job.id,'subscription',jsonb_build_object('endpoint',d.endpoint,'keys',jsonb_build_object('p256dh',d.p256dh,'auth',d.auth)),'payload',payload));
 end loop;
 return batch;
end;
$$;
create function public.finish_push(p_id bigint,p_status int) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status in (404,410) then update public.push_devices set active=false where id=(select device_id from public.push_outbox where id=p_id); end if;
 update public.push_outbox set state=case when p_status between 200 and 299 then 'sent' when p_status in(404,410) or attempts>=5 then 'failed' else 'pending' end where id=p_id;
end;
$$;
revoke all on function public.claim_push_batch(),public.finish_push(bigint,int) from public,anon,authenticated;
grant execute on function public.claim_push_batch(),public.finish_push(bigint,int) to service_role;


