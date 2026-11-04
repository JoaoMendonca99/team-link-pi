alter table public.profiles
  add column university text check (char_length(university) <= 120);

-- Public profile readers and invoker views keep access to the existing public fields.
revoke select on public.profiles from public, anon, authenticated;
revoke select (email) on public.profiles from public, anon, authenticated;
grant select (id, full_name, course, university, bio, avatar_url, skills, interests, created_at, updated_at)
  on public.profiles to anon, authenticated;

create table public.friendships (
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  requester_id uuid not null,
  state text not null default 'pending' check (state in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (user_low, user_high),
  check (user_low < user_high and requester_id in (user_low, user_high))
);
create index friendships_user_high_idx on public.friendships(user_high);
alter table public.friendships enable row level security;
revoke all on public.friendships from public, anon, authenticated;

create table public.profile_presence (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  visible boolean not null default false,
  last_activity timestamptz
);
alter table public.profile_presence enable row level security;
revoke all on public.profile_presence from public, anon, authenticated;

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type in ('chat_message','project_like','project_comment','join_request',
    'join_approved','join_rejected','friend_request','friend_accepted')
);

create function public.update_friendship(p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  lo uuid := least(actor, p_user);
  hi uuid := greatest(actor, p_user);
  kind text;
begin
  if actor is null or p_user is null or actor = p_user
    or not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'Não foi possível alterar esta amizade.';
  end if;

  case p_action
    when 'send' then
      insert into public.friendships (user_low, user_high, requester_id) values (lo, hi, actor)
        on conflict do nothing;
      kind := 'friend_request';
    when 'accept' then
      update public.friendships set state = 'accepted'
        where user_low = lo and user_high = hi and state = 'pending' and requester_id = p_user;
      kind := 'friend_accepted';
    when 'cancel' then
      delete from public.friendships
        where user_low = lo and user_high = hi and state = 'pending' and requester_id = actor;
    when 'decline' then
      delete from public.friendships
        where user_low = lo and user_high = hi and state = 'pending' and requester_id = p_user;
    when 'unfriend' then
      delete from public.friendships
        where user_low = lo and user_high = hi and state = 'accepted';
    else raise exception 'Ação de amizade inválida.';
  end case;
  if not found then raise exception 'O estado da amizade mudou. Atualize e tente novamente.'; end if;

  if kind is not null and not exists (
    select 1 from public.notifications where recipient_id = p_user and actor_id = actor
      and notification_type = kind and read_at is null
  ) then
    perform public.create_notification(p_user, actor, null, null, null, null, kind,
      case when kind = 'friend_request' then 'Solicitação de amizade' else 'Amizade aceita' end,
      case when kind = 'friend_request' then 'Você recebeu uma nova solicitação.' else 'Sua solicitação foi aceita.' end,
      '/usuarios/' || actor::text, '{}'::jsonb);
  end if;
end;
$$;

create function public.get_profile_social(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'count', (select count(*) from public.friendships where state = 'accepted' and p_user in (user_low, user_high)),
    'relationship', case when f.state = 'accepted' then 'accepted'
      when f.requester_id = auth.uid() then 'sent' when f.state = 'pending' then 'received' else 'none' end,
    'last_activity', case when f.state = 'accepted' and pr.visible then pr.last_activity end
  )
  from public.profiles p
  left join public.friendships f on auth.uid() is not null and
    f.user_low = least(auth.uid(), p.id) and f.user_high = greatest(auth.uid(), p.id)
  left join public.profile_presence pr on pr.user_id = p.id and f.state = 'accepted'
  where p.id = p_user;
$$;

create function public.get_my_friendships()
returns table(user_id uuid, full_name text, avatar_url text, course text, university text, relationship text, last_activity timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.avatar_url, p.course, p.university,
    case when f.state = 'accepted' then 'accepted' when f.requester_id = auth.uid() then 'sent' else 'received' end,
    case when f.state = 'accepted' and pr.visible then pr.last_activity end
  from public.friendships f
  join public.profiles p on p.id = case when f.user_low = auth.uid() then f.user_high else f.user_low end
  left join public.profile_presence pr on pr.user_id = p.id and f.state = 'accepted'
  where auth.uid() in (f.user_low, f.user_high)
  order by p.full_name, p.id;
$$;

create function public.get_my_presence_visibility()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select visible from public.profile_presence where user_id = auth.uid()), false);
$$;

