"use client"

import { useEffect, useState } from "react"
import { PresenceLabel } from "@/components/profile/friendships"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/team-link/user-avatar"
import type { FriendChat } from "@/lib/chat/friends"
import { FRIENDSHIPS_CHANGED, ONLINE_WINDOW, profileRpc, type Friend } from "@/lib/profile-social"

const pageSize = 30
export const chatSearch = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR")

export function WidgetFriends({ chats, query, onOpen }: {
  chats: FriendChat[] | undefined
  query: string
  onOpen: (friend: Friend, chat?: FriendChat) => Promise<void>
}) {
  const [friends, setFriends] = useState<Friend[]>()
  const [error, setError] = useState("")
  const [openError, setOpenError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [limit, setLimit] = useState(pageSize)
  useEffect(() => {
    let request = 0
    const load = async () => {
      const id = ++request
      try {
        const rows = await profileRpc<Friend[]>("get_my_friendships")
        if (id === request) {
          setFriends(rows.filter((friend) => friend.relationship === "accepted"))
          setError("")
        }
      } catch {
        if (id === request) setError("Não foi possível carregar seus amigos.")
      }
    }
    void load()
    const timer = window.setInterval(() => { if (!document.hidden) void load() }, 60_000)
    window.addEventListener(FRIENDSHIPS_CHANGED, load)
    return () => {
      request += 1
      window.clearInterval(timer)
      window.removeEventListener(FRIENDSHIPS_CHANGED, load)
    }
  }, [chats])
  useEffect(() => setLimit(pageSize), [query])

  const byFriend = new Map(chats?.map((chat) => [chat.friend_id, chat]))
  const isOnline = (friend: Friend) => Boolean(friend.last_activity && Date.now() - Date.parse(friend.last_activity) < ONLINE_WINDOW)
  const rows = friends?.filter((friend) => chatSearch(friend.full_name ?? "Estudante").includes(query)).sort((a, b) => {
    const recent = (friend: Friend) => {
      const chat = byFriend.get(friend.user_id)
      return chat?.last_message_id ? Date.parse(chat.activity_at) : 0
    }
    return recent(b) - recent(a) || Number(isOnline(b)) - Number(isOnline(a)) ||
      (a.full_name ?? "Estudante").localeCompare(b.full_name ?? "Estudante", "pt-BR")
  })

  async function open(friend: Friend, chat?: FriendChat) {
    setBusy(friend.user_id)
    setOpenError("")
    try { await onOpen(friend, chat) }
    catch { setOpenError("Não foi possível abrir esta conversa.") }
    finally { setBusy(null) }
  }

  return <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2" aria-label="Lista de amigos">
    {(error || openError) && <p role="alert" className="p-2 text-sm text-destructive">{error || openError}</p>}
    {!friends && !error && <p role="status" className="p-2 text-sm">Carregando amigos…</p>}
    {rows?.length === 0 && <p className="p-2 text-sm text-muted-foreground">{query ? "Nenhum amigo encontrado." : "Você ainda não tem amigos aceitos."}</p>}
    {rows?.slice(0, limit).map((friend) => {
      const chat = byFriend.get(friend.user_id)
      const name = friend.full_name?.trim() || "Estudante"
      return <button type="button" key={friend.user_id} disabled={busy !== null} onClick={() => void open(friend, chat)}
        className="flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-ring">
        <UserAvatar name={name} imageUrl={friend.avatar_url ?? undefined} sizeClassName="size-9 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {chat?.last_message && <span className="block truncate text-xs text-muted-foreground">{chat.last_message}</span>}
          <PresenceLabel lastActivity={friend.last_activity} showPrivate />
        </span>
        {Boolean(chat?.unread_count) && <span aria-label={chat!.unread_count + " não lidas"} className="rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground">{chat!.unread_count}</span>}
      </button>
    })}
    {rows && rows.length > limit && <Button size="sm" variant="ghost" onClick={() => setLimit((value) => value + pageSize)}>Mostrar mais amigos</Button>}
  </div>
}
