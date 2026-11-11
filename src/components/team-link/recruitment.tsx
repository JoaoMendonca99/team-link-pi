'use client'

import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageTextarea } from '@/components/chat/message-textarea'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { notifyRecommendations, RECOMMENDATION_ACCESS_CHANGED, RECOMMENDATIONS_CHANGED } from '@/lib/graph/events'
import { getSupabaseClient } from '@/lib/supabase/client'
import { ConceptChipInput } from './concept-chip-input'
import { legacyConcepts, type ConceptChoice, type ProjectConcepts } from '@/lib/concepts'

export type Vacancy = { id: string; title: string; description: string; skills: string[]; positions: number; available: number; open: boolean; legacy: boolean }
type Application = { id: string; project_id: string; project_title: string; slug: string; user_id: string; name: string | null; avatar: string | null; created_at: string; decided_at: string | null; status: 'pending' | 'review' | 'approved' | 'rejected' | 'canceled' | 'closed'; decision_reason?: 'vacancy_filled' | null; vacancies: { id: string; title: string; approved: boolean; rejected?: boolean }[]; message: string | null; unread: number }
type Message = { id: number; sender_id: string | null; name: string | null; avatar: string | null; content: string; created_at: string }

const statuses = { pending: 'Pendente', review: 'Em análise', approved: 'Aprovada', rejected: 'Recusada', canceled: 'Cancelada', closed:'Encerrada pelo projeto' }
const applicationStatus = (item: Application) => statuses[item.status] + (item.decision_reason === 'vacancy_filled' ? ' · Vaga preenchida' : '')
const vacancyDecision = (vacancy: Application['vacancies'][number]) =>
  vacancy.title + (vacancy.approved ? ' (atribuída)' : vacancy.rejected ? ' (vaga preenchida)' : '')
const active = (item: Application) => item.status === 'pending' || item.status === 'review'
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const card = 'min-w-0 space-y-4 rounded-3xl border border-card-outline bg-card p-4 sm:p-5'
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.'

export async function recruitmentRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args)
  if (error) throw new Error(error.code === 'P0001' ? error.message : 'Não foi possível concluir a operação.')
  if (['recruitment_set_access','recruitment_move_member','remove_project_member'].includes(name)) notifyRecommendations(RECOMMENDATION_ACCESS_CHANGED)
  if (['save_vacancy_concepts','recruitment_save_vacancy','recruitment_decide','recruitment_send_application'].includes(name)) notifyRecommendations()
  return data as T
}

function Modal({ title, close, children, dismissOutside = false }: { title: string; close: () => void; children: ReactNode; dismissOutside?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    const viewport = document.documentElement
    const { overflow, scrollbarGutter } = viewport.style
    if (viewport.clientWidth < window.innerWidth) viewport.style.scrollbarGutter = 'stable'
    viewport.style.overflow = 'hidden'
    return () => {
      dialog?.close()
      viewport.style.overflow = overflow
      viewport.style.scrollbarGutter = scrollbarGutter
    }
  }, [])
  return (
    <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); close() }}
      onClick={dismissOutside ? (event) => {
        if (event.target !== event.currentTarget) return
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect()
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close()
      } : undefined}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-lg space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-card-outline bg-card p-5 text-card-foreground backdrop:bg-black/70">
      <header className="flex items-center justify-between gap-3">
        <h2 className="break-words text-lg font-semibold">{title}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Fechar" onClick={close}><X className="h-4 w-4" /></Button>
      </header>
      {children}
    </dialog>
  )
}

function Failure({ message }: { message: string | null }) {
  return message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null
}

export function useVacancies(projectId: string | undefined) {
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    if (!projectId) return
    try { setVacancies(await recruitmentRpc<Vacancy[]>('recruitment_vacancies', { p_project: projectId })); setError(null) }
    catch (err) { setError(errorText(err)) }
  }, [projectId])
  useEffect(() => { void reload() }, [reload])
  return { vacancies, error, reload }
}

