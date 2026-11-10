'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {loadMyChatProjects} from '@/lib/chat/loaders'
import type {ChatProjectListItem} from '@/lib/chat/types'
import {CHAT_DIRECTORY_CHANGED} from '@/lib/chat/unified'
import {getSupabaseClient} from '@/lib/supabase/client'
export function useChatProjects(user:string|undefined,ready=true){
 const [projects,setProjects]=useState<ChatProjectListItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),sequence=useRef(0)
 const load=useCallback(async(background=false)=>{if(!user||!ready)return;const request=++sequence.current;if(!background)setLoading(true);try{const rows=await loadMyChatProjects(user);if(request===sequence.current){setProjects(rows);setError(null)}}catch{if(request===sequence.current){setProjects([]);setError('Não foi possível carregar suas conversas de projetos.')}}finally{if(request===sequence.current)setLoading(false)}},[user,ready])
 useEffect(()=>{if(!user||!ready)return;let alive=true,timer:number|undefined;void load();const refresh=()=>{if(alive&&!document.hidden){window.clearTimeout(timer);timer=window.setTimeout(()=>void load(true),150)}}
  const client=getSupabaseClient(),channel=client.channel('chat-projects:'+user+':'+crypto.randomUUID())
  for(const table of ['activity_updates','project_messages','project_conversation_members'])channel.on('postgres_changes',{event:'*',schema:'public',table},refresh)
  channel.subscribe();const interval=window.setInterval(refresh,60_000);window.addEventListener(CHAT_DIRECTORY_CHANGED,refresh);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
  return()=>{alive=false;window.clearTimeout(timer);window.clearInterval(interval);window.removeEventListener(CHAT_DIRECTORY_CHANGED,refresh);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);void client.removeChannel(channel)}
 },[user,ready,load])
 return {projects,loading,error,load}
}
