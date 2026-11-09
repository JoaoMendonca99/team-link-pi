'use client'

import Link from 'next/link'
import { ArrowRight, Briefcase, CheckCircle2, Circle, Compass, EyeOff, Sparkles, UserRound, Users, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOnboarding } from '@/hooks/use-onboarding'
import { essentialProgress, introductionMission, showOnboarding } from '@/lib/onboarding'

const editHref = '/meu-espaco/perfil/editar#'
type Mission = { id: string; title: string; description: string; hint?: string; action: string; href: string; done: boolean; icon: typeof UserRound }

function MissionItem({ mission }: { mission: Mission }) {
  const Icon = mission.icon, Status = mission.done ? CheckCircle2 : Circle
  return <li className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3">
    <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
    <div className="min-w-0 flex-1 space-y-1"><h3 className="break-words text-sm font-semibold">{mission.title}</h3>
      <p className="text-xs leading-relaxed text-muted-foreground">{mission.description}</p>
      <p className="flex items-center gap-1.5 text-xs"><Status className="size-3.5 shrink-0" aria-hidden />{mission.done ? 'Concluída' : 'Pendente'}</p>
      {mission.hint && <p className="text-xs font-medium leading-relaxed">{mission.hint}</p>}
      {!mission.done && <Link href={mission.href} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{mission.action}<ArrowRight className="size-3.5" aria-hidden /></Link>}
    </div>
  </li>
}

export function FirstSteps({ userId }: { userId: string }) {
  const { state, saving, error, refresh, save } = useOnboarding(userId)
  // Never render an incomplete card before the aggregate has loaded. Hidden and
  // completed users leave no container, progress, celebration, or residual link.
  if (!state || !showOnboarding(state)) return null
  const m = state.missions, completed = essentialProgress(state), introduction = introductionMission(state)
  const missions: Mission[] = [
    { id: 'introduction', title: 'Apresente-se', description: 'Adicione uma foto de perfil e escreva uma breve descrição sobre você.', hint: introduction.hint, action: 'Completar meu perfil', href: editHref + introduction.anchor, done: introduction.done, icon: UserRound },
    { id: 'skills', title: 'Adicione suas habilidades', description: 'Mostre o que você sabe fazer.', action: 'Adicionar habilidades', href: editHref + 'profile-skills', done: m.skills, icon: Wrench },
    { id: 'interests', title: 'Escolha seus interesses', description: 'Selecione as áreas e assuntos que despertam seu interesse.', action: 'Adicionar interesses', href: editHref + 'profile-interests', done: m.interests, icon: Compass },
    state.goal === 'create'
      ? { id: 'project', title: 'Crie seu primeiro projeto', description: 'Publique sua ideia e comece a organizar sua equipe.', action: 'Criar projeto', href: '/nova-ideia', done: m.create, icon: Briefcase }
      : { id: 'project', title: 'Candidate-se a um projeto', description: 'Encontre uma equipe e envie sua candidatura.', action: 'Explorar projetos', href: '/explorar', done: m.participate, icon: Users },
    { id: 'connection', title: 'Conecte-se com alguém', description: 'Envie uma solicitação de amizade e comece a construir sua rede.', action: 'Encontrar pessoas', href: '/explorar?conectar=1#encontrar-pessoas', done: m.connection, icon: Users },
  ]
  return <section id="primeiros-passos" aria-labelledby="first-steps-title" className="min-w-0 space-y-4 rounded-2xl border border-card-outline bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 space-y-1"><h2 id="first-steps-title" className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="size-5 shrink-0 text-primary" aria-hidden />Primeiros passos no Team Link</h2><p className="text-sm text-muted-foreground">Complete seu perfil e comece a colaborar.</p></div>
      <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={saving} onClick={() => { void save({ hidden: true }) }}><EyeOff className="size-4" aria-hidden />Ocultar missões</Button></div>
    <div className="space-y-2"><p role="status" className="text-sm font-medium">{completed} de 5 missões concluídas · {completed * 20}%</p><div role="progressbar" aria-label="Progresso das missões" aria-valuemin={0} aria-valuemax={5} aria-valuenow={completed} aria-valuetext={`${completed} de 5 missões concluídas`} className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${completed * 20}%` }} /></div></div>
    <fieldset disabled={saving} className="space-y-2"><legend className="mb-2 text-sm font-medium">O que você deseja fazer primeiro?</legend><div className="flex flex-wrap gap-2">{([{ value: 'participate', label: 'Participar de um projeto' }, { value: 'create', label: 'Criar um projeto' }] as const).map(option => <label key={option.value} className={'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-ring ' + (state.goal === option.value ? 'border-primary bg-primary/10 font-medium' : 'border-border')}><input type="radio" name="onboarding-goal" value={option.value} checked={state.goal === option.value} onChange={() => { void save({ goal: option.value }) }} />{option.label}</label>)}</div><p className="text-xs text-muted-foreground">Você pode mudar sua escolha. Isso não limita nenhuma funcionalidade.</p></fieldset>
    {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" size="sm" variant="outline" onClick={() => { void refresh() }}>Tentar novamente</Button></div>}
    <ul className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">{missions.map(mission => <MissionItem key={mission.id} mission={mission} />)}</ul>
  </section>
}
