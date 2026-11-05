'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, MessageCircle, Send } from 'lucide-react'

import { PresenceLabel } from '@/components/profile/friendships'
import { formatMessageTime, MessageDay } from '@/components/chat/message-time'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { FRIEND_MESSAGE_LIMIT, FRIEND_PAGE_SIZE, listFriendMessages, watchFriendChats, type FriendChat, type FriendMessage } from '@/lib/chat/friends'
import { FRIENDSHIPS_CHANGED, profileRpc } from '@/lib/profile-social'
import type { ProfileRow } from '@/types/database'

const baseUrl = '/mensagens?aba=amigos'
const time = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const nameOf = (chat: FriendChat) => chat.full_name?.trim() || 'Estudante'
const searchable = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR')

export function useFriendChats(userId: string | undefined, requestedChat: string | null) {
  const [chats, setChats] = useState<FriendChat[]>()
  const [listError, setListError] = useState('')
  const request = useRef(0)
  const connected = useRef(false)
  const activeChat = useRef(requestedChat)

  useEffect(() => { activeChat.current = requestedChat }, [requestedChat])

  const load = useCallback(async () => {
    if (!userId) return
    const id = ++request.current
    try {
      const data = await profileRpc<FriendChat[]>('get_friend_chats')
      if (request.current === id) { setChats(data); setListError('') }
    } catch (error) {
      if (request.current === id) setListError(error instanceof Error ? error.message : 'Não foi possível carregar as conversas.')
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void load()
    let scheduled: number | undefined
    const refresh = () => {
      window.clearTimeout(scheduled)
      scheduled = window.setTimeout(() => void load(), 100)
    }
    const unsubscribe = watchFriendChats(userId, 'list', refresh, (value) => { connected.current = value })
    const visible = () => { if (!document.hidden) refresh() }
    const timer = window.setInterval(() => {
      if (!document.hidden && (!connected.current || activeChat.current)) refresh()
    }, 60_000)
    document.addEventListener('visibilitychange', visible)
    window.addEventListener(FRIENDSHIPS_CHANGED, refresh)
    return () => {
      request.current += 1
      unsubscribe()
      window.clearTimeout(scheduled)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener(FRIENDSHIPS_CHANGED, refresh)
    }
  }, [load, userId])
  return { chats, listError, load }
}

export function FriendChats({ userId, profile, requestedFriend, requestedChat }: {
  userId: string
  profile: ProfileRow | null
  requestedFriend: string | null
  requestedChat: string | null
}) {
  const router = useRouter()
  const { chats, listError, load } = useFriendChats(userId, requestedChat)
  const [openError, setOpenError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!requestedFriend) return
    let active = true
    setOpenError('')
    void profileRpc<string>('open_friend_chat', { p_user: requestedFriend }).then(async (id) => {
      if (!active) return
      await load()
      if (active) router.replace(baseUrl + '&conversa=' + id, { scroll: false })
    }).catch((error) => {
      if (active) setOpenError(error instanceof Error ? error.message : 'Não foi possível abrir a conversa.')
    })
    return () => { active = false }
  }, [load, requestedFriend, router])

  const selected = chats?.find((chat) => chat.id === requestedChat)
  const filtered = chats?.filter((chat) => searchable(nameOf(chat)).includes(searchable(search.trim())))

  return <main className="flex h-[calc(100dvh_-_121px)] min-h-0 min-w-0 flex-col overflow-hidden lg:flex-row" aria-label="Mensagens entre amigos">
    <aside aria-label="Conversas com amigos" className={(selected ? 'hidden lg:flex' : 'flex') + ' min-h-0 min-w-0 flex-1 flex-col border-border lg:max-w-80 lg:border-r'}>
      <header className="space-y-3 border-b border-border p-4">
        <h1 className="font-semibold">Conversas com amigos</h1>
        <Input type="search" aria-label="Buscar conversas por nome" placeholder="Buscar por nome" value={search} onChange={(event) => setSearch(event.target.value)} />
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {openError && requestedFriend && <p role="alert" className="p-2 text-sm text-destructive">{openError}</p>}
        {requestedFriend && !openError && <p role="status" className="p-2 text-sm">Abrindo conversa…</p>}
        {listError && <div className="space-y-2 p-2"><p role="alert" className="text-sm text-destructive">{listError}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Tentar novamente</Button></div>}
        {!chats && !listError && <p role="status" className="p-2 text-sm">Carregando conversas…</p>}
        {requestedChat && chats && !selected && <p role="alert" className="p-2 text-sm">Conversa indisponível para esta conta.</p>}
        {filtered?.length === 0 && <p className="p-2 text-sm text-muted-foreground">
          {search ? 'Nenhuma conversa encontrada.' : 'Abra o perfil de um amigo para iniciar uma conversa.'}
        </p>}
        {filtered?.map((chat) => (
          <Link key={chat.id} href={baseUrl + '&conversa=' + chat.id} aria-current={chat.id === selected?.id ? 'page' : undefined}
            className={'flex min-w-0 items-center gap-3 rounded-xl border border-transparent p-2 hover:bg-muted ' + (chat.id === selected?.id ? 'border-border bg-muted' : '')}>
            <UserAvatar name={nameOf(chat)} imageUrl={chat.avatar_url ?? undefined} sizeClassName="size-10 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{nameOf(chat)}</span>
              <span className="block truncate text-xs text-muted-foreground">{chat.last_message ?? 'Conversa iniciada'}</span>
              <time className="block text-[11px] text-muted-foreground" dateTime={chat.activity_at}>{time(chat.activity_at)}</time>
            </div>
            {chat.unread_count > 0 && <span aria-label={chat.unread_count + ' não lidas'} className="rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground">
              {chat.unread_count}
            </span>}
          </Link>
        ))}
      </div>
    </aside>
    {selected ? <FriendThread key={selected.id} chat={selected} profile={profile} userId={userId} onChange={load} /> :
      <div className="hidden flex-1 flex-col items-center justify-center gap-2 p-5 text-muted-foreground lg:flex">
        <MessageCircle aria-hidden className="size-8 text-primary" />
        <p>Selecione uma conversa para abrir as mensagens.</p>
      </div>}
  </main>
}

