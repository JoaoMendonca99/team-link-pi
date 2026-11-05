'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { SquareKanban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { getSupabaseClient } from '@/lib/supabase/client'
import { kinds, type Kind } from '@/lib/activities'

type Member = { id: string; name: string | null; avatar: string | null; role: string | null; level: string; last_active_at: string | null }
type Summary = { period?: {id:string;name:string}; states: Record<Kind,number>; goals: { done: number; doing: number; pending: number; late: number }; members: Member[]; as_of: string }
const levels: Record<string,string> = { owner:'Líder', manager:'Gestor', reviewer:'Revisor', member:'Membro' }
const order: Record<string,number> = { owner:0, manager:1, reviewer:2, member:3 }
const colors: Record<Kind,string> = { todo:'#94a3b8', doing:'#3b82f6', review:'#f59e0b', done:'#10b981' }
const statusNames = { ...kinds, done:'Concluídas' }
function online(person: Member, now: number) { return Boolean(person.last_active_at && now - Date.parse(person.last_active_at) < 120_000) }
function seen(person: Member, now: number) {
  if (!person.last_active_at) return 'Ainda não acessou o painel'
  if (online(person,now)) return 'Online no painel'
  const date = new Date(person.last_active_at)
  const minutes = Math.max(2,Math.floor((now-date.getTime())/60_000))
  if (minutes < 60) return `Visto no painel há ${minutes} min`
  return 'Visto no painel em ' + date.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})
}

export function usePanelSummary(projectId: string | undefined, userId: string | undefined, enabled: boolean) {
  const [result,setResult] = useState<{ project: string; user: string; value: Summary }>()
  const [error,setError] = useState('')
  const [now,setNow] = useState(Date.now())
  const offset=useRef(0)
  useEffect(() => {
    if (!enabled || !projectId || !userId) return
    let alive=true; let queued:number|undefined; let sequence=0
    const client=getSupabaseClient()
    const load=async()=>{
      const request=++sequence
      try {
        const {data,error:failure}=await client.rpc('get_project_panel_summary',{p_project:projectId})
        if(!alive || request!==sequence)return
        if(failure){setResult(undefined);setError('Não foi possível carregar o resumo e a equipe.');return}
        const value=data as Summary
        offset.current=Date.parse(value.as_of)-Date.now()
        setNow(Date.now()+offset.current);setResult({project:projectId,user:userId,value});setError('')
      } catch { if(alive&&request===sequence){setResult(undefined);setError('Não foi possível carregar o resumo e a equipe.')} }
    }
    const refresh=()=>{window.clearTimeout(queued);queued=window.setTimeout(()=>void load(),180)}
    const visible=()=>{if(!document.hidden)void load()}
    const channel=client.channel('panel-summary:'+projectId+':'+crypto.randomUUID())
    for(const event of ['INSERT','UPDATE'] as const)channel.on('postgres_changes',{event,schema:'public',table:'activity_updates',filter:'project_id=eq.'+projectId},refresh)
    channel.subscribe(status=>{if(status==='SUBSCRIBED')refresh()})
    const timer=window.setInterval(visible,60_000)
    const clock=window.setInterval(()=>{if(!document.hidden)setNow(Date.now()+offset.current)},15_000)
    document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible)
    void load()
    return ()=>{alive=false;sequence++;window.clearTimeout(queued);window.clearInterval(timer);window.clearInterval(clock);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);void client.removeChannel(channel)}
  },[projectId,userId,enabled])
  return { data:enabled&&result&&result.project===projectId&&result.user===userId?result.value:undefined,error,now }
}

