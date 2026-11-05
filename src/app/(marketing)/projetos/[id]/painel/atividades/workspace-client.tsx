'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { activityDate, activityRpc, goalProgress, kinds, overdue, priorities, taskKind, type Goal, type Task, type Workspace } from '@/lib/activities'
import { ActivityEditor, GoalEditor, StageEditor } from './workspace-editors'

type Tab = 'Dashboard' | 'Kanban' | 'Metas' | 'Minhas atividades'
export function ActivitiesClient({ slug }: { slug: string }) {
  const { user, loading } = useSupabaseSession()
  if (loading) return <p role="status" className="p-6">Carregando…</p>
  if (!user) return <main className="space-y-3 p-6"><p>Entre na sua conta para acessar as atividades.</p><Link href="/login" className="text-primary underline">Entrar</Link></main>
  return <ActivityWorkspace key={user.id} userId={user.id} slug={slug} />
}

function ActivityWorkspace({ userId, slug }: { userId: string; slug: string }) {
  const [data, setData] = useState<Workspace>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [filter, setFilter] = useState('all')
  const [priority, setPriority] = useState('all')
  const [deadline, setDeadline] = useState('')
  const [search, setSearch] = useState('')
  const [task, setTask] = useState<string | 'new' | null>(null)
  const [goal, setGoal] = useState<string | 'new' | null>(null)
  const [stagesOpen, setStagesOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const sequence = useRef(0)
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
      const result = await activityRpc<string>('mutate_activity', { p_project: projectId, p_action: action, p_data: input })
      await load()
      return result
    } catch (err) { await load(); throw err }
    finally { setBusy(false) }
  }

  if (!data) return <main className="space-y-3 p-6"><Link href={'/projetos/' + slug + '/painel'} className="text-primary underline">Voltar ao painel</Link>
    <p role={error ? 'alert' : 'status'}>{error || 'Carregando atividades…'}</p>{error && <Button onClick={() => void load()}>Tentar novamente</Button>}</main>
  const { tasks, goals, stages, manager, members } = data
  const done = (item: Task) => taskKind(item, stages) === 'done'
  const percent = tasks.length ? Math.round(tasks.filter(done).length / tasks.length * 100) : 0
  const selected = tasks.find((item) => item.id === task)
  const selectedGoal = goals.find((item) => item.id === goal)
  const filtered = tasks.filter((item) => (tab !== 'Minhas atividades' || item.assignees.includes(userId)) &&
    (filter === 'all' || filter === 'pending' && !done(item) || filter === 'late' && overdue(item.due_at, done(item)) || taskKind(item, stages) === filter) &&
    (priority === 'all' || item.priority === priority) && (!deadline || Boolean(item.due_at && Date.parse(item.due_at) < Date.parse(deadline + 'T23:59:59'))) &&
    item.title.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')))
  const summaries = [
    { label: 'Total de atividades', value: tasks.length, filter: 'all' },
    { label: 'Concluídas', value: tasks.filter(done).length, filter: 'done' },
    { label: 'Pendentes', value: tasks.filter((item) => !done(item)).length, filter: 'pending' },
    { label: 'Atrasadas', value: tasks.filter((item) => overdue(item.due_at, done(item))).length, filter: 'late' },
    { label: 'Aguardando revisão', value: tasks.filter((item) => taskKind(item, stages) === 'review').length, filter: 'review' },
  ]
  const goalCards = (list: Goal[]) => <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((item) => {
    const progress = goalProgress(item, tasks, stages)
    return <button key={item.id} type="button" onClick={() => setGoal(item.id)} className="space-y-2 rounded-2xl border border-card-outline bg-card p-4 text-left hover:border-primary">
      <h3 className="break-words font-semibold">{item.title}</h3><p className="text-xs text-muted-foreground">{activityDate(item.due_at)}</p>
      <p className="text-sm">{progress.percent === 100 ? 'Concluída' : overdue(item.due_at, false) ? 'Atrasada' : 'Em andamento'} · {progress.percent}%</p>
      <progress aria-label={'Progresso de ' + item.title} max={100} value={progress.percent} className="h-2 w-full accent-primary" />
      <p className="text-xs">{progress.actual}/{progress.total} {item.kind === 'numeric' ? item.unit : 'atividades'}</p>
      <p className="text-xs text-muted-foreground">{item.owners.map((id) => members.find((person) => person.id === id)?.name || 'Integrante indisponível').join(', ') || 'Sem responsáveis'}</p>
    </button>
  })}</div>

  const taskCard = (item: Task) => {
    const checks = data.checklist.filter((entry) => entry.task_id === item.id)
    const mine = item.assignees.includes(userId)
    return <article key={item.id} draggable={manager || mine} onDragStart={(event) => event.dataTransfer.setData('text/plain', item.id)}
      className={'space-y-2 rounded-xl border bg-card p-3 ' + (overdue(item.due_at, done(item)) ? 'border-destructive/60' : 'border-card-outline')}>
      <button type="button" onClick={() => setTask(item.id)} className="block w-full break-words text-left text-sm font-semibold hover:text-primary">{item.title}</button>
      <p className={'text-xs ' + (item.priority === 'urgent' ? 'font-semibold text-destructive' : 'text-muted-foreground')}>{priorities[item.priority]} · {activityDate(item.due_at)}</p>
      {overdue(item.due_at, done(item)) && <p className="text-xs text-destructive">Atrasada</p>}
      <div className="flex flex-wrap gap-1">{item.assignees.map((id) => {
        const person = members.find((entry) => entry.id === id)
        return <span key={id} title={person?.name || 'Integrante indisponível'}><UserAvatar name={person?.name || 'Integrante'} imageUrl={person?.avatar ?? undefined} sizeClassName="size-7" /></span>
      })}</div>
      {checks.length > 0 && <p className="text-xs text-muted-foreground">Checklist {checks.filter((entry) => entry.done).length}/{checks.length}</p>}
      {item.goal_id && <p className="truncate text-xs text-primary">{goals.find((entry) => entry.id === item.goal_id)?.title}</p>}
      <label className="block text-xs text-muted-foreground">Etapa
        <select aria-label={'Etapa de ' + item.title} value={item.stage_id} disabled={busy || (!manager && !mine)}
          className="mt-1 w-full rounded-lg border border-border bg-background p-1.5 text-foreground"
          onChange={(event) => void mutate('move', { id: item.id, version: item.version, stage_id: event.target.value }).catch((err: Error) => setError(err.message))}>
          {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
        </select>
      </label>
    </article>
  }
  return <main className="min-w-0 space-y-5 px-4 py-6 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><Link href={'/projetos/' + slug + '/painel'} className="text-sm text-primary hover:underline">Voltar ao painel</Link>
        <p className="mt-2 text-sm text-muted-foreground">{data.project.title}</p><h1 className="text-2xl font-bold">Controle de Atividades</h1></div>
      {manager && <div className="flex flex-wrap gap-2"><Button onClick={() => setTask('new')}>Nova atividade</Button>
        <Button variant="outline" onClick={() => setGoal('new')}>Nova meta</Button><Button variant="outline" onClick={() => setStagesOpen(true)}>Gerenciar etapas</Button></div>}
    </header>
    <nav aria-label="Abas de atividades" className="flex flex-wrap gap-2">{(['Dashboard','Kanban','Metas','Minhas atividades'] as Tab[]).map((value) =>
      <Button key={value} variant={tab === value ? 'default' : 'outline'} aria-pressed={tab === value} onClick={() => { setTab(value); setFilter('all'); setPriority('all'); setSearch(''); setDeadline('') }}>{value}</Button>)}</nav>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {tab === 'Dashboard' && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{summaries.map((entry) => <button type="button" key={entry.label}
        onClick={() => { setTab('Kanban'); setFilter(entry.filter) }} className="rounded-2xl border border-card-outline bg-card p-4 text-left">
        <p className="text-sm text-muted-foreground">{entry.label}</p><p className="text-2xl font-bold">{entry.value}</p></button>)}</div>
      <section className="space-y-2"><h2 className="font-semibold">Progresso geral · {percent}%</h2><progress aria-label="Progresso geral" value={percent} max={100} className="h-3 w-full accent-primary" /></section>
      <section className="space-y-3"><h2 className="font-semibold">Metas</h2>
        <p className="text-sm text-muted-foreground">{goals.length} total · {goals.filter((g) => goalProgress(g,tasks,stages).percent===100).length} concluídas · {goals.filter((g) => goalProgress(g,tasks,stages).percent<100).length} em andamento · {goals.filter((g) => overdue(g.due_at,goalProgress(g,tasks,stages).percent===100)).length} atrasadas</p>
        {goalCards(goals.slice(0,6))}{!goals.length && <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada.</p>}
      </section>
      <section className="space-y-3"><h2 className="font-semibold">Atenção da equipe</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tasks.filter((item) => !done(item) && (taskKind(item,stages)==='review'||Boolean(item.due_at&&Date.parse(item.due_at)<Date.now()+3*86400000)))
          .sort((a,b) => Date.parse(a.due_at??'9999-01-01')-Date.parse(b.due_at??'9999-01-01')).slice(0,12).map(taskCard)}
      </div></section>
    </>}
    {(tab === 'Kanban' || tab === 'Minhas atividades') && <>
      <div className="flex flex-wrap items-end gap-3">
        <Input aria-label="Buscar atividades" placeholder="Buscar atividades" value={search} onChange={(event) => setSearch(event.target.value)} className="max-w-xs" />
        <label className="text-sm">Status<select value={filter} onChange={(event) => setFilter(event.target.value)} className="ml-2 rounded-lg border bg-background p-2">
          <option value="all">Todos</option><option value="pending">Pendentes</option><option value="late">Atrasadas</option>{Object.entries(kinds).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm">Prioridade<select value={priority} onChange={(event) => setPriority(event.target.value)} className="ml-2 rounded-lg border bg-background p-2">
          <option value="all">Todas</option>{Object.entries(priorities).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm">Prazo até<Input type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
      </div>
      {tab === 'Kanban' ? <div className="flex min-w-0 gap-4 overflow-x-auto pb-4" aria-label="Quadro Kanban">
        {stages.map((stage) => <section key={stage.id} aria-label={stage.name} className="flex max-h-[65dvh] w-72 shrink-0 flex-col rounded-2xl border border-border bg-muted/30"
          onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const moved=tasks.find((item) => item.id===event.dataTransfer.getData('text/plain')); if(moved)void mutate('move',{id:moved.id,version:moved.version,stage_id:stage.id}).catch((err: Error)=>setError(err.message)) }}>
          <h2 className="shrink-0 p-3 font-semibold">{stage.name} · {filtered.filter((item) => item.stage_id===stage.id).length}</h2>
          <div className="min-h-20 space-y-3 overflow-y-auto overscroll-contain p-3 pt-0">{filtered.filter((item) => item.stage_id===stage.id).map(taskCard)}</div>
        </section>)}
      </div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{filtered.map(taskCard)}</div>}
      {!filtered.length && <p className="text-sm text-muted-foreground">Nenhuma atividade neste filtro.</p>}
    </>}
    {tab === 'Metas' && <>{goalCards(goals)}{!goals.length && <p className="text-sm text-muted-foreground">Nenhuma meta cadastrada.</p>}</>}
    {task && (task === 'new' || selected) && <ActivityEditor key={task} data={data} task={selected} userId={userId} revision={revision} busy={busy} mutate={mutate} close={() => setTask(null)} />}
    {goal && (goal === 'new' || selectedGoal) && <GoalEditor key={goal} data={data} goal={selectedGoal} revision={revision} busy={busy} mutate={mutate} close={() => setGoal(null)} openTask={(id) => {setGoal(null);setTask(id)}} />}
    {stagesOpen && <StageEditor data={data} busy={busy} mutate={mutate} close={() => setStagesOpen(false)} />}
  </main>
}
