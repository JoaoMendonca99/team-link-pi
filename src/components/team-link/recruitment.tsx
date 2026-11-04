'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { getSupabaseClient } from '@/lib/supabase/client'

export type Vacancy = { id: string; title: string; description: string; skills: string[]; positions: number; available: number; open: boolean; legacy: boolean }
type Application = { id: string; project_title: string; slug: string; user_id: string; name: string | null; avatar: string | null; created_at: string; decided_at: string | null; status: 'pending' | 'review' | 'approved' | 'rejected' | 'canceled'; vacancies: { id: string; title: string; approved: boolean }[]; message: string | null; unread: number }
type Message = { id: number; sender_id: string | null; name: string | null; avatar: string | null; content: string; created_at: string }

const statuses = { pending: 'Pendente', review: 'Em análise', approved: 'Aprovada', rejected: 'Recusada', canceled: 'Cancelada' }
const active = (item: Application) => item.status === 'pending' || item.status === 'review'
const date = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
const card = 'min-w-0 space-y-4 rounded-3xl border border-card-outline bg-card p-4 sm:p-5'
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir a operação.'

export async function recruitmentRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args)
  if (error) throw new Error(error.code === 'P0001' ? error.message : 'Não foi possível concluir a operação.')
  return data as T
}

function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { dialog?.close(); document.body.style.overflow = overflow }
  }, [])
  return (
    <dialog ref={ref} aria-label={title} onCancel={(event) => { event.preventDefault(); close() }}
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

export function VacancySummary({ vacancies, error }: { vacancies: Vacancy[]; error: string | null }) {
  const available = vacancies.filter((v) => v.open && v.available > 0)
  return <section id="participar" className={card}>
    <h2 className="text-lg font-semibold">Vagas disponíveis</h2>
    <Failure message={error} />
    {!error && !available.length ? <p className="text-sm text-muted-foreground">Sem vagas disponíveis no momento.</p> : null}
    {available.map((v) => <div key={v.id} className="space-y-1 border-t border-border pt-2">
      <p className="break-words text-sm font-semibold">{v.title} <span className="text-primary">· {v.available}</span></p>
      {v.skills.length ? <p className="break-words text-xs text-primary">{v.skills.join(' · ')}</p> : null}
      {v.description ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{v.description}</p> : null}
    </div>)}
  </section>
}

function useApplications(project: string | null, enabled: boolean) {
  const [items, setItems] = useState<Application[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    if (!enabled) return
    try { setItems(await recruitmentRpc<Application[]>('recruitment_applications', { p_project: project })); setError(null) }
    catch (err) { setError(errorText(err)) }
    finally { setLoading(false) }
  }, [enabled, project])
  useEffect(() => { void reload() }, [reload])
  return { items, reload, error, loading }
}