const hasPositions = (vacancy: Vacancy) => vacancy.open && vacancy.available > 0
const positionLabel = (vacancy: Vacancy) => {
  const count = vacancy.open ? vacancy.available : 0
  return count === 1 ? '1 posição disponível' : `${count} posições disponíveis`
}
const vacancyStatus = (vacancy: Vacancy) => !vacancy.open ? 'Encerrada' : vacancy.available > 0 ? 'Aberta' : 'Preenchida'

export function VacancySummary({ vacancies, error, onApply }: { vacancies: Vacancy[]; error: string | null; onApply?: (id: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = vacancies.find((vacancy) => vacancy.id === selectedId)
  const ordered = vacancies.filter((vacancy) => vacancy.available > 0).sort((a, b) => Number(b.open) - Number(a.open))
  return <section id="participar" className={card}>
    <h2 className="text-lg font-semibold">Vagas disponíveis</h2>
    <Failure message={error} />
    {!error && !ordered.length ? <p className="text-sm text-muted-foreground">Sem vagas disponíveis no momento.</p> : null}
    <ul className="space-y-2">
      {ordered.map((v) => <li key={v.id} className="space-y-2 rounded-xl border border-border p-3">
        <h3 className="break-words text-sm font-semibold">{v.title}</h3>
        <p className="text-xs text-muted-foreground">{positionLabel(v)} · {vacancyStatus(v)}</p>
        <VacancySkills skills={v.skills.slice(0, 4)} remaining={v.skills.length - 4} />
        <Button type="button" size="sm" variant="outline" aria-label={`Ver descrição de ${v.title}`} onClick={() => setSelectedId(v.id)}>
          Ver descrição
        </Button>
      </li>)}
    </ul>
    {selected ? <Modal title={selected.title} close={() => setSelectedId(null)} dismissOutside>
      <p className="text-sm text-muted-foreground">{positionLabel(selected)} · {vacancyStatus(selected)}</p>
      <p className="whitespace-pre-wrap break-words text-sm">{selected.description || 'Nenhuma descrição informada.'}</p>
      {selected.skills.length > 0 ? <div className="space-y-2">
        <h3 className="text-sm font-semibold">Habilidades desejadas</h3>
        <VacancySkills skills={selected.skills} />
      </div> : null}
      {onApply && hasPositions(selected) ? <Button type="button" onClick={() => { setSelectedId(null); onApply(selected.id) }}>Candidatar-se</Button> : null}
    </Modal> : null}
  </section>
}

export function VacancySkills({ skills, remaining = 0, label='Habilidades desejadas' }: { skills: string[]; remaining?: number; label?:string }) {
  if (!skills.length) return null
  return <ul aria-label={label} className="flex flex-wrap gap-1">
    {skills.map((skill, index) => <li key={index} className="max-w-full break-words rounded-full border border-primary/25 px-2 py-0.5 text-xs text-primary">{skill}</li>)}
    {remaining > 0 ? <li aria-label={`Mais ${remaining} habilidades`} className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">+{remaining}</li> : null}
  </ul>
}

function useApplications(project: string | null, enabled: boolean, viewer?: string) {
  const scope = JSON.stringify([project, viewer])
  const [items, setItems] = useState<Application[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadedScope, setLoadedScope] = useState<string | null>(null)
  const [updates, setUpdates] = useState<Record<string, number>>({})
  const [connection, setConnection] = useState(0)
  const request = useRef(0)
  const reload = useCallback(async () => {
    if (!enabled) return
    const id = ++request.current
    try {
      const rows = await recruitmentRpc<Application[]>('recruitment_applications', { p_project: project })
      if (id === request.current) { setItems(rows); setError(null) }
    } catch (err) { if (id === request.current) setError(errorText(err)) }
    finally { if (id === request.current) setLoadedScope(scope) }
  }, [enabled, project, scope])
  useEffect(() => {
    if (!enabled || (!project && !viewer)) return
    void reload()
    let timer: number | undefined
    const refresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void reload(), 100)
    }
    const client = getSupabaseClient()
    const channel = client.channel('recruitment:' + crypto.randomUUID())
    for (const event of ['INSERT', 'UPDATE'] as const) channel.on('postgres_changes', {
      event, schema: 'public', table: 'recruitment_updates',
      filter: project ? 'project_id=eq.' + project : 'user_id=eq.' + viewer,
    }, ({ new: row }) => {
      if (!('request_id' in row) || typeof row.request_id !== 'string') return
      const id = row.request_id
      setUpdates((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }))
      refresh()
      window.dispatchEvent(new Event(RECOMMENDATIONS_CHANGED))
    })
    channel.subscribe((status) => {
      if (status !== 'SUBSCRIBED') return
      setConnection((value) => value + 1)
      refresh()
    })
    return () => {
      request.current += 1
      window.clearTimeout(timer)
      void client.removeChannel(channel)
    }
  }, [enabled, project, reload, viewer])
  return { items: loadedScope === scope ? items : [], reload, error: loadedScope === scope ? error : null,
    loading: loadedScope !== scope, updates, connection }
}

