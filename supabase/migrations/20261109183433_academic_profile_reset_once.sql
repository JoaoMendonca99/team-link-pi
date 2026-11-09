create table institution_private.profile_reset_run (
 key text primary key, cutoff_at timestamptz not null, completed_at timestamptz
);
create table institution_private.profile_academic_backup (
 user_id uuid primary key, old_course text, old_university text, old_institution_id uuid,
 reset_at timestamptz not null, notification_id uuid not null unique default gen_random_uuid()
);
alter table institution_private.profile_reset_run enable row level security;
alter table institution_private.profile_academic_backup enable row level security;
revoke all on institution_private.profile_reset_run,institution_private.profile_academic_backup from public,anon,authenticated;

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check(notification_type in
 ('chat_message','project_like','project_comment','join_request','join_approved','join_rejected','friend_request','friend_accepted','friend_message','profile_academic_reset'));
create unique index notifications_academic_reset_once on public.notifications(recipient_id,(metadata->>'reset_key')) where notification_type='profile_academic_reset';

-- This administrative notice is internal-only. Other push notifications retain
-- their existing trigger, preferences and delivery behavior.
drop trigger queue_notification_push on public.notifications;
create trigger queue_notification_push after insert on public.notifications for each row
 when (new.notification_type <> 'profile_academic_reset') execute function public.queue_notification_push();

create function institution_private.reset_existing_profiles() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare run institution_private.profile_reset_run; moment timestamptz;
begin
 -- Serializes concurrent invocations and profile edits during this short operation.
 perform pg_advisory_xact_lock(30302024);
 select * into run from institution_private.profile_reset_run where key='ies2024_v1';
 if run.completed_at is not null then
  return jsonb_build_object('already_completed',true,'profiles',(select count(*) from institution_private.profile_academic_backup),
   'notifications',(select count(*) from public.notifications where notification_type='profile_academic_reset' and metadata->>'reset_key'='ies2024_v1'));
 end if;
 if (select count(*) from public.instituicoes_ensino where ano_referencia=2024)<>2561 then raise exception 'Validate the complete 2024 institution catalog before resetting profiles'; end if;
 lock table public.profiles in share row exclusive mode;
 moment:=clock_timestamp();
 insert into institution_private.profile_reset_run(key,cutoff_at) values('ies2024_v1',moment) on conflict(key) do nothing;
 select * into run from institution_private.profile_reset_run where key='ies2024_v1' for update;
 insert into institution_private.profile_academic_backup(user_id,old_course,old_university,old_institution_id,reset_at)
  select id,course,university,institution_id,run.cutoff_at from public.profiles where created_at<=run.cutoff_at or created_at is null
  on conflict(user_id) do nothing;
 update public.profiles p set course=null,university=null,institution_id=null
  from institution_private.profile_academic_backup b where b.user_id=p.id;
 insert into public.notifications(id,recipient_id,notification_type,title,body,href,metadata)
  select notification_id,user_id,'profile_academic_reset','Atualize suas informações acadêmicas',
   'Atualizamos o cadastro de instituições de ensino do Team Link. Seu curso e sua faculdade foram redefinidos no perfil. Você pode informar essas informações novamente, se desejar. O preenchimento é opcional.',
   '/meu-espaco/perfil/editar#profile-academics',jsonb_build_object('reset_key','ies2024_v1','internal_only',true)
  from institution_private.profile_academic_backup on conflict do nothing;
 update institution_private.profile_academic_backup b set notification_id=n.id from public.notifications n
  where n.recipient_id=b.user_id and n.notification_type='profile_academic_reset' and n.metadata->>'reset_key'='ies2024_v1' and b.notification_id<>n.id;
 update institution_private.profile_reset_run set completed_at=clock_timestamp() where key='ies2024_v1';
 return jsonb_build_object('already_completed',false,'profiles',(select count(*) from institution_private.profile_academic_backup),
  'notifications',(select count(*) from public.notifications where notification_type='profile_academic_reset' and metadata->>'reset_key'='ies2024_v1'));
end $$;
revoke all on function institution_private.reset_existing_profiles() from public,anon,authenticated;