function ApplicationDetails({ item, manager, vacancies, reload }: { item: Application; manager?: boolean; vacancies?: Vacancy[]; reload: () => Promise<void> }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approval, setApproval] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const load = useCallback(async () => {
    try { setMessages(await recruitmentRpc<Message[]>('recruitment_messages', { p_request: item.id })); await reload() }
    catch (err) { setError(errorText(err)) }
  }, [item.id, reload])
  useEffect(() => { void load() }, [load])
  async function perform(action: () => Promise<unknown>, onSuccess?: () => void) {
    setBusy(true); setError(null)
    try { await action(); onSuccess?.(); await load() }
    catch (err) { setError(errorText(err)) }
    finally { setBusy(false) }
  }
  const decide = (action: string) => recruitmentRpc('recruitment_decide', { p_request: item.id, p_action: action, p_vacancies: action === 'approve' ? selected : [] })
  const options = vacancies?.filter((v) => v.open && v.available > 0 && (item.vacancies.length ? item.vacancies.some((x) => x.id === v.id) : v.legacy)) ?? []
  return <div className="min-w-0 space-y-4">
    <div className="space-y-1">
      <p className="break-words font-semibold">{item.project_title} · {statuses[item.status]}</p>
      <p className="text-xs text-muted-foreground">Enviada em {date(item.created_at)}{item.decided_at ? ' · Decisão em ' + date(item.decided_at) : ''}</p>
      <p className="break-words text-sm">{item.vacancies.length ? item.vacancies.map((v) => v.title + (v.approved ? ' (atribuída)' : '')).join(' · ') : 'Candidatura do sistema anterior'}</p>
      {item.message ? <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.message}</p> : null}
    </div>
    <div className="max-h-64 space-y-3 overflow-y-auto rounded-2xl border border-border p-3">
      {messages.length ? messages.map((m) => <article key={m.id} className="flex min-w-0 gap-2">
        <UserAvatar name={m.name || 'Usuário'} imageUrl={m.avatar ?? undefined} sizeClassName="h-8 w-8 shrink-0" />
        <div className="min-w-0"><p className="break-words text-xs font-semibold">{m.name || 'Usuário'} · {date(m.created_at)}</p>
          <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p></div>
      </article>) : <p className="text-sm text-muted-foreground">Nenhuma mensagem.</p>}
    </div>
    <Button type="button" variant="ghost" size="sm" onClick={() => void load()}>Atualizar conversa</Button>
    {active(item) ? <>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void perform(() => recruitmentRpc('recruitment_send_message', { p_request: item.id, p_content: content }), () => setContent('')) }}>
        <Textarea aria-label="Mensagem privada" value={content} maxLength={4000} onChange={(e) => setContent(e.target.value)} placeholder="Escreva uma mensagem privada" />
        <Button disabled={busy || !content.trim()}>Enviar mensagem</Button>
      </form>
      {manager ? <div className="flex flex-wrap gap-2">
        {item.status === 'pending' ? <Button disabled={busy} variant="outline" onClick={() => void perform(() => decide('review'))}>Iniciar análise</Button> : null}
        <Button disabled={busy} onClick={() => { setSelected([]); setApproval(true) }}>Aprovar candidatura</Button>
        <Button disabled={busy} variant="outline" onClick={() => void perform(() => decide('reject'))}>Recusar</Button>
      </div> : <Button disabled={busy} variant="outline" onClick={() => void perform(() => decide('cancel'))}>Cancelar candidatura</Button>}
    </> : <p className="text-sm text-muted-foreground">Conversa encerrada. O histórico permanece disponível.</p>}
    <Failure message={error} />
    {approval ? <Modal title="Confirmar aprovação" close={() => setApproval(false)}>
      <p className="text-sm text-muted-foreground">Selecione quais posições serão atribuídas.</p>
      <VacancyOptions options={options} selected={selected} setSelected={setSelected} />
      {!options.length ? <p className="text-sm">Nenhuma posição disponível para esta candidatura.</p> : null}
      <Failure message={error} />
      <Button disabled={busy || !selected.length} onClick={() => void perform(() => decide('approve'), () => setApproval(false))}>Confirmar aprovação</Button>
    </Modal> : null}
  </div>
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

export function ApplyButton({ projectId, title, vacancies, userId, canApply, isVisitor }: { projectId: string; title: string; vacancies: Vacancy[]; userId?: string; canApply: boolean; isVisitor: boolean }) {
  const { items, reload, error, loading } = useApplications(projectId, Boolean(userId))
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const own = items.filter((item) => item.user_id === userId)
  const current = own.find(active)
  const previous = current ?? own[0]
  const options = vacancies.filter((v) => v.open && v.available > 0)
  const available = options.length > 0 && canApply && !own.some((item) => item.status === 'approved')
  if (isVisitor) return options.length ? <Button asChild><Link href="/login">Participar</Link></Button> : null
  if (!userId || loading || error || (!available && !previous)) return <Failure message={error} />
  return <>
    <Button onClick={() => { setFeedback(null); setOpen(true) }}>{current || !available ? 'Acompanhar candidatura' : 'Participar'}</Button>
    {open ? <Modal title={title} close={() => setOpen(false)}>
      {current || !available ? (previous ? <ApplicationDetails key={previous.id} item={previous} reload={reload} /> : null) : (
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setFeedback(null)
          try { await recruitmentRpc('recruitment_send_application', { p_project: projectId, p_vacancies: selected, p_message: message }); setSelected([]); setMessage(''); await reload() }
          catch (err) { setFeedback(errorText(err)) }
          finally { setBusy(false) }
        }}>
          <p className="text-sm text-muted-foreground">Solicite participação e selecione uma ou mais vagas.</p>
          <VacancyOptions options={options} selected={selected} setSelected={setSelected} />
          <Textarea aria-label="Apresentação opcional" maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Apresente suas experiências, interesses e disponibilidade (opcional)" />
          <Failure message={feedback} />
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy || !selected.length}>Enviar solicitação</Button></div>
        </form>
      )}
    </Modal> : null}
  </>
}

export function MyApplications() {
  const { items, reload, error, loading } = useApplications(null, true)
  const [selected, setSelected] = useState<string | null>(null)
  const item = items.find((entry) => entry.id === selected)
  return <section id="minhas-candidaturas" className={card}>
    <h2 className="text-lg font-semibold">Minhas candidaturas</h2>
    <Failure message={error} />
    {!error && !items.length ? <p className="text-sm text-muted-foreground">{loading ? 'Carregando…' : 'Nenhuma candidatura enviada.'}</p> : null}
    {items.map((entry) => <Button key={entry.id} variant="outline" className="mr-2 h-auto whitespace-normal text-left" onClick={() => setSelected(entry.id)}>
      {entry.project_title} · {statuses[entry.status]}{entry.unread ? ' · ' + entry.unread + ' nova(s)' : ''}
    </Button>)}
    {item ? <Modal title="Acompanhar candidatura" close={() => setSelected(null)}><ApplicationDetails key={item.id} item={item} reload={reload} /></Modal> : null}
  </section>
}