function mergeMessages(current: FriendMessage[], incoming: FriendMessage[]) {
  const unique = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) unique.set(message.id, message)
  return [...unique.values()].sort((a, b) => a.id - b.id)
}

export function FriendThread({ chat, profile, userId, onChange, onBack }: {
  chat: FriendChat; profile: ProfileRow | null; userId: string; onChange: () => void; onBack?: () => void
}) {
  const { id, last_message_id: latestId } = chat
  const [messages, setMessages] = useState<FriendMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [olderLoading, setOlderLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false)
  const [through, setThrough] = useState(0)
  const [visible, setVisible] = useState(true)
  const pendingRead = useRef(0)
  const sendKey = useRef<string | null>(null)
  const pendingSend = useRef(false)
  const cursor = useRef<number | null>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const previousHeight = useRef<number | null>(null)

  useEffect(() => {
    const update = () => setVisible(!document.hidden)
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    let active = true
    async function sync() {
      setError('')
      try {
        const from = cursor.current
        if (from === null) {
          const rows = await listFriendMessages(id)
          if (!active) return
          cursor.current = rows.at(-1)?.id ?? 0
          setMessages((current) => mergeMessages(current, rows))
          setHasOlder(rows.length === FRIEND_PAGE_SIZE)
        } else {
          let after = from
          while (after < latestId) {
            const rows = await listFriendMessages(id, { after })
            if (!active) return
            if (!rows.length) break
            after = rows[rows.length - 1].id
            cursor.current = after
            setMessages((current) => mergeMessages(current, rows))
            if (rows.length < FRIEND_PAGE_SIZE) break
          }
        }
        setThrough(cursor.current ?? 0)
        setLoaded(true)
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : 'Não foi possível carregar as mensagens.')
      }
    }
    void sync()
    return () => { active = false }
  }, [id, latestId, retry])

  useEffect(() => {
    if (!visible || !chat.unread_count || through <= chat.read_through || through <= pendingRead.current) return
    pendingRead.current = through
    void profileRpc('read_friend_chat', { p_chat: id, p_through: through })
      .then(onChange).catch(() => { pendingRead.current = 0 })
  }, [chat.read_through, chat.unread_count, id, onChange, through, visible])

  useLayoutEffect(() => {
    const node = scroll.current
    if (!node) return
    if (previousHeight.current !== null) {
      node.scrollTop += node.scrollHeight - previousHeight.current
      previousHeight.current = null
    } else {
      node.scrollTop = node.scrollHeight
    }
  }, [messages])

  async function loadOlder() {
    if (!messages.length || olderLoading) return
    setOlderLoading(true)
    setError('')
    try {
      const rows = await listFriendMessages(id, { before: messages[0].id })
      if (scroll.current) previousHeight.current = scroll.current.scrollHeight
      setMessages((current) => mergeMessages(current, rows))
      setHasOlder(rows.length === FRIEND_PAGE_SIZE)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível carregar mensagens antigas.')
    } finally {
      setOlderLoading(false)
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!chat.can_send || pendingSend.current || !draft.trim()) return
    pendingSend.current = true
    setSending(true)
    setSendError('')
    sendKey.current ??= crypto.randomUUID()
    try {
      const sent = await profileRpc<FriendMessage>('send_friend_message', { p_chat: id, p_body: draft, p_client_id: sendKey.current })
      setMessages((current) => mergeMessages(current, [sent]))
      sendKey.current = null
      setDraft('')
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Não foi possível enviar a mensagem.')
    } finally {
      pendingSend.current = false
      setSending(false)
      onChange()
    }
  }

  return <section aria-label="Conversa privada" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <header className="flex min-w-0 shrink-0 items-center gap-3 border-b border-border p-3">
      {onBack ? <Button variant="ghost" size="icon" onClick={onBack} aria-label="Voltar às conversas"><ArrowLeft aria-hidden /></Button> :
        <Button asChild variant="ghost" size="icon" className="lg:hidden"><Link href={baseUrl} aria-label="Voltar às conversas"><ArrowLeft aria-hidden /></Link></Button>}
      <Link href={'/usuarios/' + chat.friend_id} className="flex min-w-0 items-center gap-3 hover:underline">
        <UserAvatar name={nameOf(chat)} imageUrl={chat.avatar_url ?? undefined} sizeClassName="size-10 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{nameOf(chat)}</span>
          {chat.can_send && <PresenceLabel lastActivity={chat.last_activity} showPrivate={Boolean(onBack)} />}
        </span>
      </Link>
    </header>
    <div ref={scroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 [overflow-anchor:none] sm:p-5">
      {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => setRetry((value) => value + 1)}>Tentar novamente</Button></div>}
      {!loaded && !error && <p role="status">Carregando histórico…</p>}
      {loaded && !messages.length && <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>}
      {hasOlder && <Button type="button" size="sm" variant="ghost" disabled={olderLoading} onClick={() => void loadOlder()}>
        {olderLoading ? 'Carregando…' : 'Carregar mensagens antigas'}
      </Button>}
      <ol className="space-y-3" aria-label="Histórico de mensagens">{messages.map((message, index) => {
        const mine = message.sender_id === userId
        const name = mine ? profile?.full_name || 'Você' : nameOf(chat)
        const profileHref = '/usuarios/' + message.sender_id
        return <Fragment key={message.id}>
          <MessageDay value={message.created_at} previous={messages[index - 1]?.created_at} />
          <li className={'flex min-w-0 items-start gap-2 ' + (mine ? 'flex-row-reverse' : '')}>
            <Link href={profileHref} aria-label={'Perfil de ' + name} className="shrink-0 rounded-full">
              <UserAvatar name={name} imageUrl={(mine ? profile?.avatar_url : chat.avatar_url) ?? undefined} sizeClassName="size-8" ring={false} />
            </Link>
            <div className={'min-w-0 max-w-[85%] rounded-2xl px-3 py-2 ' + (mine ? 'bg-primary/15' : 'bg-muted')}>
              <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                <Link href={profileHref} className="break-words font-semibold text-foreground hover:underline">{name}</Link>
                <time dateTime={message.created_at}>{formatMessageTime(message.created_at)}</time>
              </div>
              <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{message.body}</p>
            </div>
          </li>
        </Fragment>
      })}</ol>
    </div>
    {chat.can_send ? <form onSubmit={(event) => void send(event)} className="shrink-0 space-y-2 border-t border-border p-3">
      {sendError && <p role="alert" className="text-sm text-destructive">{sendError}</p>}
      <div className="flex min-w-0 items-end gap-2">
        <Textarea aria-label="Mensagem privada" placeholder="Escreva sua mensagem" rows={2} maxLength={FRIEND_MESSAGE_LIMIT} value={draft} disabled={sending}
          onChange={(event) => { setDraft(event.target.value); sendKey.current = null; setSendError('') }} />
        <Button type="submit" disabled={sending || !draft.trim()} aria-label="Enviar mensagem"><Send aria-hidden /></Button>
      </div>
    </form> : <div className="shrink-0 border-t border-border p-3 text-sm text-muted-foreground">
      {sendError && <p role="alert" className="text-destructive">{sendError}</p>}
      A amizade foi desfeita. O histórico continua disponível.
    </div>}
  </section>
}
