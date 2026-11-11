'use client'

import Link from 'next/link'
import { RecommendedBadge } from './recommended-badge'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { FriendshipControls } from '@/components/profile/friendships'
import { useFriendships } from '@/components/profile/friendships-provider'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { useRecommendationRefresh } from '@/hooks/use-recommendation-refresh'
import { loadRecommendations } from '@/lib/graph/actions'

export function Recommendations({ kind, project }: { kind:'collaborators'|'friends'; project?:string }) {
  const { user } = useSupabaseSession()
  const uid = user?.id
  const { rows } = useFriendships()
  const [vacancy, setVacancy] = useState(''), [expanded, setExpanded] = useState(false)
  const scope = uid+':'+kind+':'+project
  const request = useCallback((token: string) => loadRecommendations(token,kind,project,vacancy||undefined),[kind,project,vacancy])
  const {data,busy,error,revoked,refresh,invalidate} = useRecommendationRefresh(uid,scope+':'+vacancy,request)
  useEffect(() => { if (data && vacancy && !data.vacancies?.some(v=>v.id===vacancy)) setVacancy('') },[data,vacancy])
  const signature = rows?.map(row=>row.user_id+':'+row.relationship).sort().join(',')
  const last = useRef<{scope:string; signature:string} | undefined>(undefined)
  useEffect(() => {
    if (kind !== 'friends' || signature === undefined) return
    if (last.current?.scope === scope && last.current.signature !== signature) invalidate()
    last.current = {scope,signature}
  },[kind,signature,invalidate,scope])
  if (!uid || revoked) return null
  const title = kind === 'friends' ? 'Pessoas que você pode conhecer' : 'Pessoas recomendadas'
  const exclusions = new Set(kind === 'friends' ? rows?.map(row=>row.user_id) : [])
  const items = data?.items.filter(item=>!exclusions.has(item.userId)) ?? []
  const options = data?.vacancies ?? []
  return <section aria-label={title} className="min-w-0 space-y-3 rounded-2xl border border-card-outline bg-card p-4">
    <h2 className="font-semibold">{title}</h2>
    {kind==='collaborators' && options.length>0 && <label className="block max-w-sm space-y-2 text-sm"><span className="block">Pessoas para a vaga</span><select value={vacancy} className="min-h-11 w-full rounded-lg border bg-background p-2" onChange={event=>{setVacancy(event.target.value);setExpanded(false)}}><option value="">Todas as vagas abertas</option>{options.map(v=><option key={v.id} value={v.id}>{v.title}</option>)}</select></label>}
    {busy && !data && <p role="status" className="text-sm text-muted-foreground">Carregando sugestões…</p>}
    {error && <div className="flex flex-wrap items-center gap-2 text-sm"><p role="status">{error}</p><Button size="sm" variant="ghost" onClick={refresh}>Tentar novamente</Button></div>}
    {data && !items.length && <p className="text-sm text-muted-foreground">{kind==='friends'?'Nenhuma sugestão no momento.':'Nenhuma pessoa recomendada para estas vagas no momento.'}</p>}
    <ul className="divide-y divide-border">{items.slice(0,expanded?12:4).map(item=><li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
      <UserAvatar name={item.name} imageUrl={item.avatar??undefined} sizeClassName="size-10 shrink-0"/>
      <div className="min-w-0 flex-1 basis-40"><div className="flex flex-wrap items-center gap-2"><p className="break-words text-sm font-semibold">{item.name}</p><RecommendedBadge/></div>
        {item.vacancyTitle&&<p className="text-xs text-muted-foreground">{item.vacancyTitle}</p>}
        {item.reasons.length>0&&<details className="mt-1 text-xs text-muted-foreground"><summary className="cursor-pointer">Por que foi recomendado?</summary><p className="mt-1">{item.reasons.join(' · ')}</p></details>}
      </div>
      <div className="flex flex-wrap items-center gap-2"><Button asChild size="sm" variant="outline"><Link href={'/usuarios/'+item.userId}>Ver perfil</Link></Button>{kind==='friends'&&<FriendshipControls userId={item.userId} relationship="none"/>}</div>
    </li>)}</ul>
    {items.length>4&&<Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Mostrar menos':'Ver mais sugestões'}</Button>}
  </section>
}