function ApplicationDetails({ item, manager, vacancies, reload, version, onApproved, draft, onDraftChange, onBusyChange }: {
  item: Application; manager?: boolean; vacancies?: Vacancy[]; reload: () => Promise<void>; version: number
  onApproved?: () => void
  draft?: string
  onDraftChange?: (value: string) => void
  onBusyChange?: (busy: boolean) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [localContent, setLocalContent] = useState('')
  const content = draft ?? localContent
  const setContent = onDraftChange ?? setLocalContent
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approval, setApproval] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const history = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const request = useRef(0)
  const load = useCallback(async () => {
    const id = ++request.current
    try {
      const rows = await recruitmentRpc<Message[]>('recruitment_messages', { p_request: item.id })
      if (id !== request.current) return
      setMessages(rows)
      await reload()
    } catch (err) { if (id === request.current) setError(errorText(err)) }
  }, [item.id, reload])
  useEffect(() => {
    void load()
    return () => { request.current += 1 }
  }, [load, version])
  useLayoutEffect(() => {
    if (history.current && follow.current) history.current.scrollTop = history.current.scrollHeight
  }, [messages])
  const pendingAction = useRef(false)
  async function perform(action: () => Promise<unknown>, onSuccess?: () => void) {
    if (pendingAction.current) return
    pendingAction.current = true
    setBusy(true); onBusyChange?.(true); setError(null)
    try { await action(); onSuccess?.(); await load() }
    catch (err) { setError(errorText(err)) }
    finally { pendingAction.current = false; setBusy(false); onBusyChange?.(false) }
  }
  const send = () => { if (!content.trim() || content.length>4000) return; void perform(() => recruitmentRpc('recruitment_send_message', { p_request: item.id, p_content: content }), () => setContent('')) }
  const decide = (action: string) => recruitmentRpc('recruitment_decide', { p_request: item.id, p_action: action, p_vacancies: action === 'approve' ? selected : [] })
  const options = vacancies?.filter((v) => v.open && v.available > 0 && (item.vacancies.length ? item.vacancies.some((x) => x.id === v.id && !x.rejected) : v.legacy)) ?? []
  return <div className="min-w-0 space-y-4">
    <div className="space-y-1">
      <p className="break-words font-semibold">{item.project_title} · {applicationStatus(item)}</p>
      <p className="text-xs text-muted-foreground">Enviada em {date(item.created_at)}{item.decided_at ? ' · Decisão em ' + date(item.decided_at) : ''}</p>
      <p className="break-words text-sm">{item.vacancies.length ? item.vacancies.map(vacancyDecision).join(' · ') : 'Candidatura do sistema anterior'}</p>
      {item.vacancies.some((vacancy) => vacancy.rejected) && <Link href={'/projetos/' + item.slug + '#participar'} className="text-sm text-primary hover:underline">Consultar outras vagas do projeto</Link>}
      {item.message ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.message}</p> : null}
    </div>
    <div ref={history} aria-label="Histórico da candidatura" className="max-h-64 space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-border p-3"
      onScroll={(event) => { const el = event.currentTarget; follow.current = el.scrollHeight - el.clientHeight - el.scrollTop <= 64 }}>
      {messages.length ? messages.map((m) => <article key={m.id} className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <ApplicationPerson id={m.sender_id} name={m.name || 'Usuário'} avatar={m.avatar} />
          <time dateTime={m.created_at} className="text-xs text-muted-foreground">{date(m.created_at)}</time>
        </div>
        <p className="whitespace-pre-wrap break-words pl-10 text-sm">{m.content}</p>
      </article>) : <p className="text-sm text-muted-foreground">Nenhuma mensagem.</p>}
    </div>
    {active(item) ? <>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); send() }}>
        <MessageTextarea sending={busy} canSend={Boolean(content.trim()) && content.length<=4000} onSend={send} aria-label="Mensagem privada" value={content} maxLength={4000} onChange={(e) => setContent(e.target.value)} placeholder="Escreva uma mensagem privada" />
        <Button disabled={busy || !content.trim()}>Enviar mensagem</Button>
      </form>
      {manager ? <div className="flex flex-wrap gap-2">
        {item.status === 'pending' ? <Button disabled={busy} variant="outline" onClick={() => void perform(() => decide('review'))}>Iniciar análise</Button> : null}
        <Button disabled={busy} onClick={() => { setSelected([]); setApproval(true) }}>Aprovar candidatura</Button>
        <Button disabled={busy} variant="outline" onClick={() => void perform(() => decide('reject'))}>Recusar</Button>
      </div> : <Button disabled={busy} variant="outline" onClick={() => void perform(() => decide('cancel'))}>Cancelar candidatura</Button>}
    </> : <p className="text-sm text-muted-foreground">Conversa encerrada. O histórico permanece disponível.</p>}
    <Failure message={error} />
    {approval && active(item) ? <section aria-label="Confirmar aprovação" className="space-y-3 rounded-2xl border border-border p-3">
      <p className="text-sm text-muted-foreground">Selecione quais posições serão atribuídas.</p>
      <VacancyOptions options={options} selected={selected} setSelected={setSelected} />
      {!options.length ? <p className="text-sm">Nenhuma posição disponível para esta candidatura.</p> : null}
      <Failure message={error} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => setApproval(false)}>Cancelar</Button>
        <Button disabled={busy || !selected.length} onClick={() => void perform(() => decide('approve'), () => { setApproval(false); onApproved?.() })}>Confirmar aprovação</Button>
      </div>
    </section> : null}
  </div>
}

