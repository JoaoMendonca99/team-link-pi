'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {getSupabaseClient} from '@/lib/supabase/client'
import type {AcademicSpace} from '@/lib/projects/academics'

export function useProjectAcademics(projectId:string) {
 const [result,setResult]=useState<{id:string;value:AcademicSpace}>(),[error,setError]=useState('')
 const sequence=useRef(0)
 const reload=useCallback(async()=>{const request=++sequence.current;try{const {data,error}=await getSupabaseClient().rpc('get_project_academics',{p_project:projectId});if(error)throw error;if(request!==sequence.current)return;setResult({id:projectId,value:data as AcademicSpace});setError('')}catch{if(request===sequence.current)setError('Não foi possível consultar os dados acadêmicos. Você pode continuar preenchendo manualmente.')}},[projectId])
 useEffect(()=>{let alive=true;const client=getSupabaseClient();const refresh=()=>{if(alive)void reload()};refresh();window.addEventListener('focus',refresh);const visible=()=>{if(!document.hidden)refresh()};document.addEventListener('visibilitychange',visible);const channel=client.channel('academic:'+projectId+':'+crypto.randomUUID());for(const event of ['INSERT','UPDATE'] as const)channel.on('postgres_changes',{event,schema:'public',table:'activity_updates',filter:'project_id=eq.'+projectId},refresh);channel.subscribe();return()=>{alive=false;window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);void client.removeChannel(channel)}},[projectId,reload])
 return {data:result?.id===projectId?result.value:undefined,error,reload}
}
