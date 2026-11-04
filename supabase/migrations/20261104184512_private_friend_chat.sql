
create table public.friend_chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references public.profiles(id) on delete cascade,
  user_high uuid not null references public.profiles(id) on delete cascade,
  last_message_id bigint not null default 0,
  read_low bigint not null default 0,
  read_high bigint not null default 0,
  activity_at timestamptz not null default now(),
  unique (user_low, user_high),
  check (user_low < user_high)
);
create index friend_chat_conversations_high_idx on public.friend_chat_conversations(user_high);

create table public.friend_chat_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.friend_chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000 and body ~ '[^[:space:]]'),
  created_at timestamptz not null default clock_timestamp(),
  unique (conversation_id, sender_id, client_id)
);
create index friend_chat_messages_history_idx on public.friend_chat_messages(conversation_id, id desc);

alter table public.friend_chat_conversations enable row level security;
alter table public.friend_chat_messages enable row level security;
revoke all on public.friend_chat_conversations, public.friend_chat_messages from public, anon, authenticated;
grant select on public.friend_chat_conversations, public.friend_chat_messages to authenticated;
create policy "Participants read friend conversations" on public.friend_chat_conversations
  for select to authenticated using ((select auth.uid()) in (user_low, user_high));
create policy "Participants read friend messages" on public.friend_chat_messages
  for select to authenticated using (exists (
    select 1 from public.friend_chat_conversations c
    where c.id = conversation_id and (select auth.uid()) in (c.user_low, c.user_high)
  ));

alter table public.notifications drop constraint notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check check (
  notification_type in ('chat_message','project_like','project_comment','join_request',
    'join_approved','join_rejected','friend_request','friend_accepted','friend_message')
);
create index notifications_unread_friend_chat_idx on public.notifications (recipient_id, (metadata->>'friend_chat_id'))
  where notification_type = 'friend_message' and read_at is null;