function ApplicationPerson({ id, name, avatar }: { id: string | null; name: string; avatar: string | null }) {
  const body = <><UserAvatar name={name} imageUrl={avatar ?? undefined} sizeClassName="size-8 shrink-0" />
    <span className="break-words">{name}</span></>
  const classes = 'inline-flex min-w-0 max-w-full items-center gap-2 text-sm font-semibold'
  return id ? <Link href={'/usuarios/' + id} className={classes + ' text-primary hover:underline'}>{body}</Link>
    : <span className={classes}>{body}</span>
}

function VacancyOptions({ options, selected, setSelected }: { options: Vacancy[]; selected: string[]; setSelected: (ids: string[]) => void }) {
  return <fieldset className="space-y-2">
    <legend className="text-sm font-semibold">Vagas</legend>
    {options.map((v) => <label key={v.id} className="flex min-w-0 items-start gap-2 rounded-xl border border-border p-2 text-sm">
      <input type="checkbox" className="mt-1" checked={selected.includes(v.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, v.id] : selected.filter((id) => id !== v.id))} />
      <span className="min-w-0 break-words"><strong>{v.title} · {v.available} disponível(is)</strong>{v.description ? <span className="block whitespace-pre-wrap text-muted-foreground">{v.description}</span> : null}</span>
    </label>)}
  </fieldset>
}

export function useProjectApplications(projectId: string | undefined, userId: string | undefined) {
  const applications = useApplications(projectId ?? null, Boolean(projectId && userId), userId)
  const own = applications.items.filter((item) => item.user_id === userId)
  const current = own.find(active)
  return { ...applications, current, previous: current ?? own[0] }
}

