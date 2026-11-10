'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {ActivityDetailsDialog} from '@/components/activities/activity-details-dialog'
import {useActivityLink} from '@/components/activities/activity-link'
import { Download } from 'lucide-react'
import { ActivityExport } from './workspace-export'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { activityDate, activityRpc, dashboardGoals, dueSoon, filterTasks, goalProgress, goalsByDeadline, kinds, overdue, priorities, taskKind, type Goal, type Task, type Workspace } from '@/lib/activities'
import { PeriodManager, PeriodTransfer } from './workspace-periods'
import { ActivityEditor, GoalEditor, StageEditor, Dialog } from './workspace-editors'

export function ActivitiesClient({ slug }: { slug: string }) {
  const { user, loading } = useSupabaseSession()
  if (loading) return <p role="status" className="p-6">Carregando…</p>
  if (!user) return <div className="space-y-3 p-6"><p>Entre na sua conta para acessar as atividades.</p><Link href="/login" className="text-primary underline">Entrar</Link></div>
  return <ActivityWorkspace key={user.id} userId={user.id} slug={slug} />
}

function ActivityWorkspace({ userId, slug }: { userId: string; slug: string }) {
  const activityLink=useActivityLink()
  const [mobileStage,setMobileStage]=useState('')
  const [exportOpen,setExportOpen]=useState(false)
  const [periodId,setPeriodId]=useState('')
  const [historyEditing,setHistoryEditing]=useState(false)
  const [periodsOpen,setPeriodsOpen]=useState(false)
  const [transfer,setTransfer]=useState<{task?:string;goal?:string}|null>(null)
  const [data, setData] = useState<Workspace>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [mineFilter,setMineFilter]=useState('pending')
  const [assignee,setAssignee]=useState('all')
  const [stageFilter,setStageFilter]=useState('all')
  const [lateOnly,setLateOnly]=useState(false)
  const [allGoalsOpen,setAllGoalsOpen]=useState(false)
  const [filter, setFilter] = useState('all')
  const [priority, setPriority] = useState('all')
  const [deadline, setDeadline] = useState('')
  const [search, setSearch] = useState('')
  const [task, setTask] = useState<string | 'new' | null>(null)
  const [goal, setGoal] = useState<string | 'new' | null>(null)
  const [stagesOpen, setStagesOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const sequence = useRef(0)
  const navigationApplied = useRef<string | null>(null)
  const navigationKey = useSearchParams().toString()
  const projectId = data?.project.id
  const load = useCallback(async () => {
    const seq = ++sequence.current
    try {
      const next = await activityRpc<Workspace>('get_activity_workspace', { p_slug: slug })
      if (sequence.current !== seq) return
      setData(next); setError(''); setRevision((value) => value + 1)
    } catch (err) {
      if (sequence.current !== seq) return
      setData(undefined)
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as atividades.')
    }
  }, [slug])
  useEffect(() => { void load(); return () => { sequence.current += 1 } }, [load])
  useEffect(() => {
    if (!data || navigationApplied.current === navigationKey) return
    navigationApplied.current = navigationKey
    const query = new URLSearchParams(navigationKey)
    setTask(null);setGoal(null)
    const requested = query.get('periodo')
    const linkedTask=data.tasks.find(item=>item.id===query.get('atividade'))
    const linkedGoal=data.goals.find(item=>item.id===query.get('meta'))
    setPeriodId((linkedTask??linkedGoal)?.period_id ?? data.periods.find(p=>p.id===requested)?.id ?? data.periods.find(p=>p.is_active)?.id ?? '')
    const kind = query.get('estado')
    if (kind && Object.hasOwn(kinds,kind)) {  setFilter(kind) }
    const taskId = query.get('atividade')
    const goalId = query.get('meta')
    if (taskId && data.tasks.some(item=>item.id===taskId)) { setTask(taskId) }
    else if (goalId && data.goals.some(item=>item.id===goalId)) { setGoal(goalId) }
    else if (taskId || goalId) setError('Este item não está mais disponível no projeto.')
  }, [data,navigationKey])
  useEffect(() => {
    if (!projectId) return
    let scheduled: number | undefined
    const refresh = () => { window.clearTimeout(scheduled); scheduled = window.setTimeout(() => void load(), 120) }
    const client = getSupabaseClient()
    const channel = client.channel('activities:' + projectId + ':' + crypto.randomUUID())
    for (const event of ['INSERT', 'UPDATE'] as const) channel.on('postgres_changes',
      { event, schema: 'public', table: 'activity_updates', filter: 'project_id=eq.' + projectId }, refresh)
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') refresh() })
    const visible = () => { if (!document.hidden) refresh() }
    const timer = window.setInterval(visible, 60_000)
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(timer); window.clearTimeout(scheduled); document.removeEventListener('visibilitychange', visible); void client.removeChannel(channel) }
  }, [load, projectId])

  async function mutate(action: string, input: Record<string, unknown>) {
    if (!projectId) throw new Error('Projeto indisponível')
    setBusy(true)
    try {
      const result = await activityRpc<string>(['save_period','activate_period'].includes(action)?'save_project_period':'mutate_activity', { p_project: projectId, p_action: action, p_data: {...input,period_id:input.period_id??periodId,historical_edit:historyEditing} })
      await load()
      return result
    } catch (err) { await load(); throw err }
    finally { setBusy(false) }
  }

  if (!data) return <div className="space-y-3 p-6"><Link href={'/projetos/' + slug + '/painel'} className="text-primary underline">Voltar ao painel</Link>
    <p role={error ? 'alert' : 'status'}>{error || 'Carregando atividades…'}</p>{error && <Button onClick={() => void load()}>Tentar novamente</Button>}</div>
  const { stages, members } = data
  const manager=data.manager&&!data.projectReadOnly
  const period=data.periods.find(p=>p.id===periodId)??data.periods.find(p=>p.is_active)
  const historical=Boolean(period&&!period.is_active)
  const readOnly=data.projectReadOnly||historical&&(!manager||!historyEditing)
  const tasks=data.tasks.filter(t=>t.period_id===period?.id)
  const goals=data.goals.filter(g=>g.period_id===period?.id)
  const scoped={...data,tasks,goals,selectedPeriod:period?.id,readOnly}
  function selectPeriod(id:string){
    setPeriodId(id);setHistoryEditing(false);setTask(null);setGoal(null);setAllGoalsOpen(false)
    const url=new URL(window.location.href);url.searchParams.set('periodo',id);url.searchParams.delete('atividade');url.searchParams.delete('meta')
    window.history.replaceState(null,'',url)
  }
  const done = (item: Task) => taskKind(item, stages) === 'done'
  const percent = tasks.length ? Math.round(tasks.filter(done).length / tasks.length * 100) : 0
  const selected = tasks.find((item) => item.id === task)
  function openTask(id:string){activityLink.open(data!.project.id,id)}
  function closeTask(){if(task==='new')setTask(null);else activityLink.close()}
  const selectedGoal = goals.find((item) => item.id === goal)
  const filters={assignee,stageFilter,lateOnly,filter,priority,deadline,search}
  const focusedStage=stages.find(stage=>stage.id===mobileStage)??stages[0]
  const filtered=filterTasks(tasks,stages,filters)
  const summaries = [
    { label: 'Total de atividades', value: tasks.length, filter: 'all' },
    { label: 'Concluídas', value: tasks.filter(done).length, filter: 'done' },
    { label: 'Atrasadas', value: tasks.filter((item) => overdue(item.due_at, done(item))).length, filter: 'late' },
    { label: 'Em revisão', value: tasks.filter((item) => taskKind(item, stages) === 'review').length, filter: 'review' },
  ]
  const goalCards = (list: Goal[]) => <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((item) => {
    const progress = goalProgress(item, tasks, stages)
    return <button key={item.id} type="button" onClick={() => setGoal(item.id)} className="space-y-2 rounded-2xl border border-card-outline bg-card p-4 text-left hover:border-primary">
      <h3 className="break-words font-semibold">{item.title}</h3><p className="text-xs text-muted-foreground">{activityDate(item.due_at)}</p>
      <p className="text-sm">{progress.percent === 100 ? 'Concluída' : overdue(item.due_at, false) ? 'Atrasada' : progress.actual === 0 ? 'Pendente' : 'Em andamento'} · {progress.percent}%</p>
      <progress aria-label={'Progresso de ' + item.title} max={100} value={progress.percent} className="h-2 w-full accent-primary" />
      <p className="text-xs">{progress.actual}/{progress.total} {item.kind === 'numeric' ? item.unit : 'atividades'}</p>
      <p className="text-xs text-muted-foreground">{item.owners.map((id) => members.find((person) => person.id === id)?.name || 'Integrante indisponível').join(', ') || 'Sem responsáveis'}</p>
    </button>
  })}</div>

  const taskCard = (item: Task) => {
    const checks = data.checklist.filter((entry) => entry.task_id === item.id)
    const mine = item.assignees.includes(userId)
    return <article key={item.id} draggable={!readOnly&&(manager || mine)} onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}
      className={'space-y-2 rounded-xl border bg-card p-3 ' + (overdue(item.due_at, done(item)) ? 'border-destructive/60' : 'border-card-outline')}>
      <button type="button" onClick={() => openTask(item.id)} className="block w-full break-words text-left text-sm font-semibold hover:text-primary">{item.title}</button>
      <p className={'text-xs ' + (item.priority === 'urgent' ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{priorities[item.priority]} · {activityDate(item.due_at)}</p>
      {overdue(item.due_at, done(item)) && <p className="text-xs text-destructive">Atrasada</p>}
      {dueSoon(item.due_at, done(item)) && <p className="text-xs font-medium text-primary">Vence em até 3 dias</p>}
      <div className="flex flex-wrap gap-1">{item.assignees.map((id) => {
        const person = members.find((entry) => entry.id === id)
        return <span key={id} title={person?.name || 'Integrante indisponível'}><UserAvatar name={person?.name || 'Integrante'} imageUrl={person?.avatar ?? undefined} sizeClassName="size-7" /></span>
      })}</div>
      {checks.length > 0 && <p className="text-xs text-muted-foreground">Checklist {checks.filter((entry) => entry.done).length}/{checks.length}</p>}
      {item.goal_id && <p className="truncate text-xs text-primary">{goals.find((entry) => entry.id === item.goal_id)?.title}</p>}
      <label className="block text-xs text-muted-foreground">Etapa
        <select aria-label={'Etapa de ' + item.title} value={item.stage_id} disabled={busy || readOnly || (!manager && !mine)}
          className="mt-1 w-full rounded-lg border border-border bg-background p-1.5 text-foreground"
          onChange={(event) => void mutate('move', { id: item.id, version: item.version, stage_id: event.target.value }).catch((err: Error) => setError(err.message))}>
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select>
      </label>
    </article>
  }
  return <div className="min-w-0 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><Link href={'/projetos/' + slug + '/painel'} className="text-sm text-primary hover:underline">Voltar ao painel</Link>
        <p className="mt-2 text-sm text-muted-foreground">{data.project.title}</p><h1 className="text-2xl font-bold">Controle de Atividades</h1></div>
      {manager && <div className="flex flex-wrap gap-2"><Button disabled={readOnly} onClick={() => setTask('new')}>Nova atividade</Button>
        <Button disabled={readOnly} variant="outline" onClick={() => setGoal('new')}>Nova meta</Button><Button variant="outline" onClick={() => setStagesOpen(true)}>Gerenciar etapas</Button><Button variant="outline" onClick={()=>setPeriodsOpen(true)}>Gerenciar períodos</Button><Button variant="outline" onClick={()=>setTransfer({})}>Organizar atividades por período</Button></div>}
    </header>

    {data.projectReadOnly&&<p className="text-sm font-medium text-primary">Projeto finalizado — somente leitura</p>}
    <section className="space-y-2 rounded-2xl border border-border bg-card p-3" aria-label="Períodos do projeto">
      <label className="block text-sm font-medium">Período<select aria-label="Período do projeto" className="mt-1 w-full rounded-xl border bg-background p-2 sm:max-w-xl" value={period?.id??''} onChange={e=>selectPeriod(e.target.value)}>{data.periods.map(p=><option key={p.id} value={p.id}>{p.name}{p.is_active?' · Ativo':' · Histórico'}</option>)}</select></label>
      {historical&&<div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">Período histórico · {historyEditing?'Edição administrativa habilitada.':'Somente consulta.'}</p>{manager&&<Button size="sm" variant="outline" onClick={()=>setHistoryEditing(v=>!v)}>{historyEditing?'Voltar à consulta':'Habilitar edição deste histórico'}</Button>}</div>}
    </section>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <section aria-label="Dashboard do projeto" className="grid gap-4 rounded-2xl border border-card-outline bg-card p-4 xl:grid-cols-2">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{summaries.map(entry=><button type="button" key={entry.label} onClick={()=>{setFilter(entry.filter);setStageFilter('all');setLateOnly(false);document.getElementById('team-kanban')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})}} className="rounded-xl border border-border p-3 text-left hover:border-primary"><p className="text-xs text-muted-foreground">{entry.label}</p><p className="text-xl font-bold">{entry.value}</p></button>)}</div>
        <h2 className="text-sm font-semibold">Progresso geral do projeto — {percent}%</h2>
        <progress aria-label="Progresso geral do projeto" value={percent} max={100} className="h-2 w-full accent-primary" />
        <p className="text-xs text-muted-foreground">{tasks.filter(done).length} de {tasks.length} atividades concluídas · {tasks.filter(item=>!done(item)).length} pendentes{!tasks.length?' · Crie sua primeira atividade.':''}</p>
      </div>
      <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Metas</h2><Button size="sm" variant="outline" onClick={()=>setAllGoalsOpen(true)}>Ver todas as metas</Button></div>
        <p className="text-xs text-muted-foreground">{goals.filter(g=>goalProgress(g,tasks,stages).percent===100).length} concluídas · {goals.filter(g=>{const p=goalProgress(g,tasks,stages);return p.actual>0&&p.percent<100}).length} em andamento · {goals.filter(g=>goalProgress(g,tasks,stages).actual===0).length} pendentes · {goals.filter(g=>overdue(g.due_at,goalProgress(g,tasks,stages).percent===100)).length} atrasadas</p>
        <div className="grid gap-2 sm:grid-cols-3">{dashboardGoals(goals,tasks,stages).slice(0,3).map(g=><button key={g.id} type="button" onClick={()=>setGoal(g.id)} className="block w-full space-y-1 rounded-lg border border-border p-2 text-left hover:border-primary"><span className="flex justify-between gap-2 text-xs"><strong className="min-w-0 break-words">{g.title}</strong><span>{goalProgress(g,tasks,stages).percent}%</span></span><progress aria-label={'Progresso de '+g.title} value={goalProgress(g,tasks,stages).percent} max={100} className="h-1.5 w-full accent-primary" />{g.due_at&&<span className="block text-xs text-muted-foreground">{activityDate(g.due_at)}</span>}</button>)}</div>
        {!goals.length&&<p className="text-xs text-muted-foreground">Nenhuma meta cadastrada.</p>}
      </div>
    </section>
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <section id="team-kanban" aria-label="Kanban da equipe" className="@container/kanban min-w-0 scroll-mt-24 space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Kanban da equipe</h2><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setExportOpen(true)}><Download aria-hidden className="size-4" />Baixar PDF</Button><Button size="sm" variant="ghost" onClick={()=>{setFilter('all');setPriority('all');setDeadline('');setSearch('');setAssignee('all');setStageFilter('all');setLateOnly(false)}}>Limpar filtros</Button></div></header>
        <div className="workspace-filters text-xs">
          <label>Buscar atividades<Input aria-label="Buscar atividades" placeholder="Buscar título" value={search} onChange={e=>setSearch(e.target.value)} /></label>
          <label>Responsável<select className="ml-1 rounded-lg border bg-background p-2" value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="all">Todos</option>{members.map(person=><option key={person.id} value={person.id}>{person.name||'Integrante'}</option>)}</select></label>
          <label>Status<select className="ml-1 rounded-lg border bg-background p-2" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos</option><option value="pending">Pendentes</option><option value="late">Atrasadas</option>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Etapa<select className="ml-1 rounded-lg border bg-background p-2" value={stageFilter} onChange={e=>setStageFilter(e.target.value)}><option value="all">Todas</option>{stages.map(stage=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
          <label>Prioridade<select className="ml-1 rounded-lg border bg-background p-2" value={priority} onChange={e=>setPriority(e.target.value)}><option value="all">Todas</option>{Object.entries(priorities).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          <label>Prazo até<Input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)} /></label>
          <label className="!flex-row items-center gap-2 py-2"><input className="!min-h-4 !w-4" type="checkbox" checked={lateOnly} onChange={e=>setLateOnly(e.target.checked)} />Somente atrasadas</label>
        </div>
        <label className="block space-y-2 text-sm @min-[32rem]/kanban:hidden">Etapa em foco<select aria-label="Etapa em foco no Kanban" className="min-h-11 w-full rounded-lg border bg-background p-2" value={focusedStage?.id??''} onChange={event=>setMobileStage(event.target.value)}>{stages.map(stage=><option key={stage.id} value={stage.id}>{stage.name} · {filtered.filter(task=>task.stage_id===stage.id).length}</option>)}</select><span className="block text-xs text-muted-foreground">Escolha uma etapa para ver suas atividades. Use o menu de cada card para mover entre etapas.</span></label>
        <div className="grid min-w-0 items-start grid-cols-1 gap-3 pb-3 @min-[32rem]/kanban:grid-cols-2 @min-[54rem]/kanban:grid-cols-4" aria-label="Quadro Kanban">{stages.map(stage=><section key={stage.id} aria-label={stage.name} className={(stage.id===focusedStage?.id?"flex ":"hidden @min-[32rem]/kanban:flex ")+"min-w-0 flex-col rounded-2xl border border-border bg-muted/30 @min-[54rem]/kanban:max-h-[72dvh]"} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const moved=tasks.find(item=>item.id===e.dataTransfer.getData('text/plain'));if(moved&&!readOnly)void mutate('move',{id:moved.id,version:moved.version,stage_id:stage.id}).catch((err:Error)=>setError(err.message))}}>
          <h3 className="shrink-0 break-words p-3 font-semibold">{stage.name} · {filtered.filter(item=>item.stage_id===stage.id).length}</h3><div tabIndex={0} role="region" aria-label={"Atividades em "+stage.name} className="min-h-0 space-y-3 p-3 pt-0 @min-[54rem]/kanban:overflow-y-auto">{filtered.filter(item=>item.stage_id===stage.id).map(taskCard)}{!filtered.some(item=>item.stage_id===stage.id)&&<p className="text-xs text-muted-foreground">Nenhuma atividade nesta etapa.</p>}</div>
        </section>)}</div>{!filtered.length&&<p className="text-sm text-muted-foreground">Nenhuma atividade neste filtro.</p>}
      </section>
      <aside aria-label="Minhas atividades" className="min-w-0 rounded-2xl border border-border bg-card p-3"><details open className="space-y-3"><summary className="cursor-pointer text-lg font-semibold">Minhas atividades</summary>
        <label className="block text-xs">Exibir<select className="ml-2 rounded-lg border bg-background p-2" value={mineFilter} onChange={e=>setMineFilter(e.target.value)}>{[['pending','Pendentes'],['doing','Em andamento'],['review','Em revisão'],['done','Concluídas'],['all','Todas']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <div className="space-y-3 xl:max-h-[65dvh] xl:overflow-y-auto">{tasks.filter(item=>item.assignees.includes(userId)&&(mineFilter==='all'||mineFilter==='pending'&&!done(item)||taskKind(item,stages)===mineFilter)).sort((a,b)=>{
          const rank=(item:Task)=>done(item)?6:overdue(item.due_at,false)?0:dueSoon(item.due_at,false)?1:taskKind(item,stages)==='review'?2:taskKind(item,stages)==='doing'?3:4
          return rank(a)-rank(b)||Date.parse(a.due_at??'9999-01-01')-Date.parse(b.due_at??'9999-01-01')||a.title.localeCompare(b.title)
        }).map(taskCard)}</div>
        {!tasks.some(item=>item.assignees.includes(userId)&&(mineFilter==='all'||mineFilter==='pending'&&!done(item)||taskKind(item,stages)===mineFilter))&&<p className="text-sm text-muted-foreground">Nenhuma atividade atribuída neste filtro.</p>}
      </details></aside>
    </div>
    {exportOpen&&<ActivityExport data={scoped} filters={filters} close={()=>setExportOpen(false)} />}
    {allGoalsOpen&&<Dialog title="Todas as metas" busy={busy} close={()=>setAllGoalsOpen(false)}>{manager&&!readOnly&&<Button onClick={()=>setGoal('new')}>Nova meta</Button>}{goalCards([...goals].sort(goalsByDeadline))}{!goals.length&&<p className="text-sm text-muted-foreground">Nenhuma meta cadastrada.</p>}</Dialog>}
    {task==='new'&&<ActivityEditor data={scoped} busy={busy} mutate={mutate} close={closeTask}/>}
    {task&&task!=='new'&&<ActivityDetailsDialog key={task} taskId={task} projectId={data.project.id} slug={slug} userId={userId} historicalEdit={historyEditing} close={closeTask} onChanged={()=>void load()} requestTransfer={()=>{const url=new URL(window.location.href);url.searchParams.delete('atividade');url.searchParams.delete('projeto');window.history.replaceState(null,'',url);setTask(null);setTransfer({task:selected?.id})}}/>}
    {goal && (goal === 'new' || selectedGoal) && <GoalEditor key={goal} data={scoped} requestTransfer={()=>setTransfer({goal:selectedGoal?.id})} goal={selectedGoal} revision={revision} busy={busy} mutate={mutate} close={() => setGoal(null)} openTask={(id) => {setGoal(null);openTask(id)}} />}
    {periodsOpen&&<PeriodManager data={data} busy={busy} mutate={mutate} close={()=>setPeriodsOpen(false)} />}
    {transfer&&<PeriodTransfer data={data} source={period?.id??''} initial={transfer} busy={busy} mutate={mutate} close={()=>setTransfer(null)} completed={()=>{setTransfer(null);setTask(null);setGoal(null)}} />}
    {stagesOpen && <StageEditor data={data} busy={busy} mutate={mutate} close={() => setStagesOpen(false)} />}
  </div>
}
