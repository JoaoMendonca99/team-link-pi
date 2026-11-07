'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { FriendChats } from './_components/friend-chats'
import { MessagesClient } from './messages-client'

export function MessagesHub({basePath='/mensagens'}:{basePath?:string}) {
  const params = useSearchParams()
  const friends = params.get('aba') === 'amigos'
  const [projectsVisited, setProjectsVisited] = useState(!friends)
  const { loading, user, profile } = useSupabaseSession()

  useEffect(() => { if (!friends) setProjectsVisited(true) }, [friends])

  return <div role={basePath==='/mensagens'?'main':undefined} className="@container/chat flex h-full min-h-0 flex-1 flex-col bg-background">
    <nav aria-label="Tipos de mensagens" className="flex shrink-0 flex-wrap gap-2 border-b border-border px-4 py-2">
      <Button asChild size="sm" variant={friends ? 'default' : 'ghost'}><Link href={basePath+'?aba=amigos'} aria-current={friends ? 'page' : undefined}>Amigos</Link></Button>
      <Button asChild size="sm" variant={friends ? 'ghost' : 'default'}><Link href={basePath} aria-current={friends ? undefined : 'page'}>Projetos</Link></Button>
    </nav>
    {(!friends || projectsVisited) && <div className={friends ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
      <MessagesClient active={!friends} requestedProject={params.get('projeto')} requestedConversation={friends ? null : params.get('conversa')} />
    </div>}
    {friends && (loading ? <p role="status" className="p-5">Carregando mensagens…</p> : user ?
      <FriendChats basePath={basePath} key={user.id} userId={user.id} profile={profile} requestedFriend={params.get('amigo')} requestedChat={params.get('conversa')} /> :
      <div className="space-y-3 p-5"><p>Entre na sua conta para ver as conversas entre amigos.</p>
        <Button asChild><Link href="/login">Entrar</Link></Button></div>)}
  </div>
}
