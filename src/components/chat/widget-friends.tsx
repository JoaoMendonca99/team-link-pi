"use client"

import { useEffect, useState } from "react"
import { PresenceLabel } from "@/components/profile/friendships"
import {MessagesSquare} from 'lucide-react'
import type {ChatProjectListItem} from '@/lib/chat/types'
import {matchingChatProjects,normalizeChatSearch} from '@/lib/chat/unified'
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/team-link/user-avatar"
import type { FriendChat } from "@/lib/chat/friends"
import { FRIENDSHIPS_CHANGED, ONLINE_WINDOW, profileRpc, type Friend } from "@/lib/profile-social"

const pageSize = 30
export const chatSearch = normalizeChatSearch

export function UnifiedConversations({ chats, query, onOpen,projects,projectsLoading,projectsError,onProject,retryProjects }: {
  chats: FriendChat[] | undefined
  query: string
  onOpen: (friend: Friend, chat?: FriendChat) => Promise<void>
  projects:ChatProjectListItem[];projectsLoading:boolean;projectsError:string|null;onProject:(project:ChatProjectListItem)=>void;retryProjects:()=>void
}) {
  const [friends, setFriends] = useState<Friend[]>()
  const [error, setError] = useState("")
  const [openError, setOpenError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [limit, setLimit] = useState(pageSize)
  const [retry,setRetry]=useState(0)
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
  }, [retry])
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

  const projectRows=matchingChatProjects(projects,query)
  return <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2" aria-label="Lista de conversas">
    {projectsLoading&&<p role="status" className="p-2 text-sm">Carregando conversas…</p>}
    {projectsError&&<div role="alert" className="p-2 text-sm"><p>{projectsError}</p><Button size="sm" variant="ghost" onClick={retryProjects}>Tentar novamente</Button></div>}
    {projectRows.map(project=><button type="button" key={project.id} className="flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-ring" onClick={()=>onProject(project)}><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><MessagesSquare className="size-5" aria-hidden/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{project.title}</span>{project.lastMessageContent&&<span className="block truncate text-xs text-muted-foreground">{project.lastMessageContent}</span>}</span>{Boolean(project.unreadCount)&&<span aria-label={project.unreadCount+' não lidas'} className="rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground">{project.unreadCount}</span>}</button>)}
    {(error || openError) && <div role="alert" className="p-2 text-sm text-destructive"><p>{error || openError}</p>{error&&<Button size="sm" variant="ghost" onClick={()=>setRetry(value=>value+1)}>Tentar novamente</Button>}</div>}
    {!friends && !error && <p role="status" className="p-2 text-sm">Carregando amigos…</p>}
    {rows?.length === 0&&!projectRows.length&&!projectsLoading&&!projectsError && <p className="p-2 text-sm text-muted-foreground">{query ? "Nenhuma conversa encontrada." : "Suas conversas aparecerão aqui."}</p>}
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