create function public.set_my_presence_visibility(p_visible boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_visible is null then raise exception 'Acesso negado.'; end if;
  insert into public.profile_presence (user_id, visible, last_activity)
    values (auth.uid(), p_visible, case when p_visible then now() end)
    on conflict (user_id) do update set visible = excluded.visible, last_activity = excluded.last_activity;
end;
$$;

create function public.record_profile_activity()
returns void language sql security definer set search_path = '' as $$
  update public.profile_presence set last_activity = now()
    where user_id = auth.uid() and visible and (last_activity is null or last_activity < now() - interval '50 seconds');
$$;

revoke all on function public.update_friendship(uuid,text), public.get_profile_social(uuid),
  public.get_my_friendships(), public.get_my_presence_visibility(),
  public.set_my_presence_visibility(boolean), public.record_profile_activity() from public, anon, authenticated;
grant execute on function public.get_profile_social(uuid) to anon, authenticated;
grant execute on function public.update_friendship(uuid,text), public.get_my_friendships(),
  public.get_my_presence_visibility(), public.set_my_presence_visibility(boolean),
  public.record_profile_activity() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('profile-avatars', 'profile-avatars', true, 2097152, array['image/jpeg']);

-- Remove historical notification fallbacks that included the actor's email.
update public.notifications n set body = 'Alguém' || substr(n.body, length(p.email) + 1)
from public.profiles p
where p.id = n.actor_id and p.email is not null and p.email <> ''
  and n.notification_type in ('chat_message','project_comment','project_like')
  and starts_with(n.body, p.email || ' ');

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0, p_only_unread boolean DEFAULT false)
 RETURNS TABLE(id uuid, notification_type text, title text, body text, href text, metadata jsonb, is_read boolean, read_at timestamp with time zone, created_at timestamp with time zone, actor_id uuid, actor_name text, actor_course text, project_id uuid, project_title text, conversation_id uuid, message_id uuid, join_request_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    n.id,
    n.notification_type,
    n.title,
    n.body,
    n.href,
    n.metadata,
    n.read_at is not null as is_read,
    n.read_at,
    n.created_at,

    n.actor_id,
    coalesce(nullif(trim(actor.full_name), ''), 'Usuário') as actor_name,
    actor.course as actor_course,

    n.project_id,
    p.title as project_title,

    n.conversation_id,
    n.message_id,
    n.join_request_id
  from public.notifications n
  left join public.profiles actor
    on actor.id = n.actor_id
  left join public.projects p
    on p.id = n.project_id
  where n.recipient_id = auth.uid()
    and (
      p_only_unread = false
      or n.read_at is null
    )
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

CREATE OR REPLACE FUNCTION public.notify_chat_message_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_project_id uuid;
  v_project_title text;
  v_conversation_title text;
  v_actor_name text;
  v_recipient record;
begin
  select
    c.project_id,
    p.title,
    coalesce(
      nullif(trim(c.title), ''),
      case
        when c.kind = 'general' then 'Geral'
        else 'Conversa'
      end
    )
  into
    v_project_id,
    v_project_title,
    v_conversation_title
  from public.project_conversations c
  join public.projects p on p.id = c.project_id
  where c.id = new.conversation_id
    and c.status = 'active';

  if v_project_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(full_name), ''), 'Alguém')
  into v_actor_name
  from public.profiles
  where id = new.sender_id;

  for v_recipient in
    select cm.user_id
    from public.project_conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.sender_id
  loop
    perform public.create_notification(
      v_recipient.user_id,
      new.sender_id,
      v_project_id,
      new.conversation_id,
      new.id,
      null,
      'chat_message',
      'Nova mensagem',
      coalesce(v_actor_name, 'Alguém') || ' enviou uma mensagem em ' || v_conversation_title || '.',
      '/projetos/' || v_project_id::text,
      jsonb_build_object(
        'project_title', v_project_title,
        'conversation_title', v_conversation_title
      )
    );
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_project_comment_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
  v_project_title text;
  v_actor_name text;
  v_comment_preview text;
begin
  select owner_id, title
  into v_owner_id, v_project_title
  from public.projects
  where id = new.project_id;

  if v_owner_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(full_name), ''), 'Alguém')
  into v_actor_name
  from public.profiles
  where id = new.user_id;

  v_comment_preview := left(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g'), 120);

  perform public.create_notification(
    v_owner_id,
    new.user_id,
    new.project_id,
    null,
    null,
    null,
    'project_comment',
    'Novo comentário no seu projeto',
    coalesce(v_actor_name, 'Alguém') || ' comentou: ' || v_comment_preview,
    '/projetos/' || new.project_id::text,
    jsonb_build_object(
      'project_title', v_project_title,
      'comment_id', new.id
    )
  );

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_project_like_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner_id uuid;
  v_project_title text;
  v_actor_name text;
begin
  select owner_id, title
  into v_owner_id, v_project_title
  from public.projects
  where id = new.project_id;

  if v_owner_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(full_name), ''), 'Alguém')
  into v_actor_name
  from public.profiles
  where id = new.user_id;

  perform public.create_notification(
    v_owner_id,
    new.user_id,
    new.project_id,
    null,
    null,
    null,
    'project_like',
    'Nova curtida no seu projeto',
    coalesce(v_actor_name, 'Alguém') || ' curtiu seu projeto "' || coalesce(v_project_title, 'Projeto') || '".',
    '/projetos/' || new.project_id::text,
    jsonb_build_object(
      'project_title', v_project_title
    )
  );

  return new;
end;
$function$;

create function public.swap_profile_avatar(p_user uuid, p_avatar text)
returns text language plpgsql security invoker set search_path = '' as $$
declare previous text;
begin
  select avatar_url into previous from public.profiles where id = p_user for update;
  if not found then raise exception 'Perfil indisponível.'; end if;
  update public.profiles set avatar_url = p_avatar where id = p_user;
  return previous;
end;
$$;
revoke all on function public.swap_profile_avatar(uuid,text) from public, anon, authenticated;
grant execute on function public.swap_profile_avatar(uuid,text) to service_role;
