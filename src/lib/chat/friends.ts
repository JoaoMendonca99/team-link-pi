import { getSupabaseClient } from '@/lib/supabase/client'

export type FriendChat = {
  id: string
  friend_id: string
  full_name: string | null
  avatar_url: string | null
  can_send: boolean
  last_activity: string | null
  activity_at: string
  last_message_id: number
  last_message: string | null
  unread_count: number
  read_through: number
}

export type FriendMessage = {
  id: number
  sender_id: string
  client_id: string
  body: string
  created_at: string
}

export const FRIEND_PAGE_SIZE = 40
export const FRIEND_MESSAGE_LIMIT = 2000

export async function listFriendMessages(chatId: string, cursor?: { before: number } | { after: number }) {
  const client = getSupabaseClient()
  let query = client.from('friend_chat_messages').select('id, sender_id, client_id, body, created_at').eq('conversation_id', chatId)
  if (cursor && 'before' in cursor) query = query.lt('id', cursor.before)
  if (cursor && 'after' in cursor) query = query.gt('id', cursor.after)
  const ascending = cursor !== undefined && 'after' in cursor
  const { data, error } = await query.order('id', { ascending }).limit(FRIEND_PAGE_SIZE)
  if (error) throw new Error('Não foi possível carregar as mensagens.')
  const rows = data as FriendMessage[]
  return ascending ? rows : rows.reverse()
}

export function watchFriendChats(userId: string, scope: string, onChange: () => void, onStatus?: (connected: boolean) => void) {
  const client = getSupabaseClient()
  const channel = client.channel('friend-chat:' + scope + ':' + userId + ':' + crypto.randomUUID())
  for (const column of ['user_low', 'user_high']) {
    const filter = column + '=eq.' + userId
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_chat_conversations', filter }, onChange)
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friend_chat_conversations', filter }, onChange)
  }
  channel.subscribe((status) => {
    onStatus?.(status === 'SUBSCRIBED')
    if (status === 'SUBSCRIBED') onChange()
  })
  return () => { void client.removeChannel(channel) }
}