export function ActivityOverview({ data, error, slug }: { data?: Summary; error: string; slug: string }) {
  const entries=(Object.keys(kinds) as Kind[]).map(kind=>({kind,value:Number(data?.states[kind]??0)}))
  const total=entries.reduce((sum,item)=>sum+item.value,0)
  const completed=Number(data?.states.done??0)
  const percent=total?Math.round(completed/total*100):0
  let cursor=0
  const gradient=entries.map(({kind,value})=>{const start=cursor;cursor+=total?value/total*100:0;return `${colors[kind]} ${start}% ${cursor}%`}).join(',')
  const href='/projetos/'+slug+'/painel/atividades'
  return <section aria-label="Resumo do Controle de Atividades" className="space-y-5 rounded-3xl border border-primary/30 bg-card p-4 shadow-sm sm:p-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-semibold"><SquareKanban className="size-5 text-primary" aria-hidden />Controle de Atividades</h2><Button asChild size="sm"><Link href={href}>Abrir atividades</Link></Button></header>
    {data?.period&&<p className="text-sm text-muted-foreground">Período atual: {data.period.name}</p>}
    {error?<p role="alert" className="text-sm text-destructive">{error}</p>:!data?<p role="status" className="text-sm text-muted-foreground">Carregando resumo…</p>:<div className="grid min-w-0 gap-6 sm:grid-cols-2">
      <div className="space-y-4"><div role="img" aria-label={`Atividades: ${entries.map(item=>statusNames[item.kind]+': '+item.value).join(', ')}`} className="relative mx-auto size-40 rounded-full" style={{background:total?`conic-gradient(${gradient})`:'var(--muted)'}}>
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-card"><strong className="text-3xl">{total}</strong><span className="text-xs text-muted-foreground">atividades</span></div>
      </div><ul className="space-y-1.5">{entries.map(({kind,value})=><li key={kind}><Link className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary" href={href+'?estado='+kind}><span aria-hidden className="size-2.5 rounded-full" style={{background:colors[kind]}} />{statusNames[kind]}<strong className="ml-auto">{value}</strong></Link></li>)}</ul>{!total&&<p className="text-sm text-muted-foreground">Nenhuma atividade criada ainda.</p>}</div>
      <div className="min-w-0 space-y-5"><section className="space-y-3"><h3 className="font-semibold">Metas do projeto</h3><dl className="grid grid-cols-2 gap-2">{([
        ['Concluídas',data.goals.done],['Em andamento',data.goals.doing],['Pendentes',data.goals.pending],['Atrasadas',data.goals.late],
      ] as const).map(([label,value])=><div key={label} className="rounded-xl border border-border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-xl font-semibold">{value}</dd></div>)}</dl><p className="text-xs text-muted-foreground">Atraso é uma condição adicional das metas pendentes ou em andamento.</p></section>
      <section className="space-y-2 border-t border-border pt-4"><h3 className="font-semibold">Progresso geral do projeto</h3><p className="text-3xl font-bold text-primary">{percent}%</p><progress aria-label="Progresso geral do projeto" max={100} value={percent} className="h-3 w-full accent-primary" /><p className="text-sm text-muted-foreground">{completed} de {total} atividades concluídas</p>{!total&&<p className="text-xs text-muted-foreground">Crie atividades para acompanhar o progresso.</p>}</section></div>
    </div>}
  </section>
}

export function PanelTeam({data,error,now}:{data?:Summary;error:string;now:number}) {
  const [search,setSearch]=useState('')
  const [expanded,setExpanded]=useState(false)
  const members=[...(data?.members??[])].sort((a,b)=>(order[a.level]??3)-(order[b.level]??3)||Number(online(b,now))-Number(online(a,now))||(Date.parse(b.last_active_at??'')||0)-(Date.parse(a.last_active_at??'')||0)||(a.name??'').localeCompare(b.name??'','pt-BR'))
  const filtered=members.filter(person=>(person.name??'').toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  return <aside aria-label="Equipe do projeto" className="min-w-0 self-start rounded-3xl border border-card-outline bg-card p-4">
    <header className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Equipe do projeto {data&&<span className="text-sm text-muted-foreground">({members.length})</span>}</h2><Button type="button" size="sm" variant="ghost" className="lg:hidden" aria-expanded={expanded} aria-controls="panel-team-list" onClick={()=>setExpanded(value=>!value)}>{expanded?'Recolher':'Expandir'}</Button></header>
    <p className="mt-1 text-xs text-muted-foreground">Presença nesta área do projeto, visível somente à equipe.</p>
    <div id="panel-team-list" className={(expanded?'block':'hidden')+' mt-4 space-y-3 lg:block'}>
      {error?<p role="alert" className="text-sm text-destructive">{error}</p>:!data?<p role="status" className="text-sm">Carregando equipe…</p>:<>
        {members.length>8&&<Input aria-label="Buscar integrante por nome" placeholder="Buscar integrante" value={search} onChange={event=>setSearch(event.target.value)} />}
        <ul className="max-h-[34rem] space-y-2 overflow-y-auto overscroll-contain pr-1">{filtered.map(person=><li key={person.id} className="space-y-1 rounded-xl border border-border p-3">
          <Link href={'/usuarios/'+person.id} className="flex min-w-0 items-center gap-2 hover:text-primary"><UserAvatar name={person.name??'Integrante'} imageUrl={person.avatar??undefined} sizeClassName="size-9 shrink-0" /><span className="min-w-0 break-words text-sm font-semibold">{person.name||'Integrante'}</span></Link>
          <p className="break-words text-xs text-muted-foreground">{person.role||'Sem cargo exibido'} · {levels[person.level]??'Membro'}</p>
          <p className={'flex items-start gap-1.5 text-xs '+(online(person,now)?'text-emerald-600 dark:text-emerald-400':'text-muted-foreground')}><span aria-hidden className={'mt-1 size-1.5 shrink-0 rounded-full '+(online(person,now)?'bg-emerald-500':'bg-muted-foreground/50')} />{seen(person,now)}</p>
        </li>)}</ul>{!filtered.length&&<p className="text-sm text-muted-foreground">{search?'Nenhum integrante encontrado.':'Nenhum integrante ativo.'}</p>}
      </>}
    </div>
  </aside>
}
