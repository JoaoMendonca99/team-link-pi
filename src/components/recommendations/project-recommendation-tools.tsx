'use client'

import { useCallback, useState } from 'react'
import { useRecommendationRefresh } from '@/hooks/use-recommendation-refresh'
import { getSupabaseClient } from '@/lib/supabase/client'
import { GraphDemo } from './graph-demo'

export function ProjectRecommendationTools({ project,userId }: {project:string;userId:string}) {
  const [open,setOpen] = useState(false)
  const verify = useCallback(async () => {
    const {data,error} = await getSupabaseClient().rpc('is_project_join_manager',{p_project_id:project})
    if (error) return {ok:false as const,revoked:false,message:'Não foi possível verificar o acesso.'}
    return data===true ? {ok:true as const,data:true,retainOnError:false}
      : {ok:false as const,revoked:true,message:'Acesso restrito a Líderes e Gestores.'}
  },[project])
  const {data,busy,error,revoked,refresh} = useRecommendationRefresh(open?userId:undefined,userId+':analysis:'+project,verify)
  return <details className="rounded-2xl border border-border bg-card p-4" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Análise técnica do projeto</summary>
    {open&&<div className="mt-4 space-y-3">
      {busy&&!data&&<p role="status" className="text-sm text-muted-foreground">Verificando acesso…</p>}
      {error&&<p role="status" className="text-sm">{error}{!revoked&&<button className="ml-2 text-link hover:underline" onClick={refresh}>Tentar novamente</button>}</p>}
      {data&&<GraphDemo project={project}/>}
    </div>}
  </details>
}
