'use client'
import Link from 'next/link'
import {useRouter,useSearchParams} from 'next/navigation'
import {useEffect,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {useSupabaseSession} from '@/hooks/use-supabase-session'
import {useChatProjects} from '@/hooks/use-chat-projects'
import {UnifiedConversations,chatSearch} from '@/components/chat/widget-friends'
import {profileRpc} from '@/lib/profile-social'
import {FriendThread,useFriendChats} from './_components/friend-chats'
import {MessagesClient} from './messages-client'

export function MessagesHub({basePath='/mensagens'}:{basePath?:string}){
 const session=useSupabaseSession()
 if(session.loading)return <p role="status" className="p-5">Carregando mensagens…</p>
 if(!session.user)return <div className="space-y-3 p-5"><p>Entre para acessar suas conversas.</p><Button asChild><Link href="/login">Entrar</Link></Button></div>
 return <AuthorizedMessagesHub key={session.user.id} basePath={basePath} session={session}/>
}
function AuthorizedMessagesHub({basePath,session}:{basePath:string;session:ReturnType<typeof useSupabaseSession>}){
 const params=useSearchParams(),router=useRouter(),{user,profile}=session
 const project=params.get('projeto'),friendMode=params.get('aba')==='amigos'||Boolean(params.get('amigo')),requestedChat=friendMode?params.get('conversa'):null
 const {chats,listError,load}=useFriendChats(user?.id,requestedChat),projectList=useChatProjects(user?.id),[search,setSearch]=useState(''),[error,setError]=useState('')
 const friend=chats?.find(c=>c.id===requestedChat),selected=Boolean(project||requestedChat)
 const requestedFriend=params.get('amigo')
 useEffect(()=>{if(!requestedFriend||!user)return;let active=true;void profileRpc<string>('open_friend_chat',{p_user:requestedFriend}).then(async id=>{await load();if(active)router.replace(basePath+'?aba=amigos&conversa='+id,{scroll:false})}).catch(()=>{if(active)setError('Não foi possível abrir a conversa.')});return()=>{active=false}},[requestedFriend,user,load,router,basePath])
 if(!user)return <div className="space-y-3 p-5"><p>Entre para acessar suas conversas.</p><Button asChild><Link href="/login">Entrar</Link></Button></div>
 return <div role={basePath==='/mensagens'?'main':undefined} className="@container/chat flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
  <div className="flex min-h-0 min-w-0 flex-1 flex-col @min-[800px]/chat:flex-row">
   <aside aria-label="Conversas" className={(selected?'hidden':'flex')+' min-h-0 min-w-0 flex-1 flex-col border-r border-border @min-[800px]/chat:flex @min-[800px]/chat:w-72 @min-[800px]/chat:flex-none'}>
    <header className="shrink-0 space-y-3 border-b p-4"><h1 className="font-semibold">Mensagens</h1><Input type="search" aria-label="Buscar conversas" placeholder="Buscar conversas..." value={search} onChange={e=>setSearch(e.target.value)}/></header>
    {(error||listError)&&<p role="alert" className="p-3 text-sm text-destructive">{error||listError}</p>}
    <UnifiedConversations chats={chats} query={chatSearch(search.trim())} projects={projectList.projects} projectsLoading={projectList.loading} projectsError={projectList.error} retryProjects={()=>void projectList.load()} onProject={p=>router.push(basePath+'?projeto='+p.id,{scroll:false})} onOpen={async(friend,chat)=>{const id=chat?.id??await profileRpc<string>('open_friend_chat',{p_user:friend.user_id});if(!chat)await load();router.push(basePath+'?aba=amigos&conversa='+id,{scroll:false})}}/>
   </aside>
   <div className={(selected?'flex':'hidden')+' @container/chat min-h-0 min-w-0 flex-1 flex-col @min-[800px]/chat:flex'}>
    {friendMode?(friend?<FriendThread key={friend.id} chat={friend} profile={profile} userId={user.id} onChange={load} onBack={()=>router.push(basePath,{scroll:false})}/>:<div className="space-y-2 p-4"><p role="status">Conversa indisponível ou carregando…</p><Button variant="outline" onClick={()=>router.push(basePath,{scroll:false})}>Voltar às conversas</Button></div>):project?<MessagesClient active requestedProject={project} requestedConversation={params.get('conversa')} projectSource={projectList.projects} hideProjectList onDismissProject={()=>router.push(basePath,{scroll:false})}/>:<p className="m-auto p-6 text-sm text-muted-foreground">Escolha uma conversa para começar.</p>}
   </div>
  </div>
 </div>
}