export function ApplyButton({ projectId, title, vacancies, userId, canApply, isVisitor, applications, target, setTarget, embedded=false, label='Participar', initialVacancy, onRefresh }: {
  projectId: string; title: string; vacancies: Vacancy[]; userId?: string; canApply: boolean; isVisitor: boolean
  applications: ReturnType<typeof useProjectApplications>; target: string | null; setTarget: (target: string | null) => void
  embedded?:boolean;label?:string;initialVacancy?:string;onRefresh?:()=>Promise<void>
}) {
  const { reload, error, loading, current, previous } = applications
  const [selection, setSelected] = useState<string[] | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const options = vacancies.filter(hasPositions)
  const selected = selection ?? (target ? [target] : [])
  const available = options.length > 0 && canApply
  function close() {
    setSelected(null)
    setFeedback(null)
    setTarget(null)
  }
  if (isVisitor) return options.length ? <Button asChild><Link href="/login">Participar</Link></Button> : null
  if (!userId || loading || error || (!available && !previous)) return <Failure message={error||feedback} />
  const content=<>
      {current || !available ? (previous ? <ApplicationDetails key={previous.id} item={previous} reload={reload}
        version={applications.connection + (applications.updates[previous.id] ?? 0)} /> : null) : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setFeedback(null)
          try { await recruitmentRpc('recruitment_send_application', { p_project: projectId, p_vacancies: selected, p_message: message }); setSelected([]); setMessage(''); await reload(); await onRefresh?.() }
          catch (err) { setFeedback(errorText(err)); await onRefresh?.() }
          finally { setBusy(false) }
        }}>
          <p className="text-sm text-muted-foreground">Solicite participação e selecione uma ou mais vagas.</p>
          <VacancyOptions options={options} selected={selected} setSelected={setSelected} />
          <Textarea aria-label="Apresentação opcional" maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Apresente suas experiências, interesses e disponibilidade (opcional)" />
          <Failure message={feedback} />
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={close}>Cancelar</Button>
            <Button disabled={busy || !selected.length}>Enviar solicitação</Button></div>
        </form>
      )}</>
  return <>
    <Button onClick={() => setTarget(initialVacancy??'')}>{current || !available ? 'Acompanhar candidatura' : label}</Button>
    {embedded&&!available&&<Failure message={feedback}/>}
    {target !== null ? embedded?<section aria-label="Candidatura" className="mt-4 space-y-3 rounded-xl border p-3">{content}</section>:<Modal title={title} close={close}>{content}</Modal> : null}
  </>
}