const emptyVacancy = { title: '', description: '', skills: [], positions: 1, open: true }
function RecruitmentManager({ projectId }: { projectId: string }) {
  const { items, reload, error } = useApplications(projectId, true)
  const { vacancies, reload: reloadVacancies, error: vacancyError } = useVacancies(projectId)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Vacancy | 'new' | null>(null)
  const item = items.find((entry) => entry.id === selected)
  const refresh = useCallback(async () => { await Promise.all([reload(), reloadVacancies()]) }, [reload, reloadVacancies])
  return <section id="candidaturas" className={card}>
    <header className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Vagas e candidaturas</h2><Button onClick={() => setEditing('new')}>Criar vaga</Button></header>
    <Failure message={vacancyError || error} />
    <div className="flex flex-wrap gap-2">{vacancies.map((v) => <Button key={v.id} variant="outline" className="h-auto whitespace-normal text-left" onClick={() => setEditing(v)}>{v.title} · {v.open ? v.available + '/' + v.positions : 'Encerrada'}</Button>)}</div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="space-y-2">{items.length ? items.map((entry) => <button type="button" key={entry.id} aria-pressed={entry.id === selected}
        className="block w-full break-words rounded-xl border border-border p-3 text-left text-sm aria-pressed:border-primary"
        onClick={() => setSelected(entry.id)}>
        <span className="font-semibold">{entry.name || 'Candidato'}</span> · {statuses[entry.status]}
        <span className="block text-xs text-muted-foreground">{date(entry.created_at)}{entry.unread ? ' · ' + entry.unread + ' nova(s)' : ''}</span>
        <span className="block text-xs text-muted-foreground">{entry.vacancies.map((v) => v.title).join(' · ')}</span>
      </button>) : <p className="text-sm text-muted-foreground">Nenhuma candidatura.</p>}</div>
      {item ? <div className="min-w-0 space-y-3"><Link className="text-sm font-semibold text-primary" href={'/usuarios/' + item.user_id}>Ver perfil do candidato</Link><ApplicationDetails key={item.id} item={item} manager vacancies={vacancies} reload={refresh} /></div> : null}
    </div>
    {editing ? <VacancyEditor projectId={projectId} vacancy={editing === 'new' ? null : editing} close={() => setEditing(null)} reload={reloadVacancies} /> : null}
  </section>
}

export function RecruitmentPanel({ projectId, userId }: { projectId: string; userId?: string }) {
  const [allowed, setAllowed] = useState(false)
  useEffect(() => {
    let active = true
    if (userId) void recruitmentRpc<boolean>('is_project_join_manager', { p_project_id: projectId })
      .then((value) => { if (active) setAllowed(value) }).catch(() => { if (active) setAllowed(false) })
    return () => { active = false }
  }, [projectId, userId])
  return allowed && userId ? <RecruitmentManager projectId={projectId} /> : null
}

function VacancyEditor({ projectId, vacancy, close, reload }: { projectId: string; vacancy: Vacancy | null; close: () => void; reload: () => Promise<void> }) {
  const initial = vacancy ?? emptyVacancy
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [skills, setSkills] = useState(initial.skills.join('\n'))
  const [positions, setPositions] = useState(String(initial.positions))
  const [open, setOpen] = useState(initial.open)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return <Modal title={vacancy ? 'Editar vaga' : 'Criar vaga'} close={close}>
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null)
      try {
        await recruitmentRpc('recruitment_save_vacancy', { p_project: projectId, p_vacancy: vacancy?.id ?? null, p_title: title,
          p_description: description, p_skills: [...new Set(skills.split('\n').map((s) => s.trim()).filter(Boolean))], p_positions: Number(positions), p_open: open })
        await reload(); close()
      } catch (err) { setError(errorText(err)) }
      finally { setBusy(false) }
    }}>
      <label className="block text-sm">Função<Input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label className="block text-sm">Descrição<Textarea maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="block text-sm">Habilidades (uma por linha)<Textarea value={skills} onChange={(e) => setSkills(e.target.value)} /></label>
      <label className="block text-sm">Posições<Input type="number" min={1} max={1000000} required value={positions} onChange={(e) => setPositions(e.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} /> Vaga aberta</label>
      <Failure message={error} />
      <Button disabled={busy}>Salvar vaga</Button>
    </form>
  </Modal>
}
