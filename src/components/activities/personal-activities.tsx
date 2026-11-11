'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {useSupabaseSession} from '@/hooks/use-supabase-session'
import {getSupabaseClient} from '@/lib/supabase/client'
import {activityDate,activityRpc,kinds,overdue,priorities} from '@/lib/activities'
import type {ActivityCenter} from '@/lib/activity-details'
import {ActivityDetailsDialog} from './activity-details-dialog'
import {useActivityLink} from './activity-link'

const card='min-w-0 space-y-4 rounded-2xl border border-card-outline bg-card p-4 sm:p-5'
const selectClass='min-h-10 max-w-full rounded-xl border border-border bg-background p-2 text-sm text-foreground'
export function PersonalActivities(){
 const {user}=useSupabaseSession(),params=useSearchParams(),link=useActivityLink()
 const [filters,setFilters]=useState(()=>({search:'',project:'',status:params.get('revisoes')==='1'?'mine_review':'pending',priority:'all',deadline:'all',offset:0})),[search,setSearch]=useState(''),[collapsed,setCollapsed]=useState<Set<string>>(()=>new Set())
 const key=JSON.stringify(filters),scope=(user?.id??'')+':'+key,sequence=useRef(0)
 const [snapshot,setSnapshot]=useState<{scope:string;data:ActivityCenter}>(),[error,setError]=useState(''),[busy,setBusy]=useState(true)
 const data=snapshot?.scope===scope?snapshot.data:undefined
 const load=useCallback(async()=>{if(!user)return;const request=++sequence.current;setBusy(true);try{const data=await activityRpc<ActivityCenter>('get_my_activity_center',{p_options:JSON.parse(key)});if(sequence.current===request){setSnapshot({scope,data});setError('')}}catch{if(sequence.current===request){setSnapshot(undefined);setError('Não foi possível carregar suas atividades.')}}finally{if(sequence.current===request)setBusy(false)}},[user,key,scope])
 useEffect(()=>{const timer=window.setTimeout(()=>setFilters(previous=>({...previous,search:search.trim(),offset:0})),300);return()=>window.clearTimeout(timer)},[search])
 const invalidate=useCallback(()=>{sequence.current++},[])
 useEffect(()=>{void load();return invalidate},[load,invalidate])
 useEffect(()=>{if(!user)return;let timer:number|undefined;const refresh=()=>{if(!document.hidden){window.clearTimeout(timer);timer=window.setTimeout(()=>void load(),350)}};const client=getSupabaseClient(),channel=client.channel('personal-activities:'+user.id)
  channel.on('postgres_changes',{event:'*',schema:'public',table:'activity_updates'},refresh).subscribe();const fallback=window.setInterval(refresh,60_000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
  return()=>{window.clearTimeout(timer);window.clearInterval(fallback);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);void client.removeChannel(channel)}
 },[user,load])
 const update=(patch:Partial<typeof filters>)=>setFilters(previous=>({...previous,...patch,offset:0}))
 const now=data?Date.parse(data.as_of):Date.now()
 return <div className="min-w-0 space-y-6"><header className="space-y-2"><h1 className="text-2xl font-bold sm:text-3xl">Minhas atividades</h1><p className="text-sm text-muted-foreground">Suas tarefas e revisões dos períodos ativos, reunidas por projeto.</p></header>
  <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{([{key:'pending',label:'Pendentes',status:'pending'},{key:'doing',label:'Em andamento',status:'doing'},{key:'late',label:'Atrasadas',deadline:'late'},{key:'reviews',label:'Aguardando minha revisão',status:'mine_review'}] as const).map(item=><button type="button" key={item.key} className={card+' text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary'} onClick={()=>update('deadline' in item?{status:'pending',deadline:item.deadline}:{status:item.status,deadline:'all'})}><span className="text-xs text-muted-foreground">{item.label}</span><strong className="block text-2xl">{data?.counts[item.key]??'—'}</strong></button>)}</div>
  <section aria-label="Filtrar atividades" className={card}><div className="workspace-filters">
   <label>Buscar atividades<Input aria-label="Buscar minhas atividades" placeholder="Buscar pelo título" maxLength={160} className="sm:max-w-xs" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <label>Projeto das atividades<select aria-label="Projeto das atividades" className={selectClass} value={filters.project} onChange={e=>update({project:e.target.value})}><option value="">Todos os projetos</option>{data?.projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
   <label>Status das atividades<select aria-label="Status das atividades" className={selectClass} value={filters.status} onChange={e=>update({status:e.target.value})}><option value="pending">Pendentes</option>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}<option value="mine_review">Aguardando minha revisão</option><option value="all">Todas</option></select></label>
   <label>Prioridade das atividades<select aria-label="Prioridade das atividades" className={selectClass} value={filters.priority} onChange={e=>update({priority:e.target.value})}><option value="all">Todas as prioridades</option>{Object.entries(priorities).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Prazo das atividades<select aria-label="Prazo das atividades" className={selectClass} value={filters.deadline} onChange={e=>update({deadline:e.target.value})}><option value="all">Todos os prazos</option><option value="late">Atrasadas</option><option value="soon">Próximos 3 dias</option></select></label>
  </div><p className="text-xs text-muted-foreground">Ordenação: atrasos, prazos próximos e prioridade. Cada atividade aparece uma única vez.</p></section>
  {busy&&<p role="status" className="text-sm text-muted-foreground">Carregando atividades…</p>}{error&&<div role="alert" className={card}><p>{error}</p><Button variant="outline" onClick={()=>void load()}>Tentar novamente</Button></div>}
  {data&&<><div className="space-y-4">{data.groups.filter(g=>data.items.some(t=>t.project_id===g.id)).map(group=><section key={group.id} className={card}><button type="button" aria-expanded={!collapsed.has(group.id)} aria-controls={'project-tasks-'+group.id} className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 text-left" onClick={()=>setCollapsed(previous=>{const next=new Set(previous);if(next.has(group.id))next.delete(group.id);else next.add(group.id);return next})}><span className="min-w-0 break-words font-semibold">{group.title}</span><span className="text-xs text-muted-foreground">{group.total} atividades · {group.pending} pendentes{group.late?' · '+group.late+' atrasadas':''} · {collapsed.has(group.id)?'Expandir':'Recolher'}</span></button>{!collapsed.has(group.id)&&<ul id={'project-tasks-'+group.id} className="space-y-2">{data.items.filter(t=>t.project_id===group.id).map(task=><li key={task.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-3"><div className="min-w-0 flex-1 basis-48"><button type="button" className="break-words text-left text-sm font-semibold text-primary hover:underline" onClick={()=>link.open(task.project_id,task.id)}>{task.title}</button><p className="mt-1 text-xs text-muted-foreground">{task.stage_name} · Prioridade {priorities[task.priority].toLocaleLowerCase('pt-BR')} · {task.period_name}</p><p className={'mt-1 text-xs '+(overdue(task.due_at,task.kind==='done',now)?'text-destructive':'text-muted-foreground')}>{overdue(task.due_at,task.kind==='done',now)?'Atrasada · ':''}{activityDate(task.due_at)}{task.checklist_total?' · Checklist '+task.checklist_done+'/'+task.checklist_total:''}</p>{task.reviewable&&<p className="mt-1 text-xs font-medium text-primary">Aguardando sua revisão</p>}</div><Button variant="outline" size="sm" onClick={()=>link.open(task.project_id,task.id)}>{task.reviewable?'Revisar entrega':'Abrir atividade'}</Button></li>)}</ul>}</section>)}</div>
  {!data.items.length&&<p className="text-sm text-muted-foreground">Nenhuma atividade neste filtro.</p>}
  {(data.total>25||filters.offset>0)&&<nav aria-label="Paginação de atividades" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{data.total?Math.min(filters.offset+1,data.total):0}–{Math.min(filters.offset+25,data.total)} de {data.total}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy||filters.offset===0} onClick={()=>setFilters(v=>({...v,offset:Math.max(0,v.offset-25)}))}>Anterior</Button><Button variant="outline" size="sm" disabled={busy||filters.offset+25>=data.total} onClick={()=>setFilters(v=>({...v,offset:v.offset+25}))}>Próxima</Button></div></nav>}</>}
  {link.selection&&user&&<ActivityDetailsDialog key={link.key} taskId={link.selection.task} projectId={link.selection.project} slug={link.selection.slug} userId={user.id} close={link.close} onChanged={()=>void load()}/>}
 </div>
}