export function MyApplications({ userId, initialRequestId, workspace=false, initialStatus, onSelect }: { userId: string; initialRequestId?:string|null; workspace?:boolean; initialStatus?:string|null; onSelect?:(id:string|null)=>void }) {
  const { items, reload, error, loading, updates, connection } = useApplications(null, true, userId)
  const [selected, setSelected] = useState<string | null>(initialRequestId??null)
  useEffect(()=>{setSelected(initialRequestId??null)},[initialRequestId,userId])
  const requestedFilter=initialStatus==='active'||(initialStatus&&Object.hasOwn(statuses,initialStatus))?initialStatus:'all'
  const [filter,setFilter]=useState(requestedFilter)
  const [page,setPage]=useState(0)
  useEffect(()=>{setFilter(requestedFilter);setPage(0)},[requestedFilter])
  const visible=items.filter(entry=>filter==='all'||(filter==='active'&&active(entry))||entry.status===filter)
  useEffect(()=>{setPage(value=>Math.min(value,Math.max(0,Math.ceil(visible.length/10)-1)))},[visible.length])
  const shown=workspace?visible.slice(page*10,page*10+10):items
  const accessKey=userId+':'+shown.map(entry=>entry.project_id).filter(Boolean).sort().join(',')
  const [projectLinks,setProjectLinks]=useState<{key:string;visible:string[];panels:string[]}>()
  useEffect(()=>{
    if(!workspace)return
    const ids=accessKey.split(':')[1].split(',').filter(Boolean)
    if(!ids.length)return
    let alive=true
    const client=getSupabaseClient()
    void Promise.all([
      client.from('project_public_cards').select('id,owner_id').in('id',ids),
      client.from('project_members').select('project_id').eq('user_id',userId).eq('status','active').in('project_id',ids),
    ]).then(([projects,members])=>{
      if(!alive||projects.error||members.error)return
      const rows=(projects.data??[]) as {id:string;owner_id:string}[]
      const linked=new Set((members.data??[]).map(row=>row.project_id as string))
      setProjectLinks({key:accessKey,visible:rows.map(row=>row.id),panels:rows.filter(row=>row.owner_id===userId||linked.has(row.id)).map(row=>row.id)})
    }).catch(()=>{ /* Optional shortcuts do not prevent access to the application details. */ })
    return()=>{alive=false}
  },[workspace,userId,accessKey])
  const links=projectLinks?.key===accessKey?projectLinks:undefined
  const select=(id:string|null)=>{setSelected(id);onSelect?.(id)}
  const item = items.find((entry) => entry.id === selected)
  return <section id="minhas-candidaturas" className={card}>
    {!workspace&&<h2 className="text-lg font-semibold">Minhas candidaturas</h2>}
    {workspace&&<label className="flex flex-wrap items-center gap-3 text-sm">Status<select aria-label="Filtrar minhas candidaturas" value={filter} onChange={event=>{setFilter(event.target.value);setPage(0)}} className="rounded-xl border border-border bg-background p-2"><option value="all">Todas</option><option value="active">Pendentes / Em análise</option>{Object.entries(statuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
    <Failure message={error} />
    {workspace&&error&&<Button variant="outline" size="sm" onClick={()=>void reload()}>Tentar novamente</Button>}
    {!error && !items.length ? <p className="text-sm text-muted-foreground">{loading ? 'Carregando…' : 'Nenhuma candidatura enviada.'}</p> : null}
    {!workspace&&shown.map((entry) => <Button key={entry.id} variant="outline" className="mr-2 h-auto whitespace-normal text-left" onClick={() => select(entry.id)}>
      {entry.project_title} · {applicationStatus(entry)}{entry.unread ? ' · ' + entry.unread + ' nova(s)' : ''}
    </Button>)}
    {workspace&&<><ul className="space-y-3">{shown.map(entry=><li key={entry.id} className="min-w-0 space-y-2 rounded-xl border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-words font-semibold">{entry.project_title}</h2><span className="text-xs text-muted-foreground">{applicationStatus(entry)}</span></div><p className="break-words text-sm text-muted-foreground">{entry.vacancies.map(vacancyDecision).join(' · ')||'Solicitação de participação'}</p><p className="text-xs text-muted-foreground">Enviada em {date(entry.created_at)}{entry.unread?' · '+entry.unread+' nova(s)':''}</p><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>select(entry.id)}>Detalhes e conversa</Button>{links?.visible.includes(entry.project_id)&&<Button asChild size="sm" variant="ghost"><Link href={'/projetos/'+entry.slug}>Ver projeto</Link></Button>}{links?.panels.includes(entry.project_id)&&<Button asChild size="sm" variant="outline"><Link href={'/projetos/'+entry.slug+'/painel'}>Abrir painel</Link></Button>}</div></li>)}</ul>{!loading&&!error&&!visible.length&&<p className="text-sm text-muted-foreground">Nenhuma candidatura neste filtro.</p>}{visible.length>10&&<nav aria-label="Paginação de candidaturas" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{Math.min(page*10+1,visible.length)}–{Math.min((page+1)*10,visible.length)} de {visible.length}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Anterior</Button><Button size="sm" variant="outline" disabled={(page+1)*10>=visible.length} onClick={()=>setPage(value=>value+1)}>Próxima</Button></div></nav>}</>}
    {initialRequestId&&!loading&&!error&&!item&&<p role="alert" className="text-sm text-muted-foreground">Candidatura indisponível para esta conta.</p>}
    {item ? <Modal title="Acompanhar candidatura" close={() => select(null)}>
      <ApplicationDetails key={item.id} item={item} reload={reload} version={connection + (updates[item.id] ?? 0)} />
    </Modal> : null}
  </section>
}

const emptyVacancy = { title: '', description: '', skills: [], positions: 1, open: true }
const applicationFilters = [
  ['pending', 'Pendentes'], ['approved', 'Aprovadas'], ['rejected', 'Recusadas'], ['history', 'Histórico'],
] as const
type ApplicationFilter = typeof applicationFilters[number][0]

export function RecruitmentManager({ projectId }: { projectId: string }) {
  const { items, reload, error, updates, connection } = useApplications(projectId, true)
  const { vacancies, reload: reloadVacancies, error: vacancyError } = useVacancies(projectId)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Vacancy | 'new' | null>(null)
  const [filter, setFilter] = useState<ApplicationFilter>('pending')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const item = items.find((entry) => entry.id === selected)
  const visible = items.filter((entry) => filter === 'pending' ? active(entry) :
    filter === 'history' ? !active(entry) : entry.status === filter)
  useEffect(() => { if (connection || Object.keys(updates).length) void reloadVacancies() }, [connection, reloadVacancies, updates])
  const activeVacancies = vacancies.filter(hasPositions)
  const inactiveVacancies = vacancies.filter((vacancy) => !hasPositions(vacancy))
  return <section id="candidaturas" className={card}>
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Vagas</h2><Button onClick={() => setEditing('new')}>Criar vaga</Button></header>
    <Failure message={vacancyError || error} />
    <div className="flex flex-wrap gap-2">{activeVacancies.map((v) => <Button key={v.id} variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setEditing(v)}>{v.title} · {v.available}/{v.positions}</Button>)}</div>
    {inactiveVacancies.length > 0 && <details className="rounded-xl border border-border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Editar vagas preenchidas ou encerradas</summary>
      <div className="mt-3 flex flex-wrap gap-2">{inactiveVacancies.map((v) => <Button key={v.id} variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setEditing(v)}>{v.title} · {vacancyStatus(v)}</Button>)}</div>
    </details>}
    {!activeVacancies.length && <p className="text-sm text-muted-foreground">Nenhuma vaga aberta com posições disponíveis. Crie ou reabra uma vaga para receber candidaturas.</p>}
    <section className="space-y-3 border-t border-border pt-4">
      <h2 className="text-lg font-semibold">Candidaturas</h2>
      <div className="flex flex-wrap gap-2" aria-label="Filtrar candidaturas">
        {applicationFilters.map(([value, label]) => <Button key={value} size="sm" type="button" aria-pressed={filter === value}
          variant={filter === value ? 'default' : 'outline'} onClick={() => setFilter(value)}>{label}</Button>)}
      </div>
      <ul className="space-y-2">{visible.map((entry) => <li key={entry.id}
        className={'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm ' + (active(entry) ? 'border-primary/35 bg-primary/5' : 'border-border')}>
        <div className="min-w-0 space-y-1">
          <ApplicationPerson id={entry.user_id} name={entry.name || 'Candidato'} avatar={entry.avatar} />
          <p className="break-words text-xs">{entry.vacancies.map(vacancyDecision).join(' · ') || 'Candidatura anterior'}</p>
          <p className="text-xs text-muted-foreground">{applicationStatus(entry)} · {date(entry.created_at)}{entry.unread ? ' · ' + entry.unread + ' nova(s)' : ''}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setSelected(entry.id)}>Ver candidatura</Button>
      </li>)}</ul>
      {!visible.length && <div className="space-y-2 rounded-xl bg-muted/30 p-4 text-sm"><p className="font-medium">{items.length ? 'Nenhuma candidatura neste filtro.' : 'Este projeto ainda não recebeu candidaturas.'}</p><p className="text-muted-foreground">{items.length ? 'Experimente outra situação para consultar as candidaturas existentes.' : vacancies.length ? 'Divulgue a página pública do projeto e mantenha vagas abertas para receber interessados.' : 'Crie uma vaga e compartilhe a página pública do projeto para receber interessados.'}</p>{items.length&&filter!=='history'&&<Button type="button" variant="outline" size="sm" onClick={()=>setFilter('history')}>Ver histórico</Button>}{items.length&&filter!=='pending'&&<Button type="button" variant="outline" size="sm" onClick={()=>setFilter('pending')}>Ver pendentes</Button>}</div>}
    </section>
    {item && <Modal title="Detalhes da candidatura" close={() => { if (!busy) setSelected(null) }}
      dismissOutside={!busy && !drafts[item.id]?.trim()}>
        <CandidateSummary key={item.user_id} item={item} />
        <ApplicationDetails key={item.id} item={item} manager vacancies={vacancies} reload={reload} onApproved={() => void reloadVacancies()}
          version={connection + (updates[item.id] ?? 0)} draft={drafts[item.id] ?? ''}
          onDraftChange={(value) => setDrafts((current) => ({ ...current, [item.id]: value }))} onBusyChange={setBusy} />
    </Modal>}
    {editing ? <VacancyEditor projectId={projectId} vacancy={editing === 'new' ? null : editing} close={() => setEditing(null)} reload={reloadVacancies} /> : null}
  </section>
}

