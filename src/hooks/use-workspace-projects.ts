'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {getSupabaseClient} from '@/lib/supabase/client'
import type {ProjectNavigation} from '@/lib/workspace-navigation'

export function useWorkspaceProjects(user:string|undefined,current:string|null){
 const scope=JSON.stringify([user,current]),scopeRef=useRef(scope),controller=useRef<AbortController|null>(null)
 scopeRef.current=scope
 const [state,setState]=useState<{scope:string;data:ProjectNavigation;offset:number}>(),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const load=useCallback(async(offset=0)=>{
  if(!user)return
  controller.current?.abort();const request=new AbortController();controller.current=request
  setBusy(true);setError('')
  const {data,error}=await getSupabaseClient().rpc('get_my_project_navigation',{p_offset:offset,p_current:current}).abortSignal(request.signal)
  if(request.signal.aborted||scopeRef.current!==scope)return
  if(error||!data){setState(undefined);setError('Não foi possível carregar seus painéis.')}
  else setState(previous=>{const response=data as ProjectNavigation;return {scope,offset,data:{...response,items:offset&&previous?.scope===scope?Array.from(new Map([...previous.data.items,...response.items].map(p=>[p.id,p])).values()):response.items}}})
  setBusy(false)
 },[user,current,scope])
 useEffect(()=>{
  void load()
  if(!user)return
  const refresh=()=>{if(!document.hidden)void load()}
  const client=getSupabaseClient(),channel=client.channel('workspace-navigation:'+user)
  for(const table of ['project_members','project_recruitment_roles'])channel.on('postgres_changes',{event:'*',schema:'public',table,filter:'user_id=eq.'+user},refresh)
  channel.on('postgres_changes',{event:'*',schema:'public',table:'activity_updates'},refresh)
  channel.subscribe();window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);const timer=window.setInterval(refresh,60_000)
  return()=>{controller.current?.abort();void client.removeChannel(channel);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);window.clearInterval(timer)}
 },[user,load])
 const data=state?.scope===scope?state.data:undefined
 return {data,busy,error,refresh:load,more:()=>load((state?.offset??0)+25)}
}
