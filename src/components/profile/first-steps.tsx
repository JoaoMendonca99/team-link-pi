'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, Briefcase, Camera, CheckCircle2, Circle, Compass, EyeOff, Sparkles, UserRound, Users, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FRIENDSHIPS_CHANGED, PROFILE_CHANGED } from '@/lib/profile-social'
import { essentialProgress, loadOnboarding, type OnboardingGoal, type OnboardingState } from '@/lib/onboarding'

const settingsHref = '/meu-espaco/configuracoes#primeiros-passos'
const editHref = '/meu-espaco/perfil/editar#'
type Mission = { id: string; title: string; description: string; action: string; href: string; done: boolean; icon: typeof UserRound }

function MissionItem({ mission, optional = false }: { mission: Mission; optional?: boolean }) {
  const Icon = mission.icon, Status = mission.done ? CheckCircle2 : Circle
  return <li className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3">
    <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
    <div className="min-w-0 flex-1 space-y-1"><h3 className="break-words text-sm font-semibold">{mission.title}</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{mission.description}</p>
      <p className="flex items-center gap-1.5 text-xs"><Status className="size-3.5 shrink-0" aria-hidden />{mission.done ? 'Concluída' : optional ? 'Opcional · Pendente' : 'Pendente'}</p>
      {!mission.done && <Link href={mission.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{mission.action}<ArrowRight className="size-3.5" aria-hidden /></Link>}
    </div>
  </li>
}

export function FirstSteps({ userId, location = 'dashboard' }: { userId: string; location?: 'dashboard' | 'settings' }) {
  const [snapshot, setSnapshot] = useState<{ user: string; data: OnboardingState; celebrate: boolean }>()
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const request = useRef(0), savingRef = useRef(false)
  const acknowledged = useRef(false)
  const receive = useCallback((data: OnboardingState) => {
    setSnapshot(previous => ({ user: userId, data, celebrate: data.first_completion || (previous?.user === userId && previous.celebrate) }))
    setError('')
  }, [userId])
  const refresh = useCallback(async () => {
    if (document.hidden || savingRef.current) return
    const sequence = ++request.current
    try { const data = await loadOnboarding(); if (sequence === request.current) receive(data) }
    catch { if (sequence === request.current) setError('Não foi possível atualizar seus primeiros passos. Tente novamente.') }
  }, [receive])
  useEffect(() => {
    void refresh()
    const reload = () => { void refresh() }
    const invalidate = () => { request.current += 1 }
    // One aggregate request; reuse mutation events and refresh on return.
    // No new Realtime channels or per-mission queries.
    window.addEventListener(PROFILE_CHANGED, reload); window.addEventListener(FRIENDSHIPS_CHANGED, reload)
    window.addEventListener('focus', reload); document.addEventListener('visibilitychange', reload)
    const timer = window.setInterval(reload, 60_000)
    return () => {
      invalidate(); window.clearInterval(timer)
      window.removeEventListener(PROFILE_CHANGED, reload); window.removeEventListener(FRIENDSHIPS_CHANGED, reload)
      window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload)
    }
  }, [refresh])
  async function save(patch: { goal?: OnboardingGoal; hidden?: boolean }) {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true); const sequence = ++request.current
    try { const data = await loadOnboarding(patch); if (sequence === request.current) receive(data) }
    catch { if (sequence === request.current) setError('Não foi possível salvar sua preferência. Tente novamente.') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const current = snapshot?.user === userId ? snapshot : undefined, state = current?.data
  const loaded = Boolean(state)
  useEffect(() => {
    if (location === 'settings' && loaded && window.location.hash === '#primeiros-passos') {
      document.getElementById('primeiros-passos')?.scrollIntoView({ block: 'start' })
      document.getElementById('first-steps-title')?.focus({ preventScroll: true })
    }
  }, [location, loaded])
  useEffect(() => {
    if (location !== 'dashboard' || !state?.first_completion || state.hidden || acknowledged.current) return
    // A background/aborted read cannot consume the notice. Acknowledge only
    // after the completed card has actually rendered; keep it for this visit.
    acknowledged.current = true
    void loadOnboarding({ seen: true }).catch(() => { acknowledged.current = false })
  }, [location, state])
  const feedback = error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" size="sm" variant="outline" onClick={() => { void refresh() }}>Tentar novamente</Button></div>
  if (!state) return <section className="rounded-2xl border bg-card p-4" aria-label="Primeiros passos no Team Link">{feedback || <p role="status" className="text-sm text-muted-foreground">Carregando primeiros passos…</p>}</section>
  if (location === 'dashboard' && (state.hidden || (state.completed_at && !current.celebrate))) return <div className="space-y-2">{feedback}<Link href={settingsHref} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Sparkles className="size-4" aria-hidden />Ver meus primeiros passos</Link></div>

  const m = state.missions, completed = essentialProgress(state)
  const missions: Mission[] = [
    { id: 'biography', title: 'Apresente-se', description: 'Escreva uma breve descrição sobre você.', action: 'Editar meu perfil', href: editHref + 'profile-bio', done: m.biography, icon: UserRound },
    { id: 'skills', title: 'Adicione suas habilidades', description: 'Mostre o que você sabe fazer.', action: 'Adicionar habilidades', href: editHref + 'profile-skills', done: m.skills, icon: Wrench },
    { id: 'interests', title: 'Escolha seus interesses', description: 'Selecione as áreas e assuntos que despertam seu interesse.', action: 'Adicionar interesses', href: editHref + 'profile-interests', done: m.interests, icon: Compass },
    state.goal === 'create'
      ? { id: 'project', title: 'Crie seu primeiro projeto', description: 'Publique sua ideia e comece a organizar sua equipe.', action: 'Criar projeto', href: '/nova-ideia', done: m.create, icon: Briefcase }
      : { id: 'project', title: 'Candidate-se a um projeto', description: 'Encontre uma equipe e envie sua candidatura. Participações existentes também contam.', action: 'Explorar projetos', href: '/explorar', done: m.participate, icon: Users },
  ]
  const optional: Mission[] = [
    { id: 'photo', title: 'Adicione uma foto de perfil', description: 'Ajude outros integrantes a reconhecer você.', action: 'Adicionar foto', href: editHref + 'profile-photo', done: m.photo, icon: Camera },
    { id: 'connection', title: 'Conecte-se com alguém', description: 'Envie uma solicitação de amizade e comece a construir sua rede.', action: 'Encontrar pessoas', href: '/explorar?conectar=1#encontrar-pessoas', done: m.connection, icon: Users },
  ]
  return <section id="primeiros-passos" aria-labelledby="first-steps-title" className="min-w-0 scroll-mt-36 space-y-4 rounded-2xl border border-card-outline bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 space-y-1"><h2 id="first-steps-title" tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 shrink-0 text-primary" aria-hidden />{completed === 4 ? 'Primeiros passos concluídos' : 'Primeiros passos no Team Link'}</h2><p className="text-sm text-muted-foreground">{completed === 4 ? 'Seu perfil está configurado e você já começou a utilizar o Team Link.' : 'Configure seu perfil e comece a colaborar.'}</p></div>
      {location === 'dashboard' && <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={saving} onClick={() => { void save({ hidden: true }) }}><EyeOff className="size-4" aria-hidden />Ocultar missões</Button>}</div>
    <div className="space-y-2"><p role="status" className="text-sm font-medium">{completed} de 4 missões concluídas · {completed * 25}%</p><div role="progressbar" aria-label="Progresso das missões essenciais" aria-valuemin={0} aria-valuemax={4} aria-valuenow={completed} aria-valuetext={`${completed} de 4 missões concluídas`} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${completed * 25}%` }} /></div></div>
    <fieldset disabled={saving} className="space-y-2"><legend className="mb-2 text-sm font-medium">O que você deseja fazer primeiro?</legend><div className="flex flex-wrap gap-2">{([{ value: 'participate', label: 'Participar de um projeto' }, { value: 'create', label: 'Criar um projeto' }] as const).map(option => <label key={option.value} className={'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-ring ' + (state.goal === option.value ? 'border-primary bg-primary/10 font-medium' : 'border-border')}><input type="radio" name="onboarding-goal" value={option.value} checked={state.goal === option.value} onChange={() => { void save({ goal: option.value }) }} />{option.label}</label>)}</div><p className="text-xs text-muted-foreground">Você pode mudar sua escolha. Isso não limita nenhuma funcionalidade.</p></fieldset>
    {feedback}
    <ul className={'grid min-w-0 gap-3 md:grid-cols-2 ' + (location === 'dashboard' ? 'xl:grid-cols-4' : '')}>{missions.map(mission => <MissionItem key={mission.id} mission={mission} />)}</ul>
    <details className="rounded-xl border border-border p-3"><summary className="min-h-8 cursor-pointer text-sm font-medium">Deixe seu perfil ainda mais completo <span className="text-xs font-normal text-muted-foreground">· Opcional</span></summary><p className="mb-3 mt-2 text-xs text-muted-foreground">Estas duas missões não entram no progresso principal.</p><ul className="grid gap-3 md:grid-cols-2">{optional.map(mission => <MissionItem key={mission.id} mission={mission} optional />)}</ul></details>
    {location === 'settings' && <p className="text-xs text-muted-foreground">Você pode consultar e retomar as missões aqui, mesmo quando estiverem ocultas no Dashboard.</p>}
  </section>
}