function CandidateSummary({ item }: { item: Application }) {
  const [academic, setAcademic] = useState<{ course: string | null; university: string | null }>()
  useEffect(() => {
    let current = true
    void getSupabaseClient().from('profiles').select('course, university').eq('id', item.user_id).maybeSingle()
      .then(({ data }) => { if (current && data) setAcademic(data) })
    return () => { current = false }
  }, [item.user_id])
  return <div className="space-y-2 border-b border-border pb-3">
    <ApplicationPerson id={item.user_id} name={item.name || 'Candidato'} avatar={item.avatar} />
    {academic && <p className="text-sm text-muted-foreground">{[academic.course, academic.university].filter(Boolean).join(' · ')}</p>}
    <Link href={'/usuarios/' + item.user_id} className="text-sm font-semibold text-primary hover:underline">Ver perfil do candidato</Link>
  </div>
}

function VacancyEditor({ projectId, vacancy, close, reload }: { projectId: string; vacancy: Vacancy | null; close: () => void; reload: () => Promise<void> }) {
  const initial = vacancy ?? emptyVacancy
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [skills, setSkills] = useState<ConceptChoice[]>(()=>legacyConcepts(initial.skills))
  const [conceptsReady,setConceptsReady]=useState(!vacancy)
  const [positions, setPositions] = useState(String(initial.positions))
  const [open, setOpen] = useState(initial.open)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(()=>{
    if(!vacancy?.id)return
    let cancelled=false
    void getSupabaseClient().rpc('get_project_concept_refs',{p_project:projectId}).then(({data,error})=>{
      if(cancelled)return
      if(error||!data){setError('Não foi possível carregar os conceitos. Reabra a vaga para tentar novamente.');return}
      setSkills((data as ProjectConcepts).vacancies.find(v=>v.id===vacancy.id)?.concepts??[]);setConceptsReady(true)
    })
    return()=>{cancelled=true}
  },[projectId,vacancy?.id])
  return <Modal title={vacancy ? 'Editar vaga' : 'Criar vaga'} close={close}>
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); if(!conceptsReady||busy)return;setBusy(true); setError(null)
      try {
        await recruitmentRpc('save_vacancy_concepts', { p_project: projectId, p_vacancy: vacancy?.id ?? null, p_title: title,
          p_description: description, p_choices: skills, p_positions: Number(positions), p_open: open })
        await reload(); close()
      } catch (err) { setError(errorText(err)) }
      finally { setBusy(false) }
    }}>
      <label className="block text-sm">Função<Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block text-sm">Descrição<Textarea maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <ConceptChipInput label="Habilidades desejadas" optional maxItems={30} maxLength={120} value={skills} onChange={setSkills} disabled={!conceptsReady||busy} />
      <label className="block text-sm">Posições<Input type="number" min={1} max={1000000} required value={positions} onChange={(e) => setPositions(e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Vaga aberta</label>
      <Failure message={error} />
      <Button disabled={busy||!conceptsReady}>Salvar vaga</Button>
    </form>
  </Modal>
}