create function public.open_friend_chat(p_user uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  lo uuid := least(actor, p_user);
  hi uuid := greatest(actor, p_user);
  chat_id uuid;
begin
  if actor is null or p_user is null or actor = p_user then
    raise exception 'Conversa indisponível.';
  end if;
  select id into chat_id from public.friend_chat_conversations where user_low = lo and user_high = hi;
  if found then return chat_id; end if;
  perform 1 from public.friendships
    where user_low = lo and user_high = hi and state = 'accepted' for share;
  if not found then raise exception 'Aceite a amizade para iniciar a conversa.'; end if;

  insert into public.friend_chat_conversations (user_low, user_high) values (lo, hi)
    on conflict (user_low, user_high) do nothing returning id into chat_id;
  if chat_id is null then
    select id into chat_id from public.friend_chat_conversations where user_low = lo and user_high = hi;
  end if;
  return chat_id;
end;
$$;

create function public.send_friend_message(p_chat uuid, p_body text, p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  chat public.friend_chat_conversations;
  message public.friend_chat_messages;
  recipient uuid;
begin
  select * into chat from public.friend_chat_conversations
    where id = p_chat and actor in (user_low, user_high);
  if not found then raise exception 'Conversa indisponível.'; end if;
  if p_client_id is null or coalesce(char_length(btrim(p_body)),0) not between 1 and 2000 or p_body !~ '[^[:space:]]' then
    raise exception 'Escreva uma mensagem de até 2.000 caracteres.';
  end if;

  select * into message from public.friend_chat_messages
    where conversation_id = chat.id and sender_id = actor and client_id = p_client_id;
  if found then return to_jsonb(message); end if;

  -- Same lock order as friendship mutations. A removal either precedes
  -- the send and denies it or follows a fully committed send.
  perform 1 from public.friendships
    where user_low = chat.user_low and user_high = chat.user_high and state = 'accepted' for share;
  if not found then raise exception 'A amizade precisa estar ativa para enviar mensagens.'; end if;
  perform 1 from public.friend_chat_conversations where id = chat.id for update;

  insert into public.friend_chat_messages (conversation_id, sender_id, client_id, body)
    values (chat.id, actor, p_client_id, btrim(p_body))
    on conflict (conversation_id,sender_id,client_id) do nothing returning * into message;
  if not found then
    select * into message from public.friend_chat_messages
      where conversation_id = chat.id and sender_id = actor and client_id = p_client_id;
    return to_jsonb(message);
  end if;

  update public.friend_chat_conversations set last_message_id = message.id, activity_at = message.created_at where id = chat.id;
  recipient := case when chat.user_low = actor then chat.user_high else chat.user_low end;
  perform public.create_notification(recipient, actor, null, null, null, null, 'friend_message',
    'Nova mensagem privada', 'Você recebeu uma mensagem de um amigo.',
    '/mensagens?aba=amigos&conversa=' || chat.id::text,
    jsonb_build_object('friend_chat_id',chat.id,'friend_message_id',message.id));
  return to_jsonb(message);
end;
$$;

create function public.read_friend_chat(p_chat uuid, p_through bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if not exists (
    select 1 from public.friend_chat_conversations c
    join public.friend_chat_messages m on m.conversation_id = c.id
    where c.id = p_chat and actor in (c.user_low, c.user_high) and m.id = p_through
  ) then raise exception 'Conversa indisponível.'; end if;

  update public.friend_chat_conversations set
    read_low = case when user_low = actor then greatest(read_low, p_through) else read_low end,
    read_high = case when user_high = actor then greatest(read_high, p_through) else read_high end
  where id = p_chat and ((user_low = actor and read_low < p_through) or (user_high = actor and read_high < p_through));

  update public.notifications set read_at = now()
    where recipient_id = actor and notification_type = 'friend_message' and read_at is null
      and metadata->>'friend_chat_id' = p_chat::text
      and (metadata->>'friend_message_id')::bigint <= p_through;
end;
$$;

create function public.get_friend_chats()
returns table(id uuid, friend_id uuid, full_name text, avatar_url text, can_send boolean,
  last_activity timestamptz, activity_at timestamptz, last_message_id bigint, last_message text,
  unread_count bigint, read_through bigint)
language sql stable security definer set search_path = '' as $$
  select c.id, p.id, p.full_name, p.avatar_url, coalesce(f.state = 'accepted',false),
    case when f.state = 'accepted' and pr.visible then pr.last_activity end,
    c.activity_at, c.last_message_id, m.body, unread.total,
    case when c.user_low = auth.uid() then c.read_low else c.read_high end
  from public.friend_chat_conversations c
  join public.profiles p on p.id = case when c.user_low = auth.uid() then c.user_high else c.user_low end
  left join public.friendships f using (user_low, user_high)
  left join public.profile_presence pr on pr.user_id = p.id and f.state = 'accepted'
  left join public.friend_chat_messages m on m.id = c.last_message_id and m.conversation_id = c.id
  cross join lateral (
    select count(*) as total from public.friend_chat_messages x where x.conversation_id = c.id
      and x.sender_id <> auth.uid() and x.id > case when c.user_low = auth.uid() then c.read_low else c.read_high end
  ) unread
  where auth.uid() in (c.user_low, c.user_high)
  order by c.activity_at desc, c.id;
$$;

create function public.refresh_friend_chat_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.state = 'accepted' then
      update public.friend_chat_conversations set last_message_id = last_message_id
        where user_low = old.user_low and user_high = old.user_high;
    end if;
  elsif new.state = 'accepted' then
    update public.friend_chat_conversations set last_message_id = last_message_id
      where user_low = new.user_low and user_high = new.user_high;
  end if;
  return null;
end;
$$;
create trigger refresh_friend_chat_membership after update of state or delete on public.friendships
  for each row execute function public.refresh_friend_chat_membership();

revoke all on function public.open_friend_chat(uuid), public.send_friend_message(uuid,text,uuid),
  public.read_friend_chat(uuid,bigint), public.get_friend_chats(), public.refresh_friend_chat_membership()
  from public, anon, authenticated;
grant execute on function public.open_friend_chat(uuid), public.send_friend_message(uuid,text,uuid),
  public.read_friend_chat(uuid,bigint), public.get_friend_chats() to authenticated;

-- Replicate participant-scoped conversation metadata only. Message bodies
-- are fetched via RLS after an authorized change event.
alter publication supabase_realtime add table public.friend_chat_conversations;
