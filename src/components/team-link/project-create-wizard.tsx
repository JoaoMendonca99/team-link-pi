'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Briefcase, CheckCircle2, GraduationCap, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConceptChipInput } from './concept-chip-input'
import { VacancySkillsInput } from './vacancy-skills-input'
import { conceptLabels, legacyConcepts } from '@/lib/concepts'
import { AcademicDefaultsFields } from './academic-fields'
import { Field, Choice } from './project-form'
import { ProjectCard } from './project-card'
import { projectCategories } from '@/data/mock-projects'
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_OPTIONS, PROJECT_VISIBILITY_LABEL, PROJECT_VISIBILITY_OPTIONS } from '@/lib/projects/display'
import { slugify, isValidSlug } from '@/lib/projects/slug'
import { changeFirstPeriod, changeProjectTitle, emptyProjectWizard, projectStepErrors, projectStepLabels, projectSteps, projectWizardPayload, restoreProjectWizard, type FieldErrors, type ProjectStep, type ProjectWizardValues, type VacancyDraft } from '@/lib/projects/form'
import { ProjectImageField } from './project-image-field'
import type { ProjectImageDraft } from './project-logo'
import { checkProjectSlug, projectSaveError, saveProjectForm } from '@/lib/projects/save-form'
import type { ProfileRow, ProjectStatusValue, ProjectVisibility } from '@/types/database'

const introduction: Record<ProjectStep, [string, string]> = {
  type: ['Qual tipo de projeto você deseja criar?', 'Escolha o tipo de projeto para mostrarmos apenas as informações necessárias.'],
  presentation: ['Vamos apresentar seu projeto', 'Comece pelas informações que ajudam outras pessoas a entender sua ideia.'],
  classification: ['Em qual área seu projeto se encaixa?', 'Ajude outras pessoas a encontrar projetos relacionados aos seus interesses e habilidades.'],
  academics: ['Onde seu projeto está sendo desenvolvido?', 'Instituição e curso pertencem ao projeto. Você não precisará cadastrá-los novamente a cada semestre.'],
  period: ['Em qual período seu projeto começa?', 'Cada semestre poderá ter suas próprias atividades, metas e informações acadêmicas.'],
  team: ['Quem você precisa para desenvolver seu projeto?', 'Você pode definir vagas para sua equipe agora ou fazer isso depois.'],
  review: ['Revise as informações do seu projeto', 'Confira os dados e edite o que precisar. O projeto só será criado ao confirmar abaixo.'],
}
const emptyJSON = JSON.stringify(emptyProjectWizard())

function WizardField({ id, label, hint, errors, children }: { id: string; label: string; hint?: string; errors: FieldErrors; children: ReactNode }) {
  return <Field id={id} label={label}>{children}{hint && <p className="text-xs text-muted-foreground">{hint}</p>}{errors[id] && <p id={id + '-error'} className="text-sm text-destructive">{errors[id]}</p>}</Field>
}
function ReviewBlock({ title, editLabel, onEdit, children }: { title: string; editLabel: string; onEdit: () => void; children: ReactNode }) {
  return <section className="min-w-0 space-y-4 rounded-2xl border p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{title}</h3><Button type="button" variant="outline" className="min-h-11" aria-label={editLabel} onClick={onEdit}>Editar</Button></div>{children}</section>
}
function ReviewValue({ label, children }: { label: string; children?: ReactNode }) {
  return <div className="min-w-0 space-y-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{children || 'Não informado'}</dd></div>
}

export function ProjectCreateWizard({ userId, profile }: { userId: string; profile: Pick<ProfileRow, 'full_name' | 'university' | 'course' | 'institution_id' | 'course_id'> | null }) {
  const router = useRouter()
  const [values, setValues] = useState(emptyProjectWizard)
  const [step, setStep] = useState<ProjectStep>('type')
  const [returnToReview, setReturnToReview] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState<'checking' | 'saving' | null>(null)
  const [ready, setReady] = useState(false)
  const [restored, setRestored] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [success, setSuccess] = useState(false)
  const [availability, setAvailability] = useState<{ slug: string; state: 'checking' | 'available' | 'used' | 'error' }>()
  const heading = useRef<HTMLHeadingElement>(null)
  const progress = useRef<HTMLDivElement>(null)
  const locked = useRef(false)
  const committed = useRef(false)
  const slugCheck = useRef<{ slug: string; promise: Promise<boolean> } | null>(null)
  const key = 'team-link:create-project:v1:' + userId
  const steps = projectSteps(values.context)
  const index = steps.indexOf(step)
  const [image, setImage] = useState<ProjectImageDraft>()
  const [imageProcessing, setImageProcessing] = useState(false)
  const dirty = JSON.stringify(values) !== emptyJSON || Boolean(image)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key), saved = raw ? restoreProjectWizard(raw) : null
      if (saved) {
        const savedStep = JSON.parse(raw!).step as ProjectStep, flow = projectSteps(saved.context)
        const target = flow.includes(savedStep) ? savedStep : 'type'
        const invalid = flow.slice(0, flow.indexOf(target)).find(id => Object.keys(projectStepErrors(id, saved)).length)
        setValues(saved); setStep(invalid ?? target); setRestored(true)
      }
    } catch { setStorageError(true) }
    setReady(true)
  }, [key])
  useEffect(() => {
    if (!ready || committed.current) return
    try { if (dirty) sessionStorage.setItem(key, JSON.stringify({ version: 1, values, step })); else sessionStorage.removeItem(key) }
    catch { setStorageError(true) }
  }, [ready, dirty, key, values, step])
  useEffect(() => {
    if (!dirty) return
    const protect = (event: BeforeUnloadEvent) => { if (!committed.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty])
  useEffect(() => {
    if (!ready) return
    heading.current?.focus({ preventScroll: true })
    progress.current?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [step, ready])

  function update(patch: Partial<ProjectWizardValues>, clear: string[] = []) {
    setValues(current => ({ ...current, ...patch })); setError('')
    setErrors(current => Object.fromEntries(Object.entries(current).filter(([id]) => !clear.includes(id))))
  }
  function changeVacancy(key: string, patch: Partial<VacancyDraft>) {
    update({ vacancies: values.vacancies.map(v => v.key === key ? { ...v, ...patch, changed: true } : v) }, Object.keys(errors).filter(id => id.startsWith(key + '-')))
  }
  function fieldProps(id: string) { return { 'aria-invalid': Boolean(errors[id]), 'aria-describedby': errors[id] ? id + '-error' : undefined } }
  function go(target: ProjectStep, reviewing = false) { setErrors({}); setError(''); setReturnToReview(reviewing); setStep(target) }
  function showErrors(next: FieldErrors, target = step) {
    setErrors(next); setStep(target)
    requestAnimationFrame(() => document.getElementById(Object.keys(next)[0])?.focus())
  }
  async function verifySlug(slug: string) {
    if (!isValidSlug(slug)) return false
    if (slugCheck.current?.slug === slug) return slugCheck.current.promise
    setAvailability({ slug, state: 'checking' })
    const promise = checkProjectSlug(slug).then(available => { setAvailability({ slug, state: available ? 'available' : 'used' }); return available }).catch(reason => { slugCheck.current = null; setAvailability({ slug, state: 'error' }); throw reason })
    slugCheck.current = { slug, promise }
    return promise
  }
  function checkOnBlur() { void verifySlug(values.slug).catch(() => {}) }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (imageProcessing || locked.current || success) return
    const candidate = step === 'team' ? { ...values, deferVacancies: false } : values
    if (step !== 'review') {
      const validation = projectStepErrors(step, candidate)
      if (Object.keys(validation).length) return showErrors(validation)
      locked.current = true
      try {
        if (step === 'presentation') {
          setPending('checking')
          if (!await verifySlug(values.slug)) return showErrors({ 'project-slug': 'Já existe um projeto com esse endereço. Escolha outro.' })
        }
        if (step === 'team') setValues(candidate)
        go(returnToReview ? 'review' : steps[index + 1])
      } catch { setError('Não foi possível verificar o endereço agora. Seus dados foram preservados. Tente novamente.') }
      finally { locked.current = false; setPending(null) }
      return
    }
    for (const id of steps.filter(id => id !== 'review')) {
      const validation = projectStepErrors(id, values)
      if (Object.keys(validation).length) return showErrors(validation, id)
    }
    locked.current = true; setPending('saving'); setError('')
    try {
      const payload = projectWizardPayload(values)
      const { data, error: saveError } = await saveProjectForm(payload.p_form, payload.p_academic, image)
      if (saveError) {
        if (saveError.code === '23505') {
          slugCheck.current = { slug: values.slug, promise: Promise.resolve(false) }
          setAvailability({ slug: values.slug, state: 'used' })
          showErrors({ 'project-slug': 'Esse endereço já está em uso. Escolha outro para criar o projeto.' }, 'presentation')
        } else setError(projectSaveError(saveError))
        return
      }
      if (typeof data !== 'string' || !isValidSlug(data)) throw new Error('Invalid project response')
      committed.current = true
      try { sessionStorage.removeItem(key) } catch { /* Creation succeeded even if browser storage is unavailable. */ }
      setSuccess(true)
      router.push('/projetos/' + data + '/painel')
    } catch { setError(projectSaveError()) }
    finally { if (!committed.current) { locked.current = false; setPending(null) } }
  }
  function resetDraft() {
    if (!window.confirm('Descartar os dados deste rascunho e começar novamente?')) return
    setValues(emptyProjectWizard()); setRestored(false); slugCheck.current = null; setAvailability(undefined); go('type')
  }

  if (!ready) return <p role="status" className="mx-auto max-w-4xl">Recuperando formulário…</p>
  if (success) return <p role="status" className="mx-auto max-w-4xl rounded-2xl border p-6">Projeto criado com sucesso. Abrindo o painel…</p>

  const [title, description] = introduction[step]
  const currentVacancies = values.deferVacancies ? [] : values.vacancies
  const academicSaved = Object.values(values.defaults).some(Boolean) || ['name', 'academic_year', 'academic_semester', 'discipline', 'advisor', 'starts_on', 'ends_on', 'description'].some(key => Boolean(values.period[key as keyof typeof values.period]))
  const period = values.period

  return <form noValidate onSubmit={submit} className="mx-auto max-w-4xl space-y-5" aria-label="Assistente de criação de projeto">
    <div ref={progress} className="scroll-mt-24 space-y-3 rounded-2xl border bg-card/60 p-4 sm:p-5">
      <p className="font-semibold">{values.context === 'academic' ? 'Criar projeto acadêmico' : values.context === 'general' ? 'Criar projeto geral ou profissional' : 'Criar projeto'}</p>
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Etapa {index + 1}{values.context ? ' de ' + steps.length : ''} · {projectStepLabels[step]}</p>
      <div role="progressbar" aria-label="Progresso da criação do projeto" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-valuetext={`Etapa ${index + 1} de ${steps.length}`} className="h-2 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div>
    </div>
    {(restored || dirty) && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><p>{storageError ? 'O navegador não conseguiu guardar o rascunho. Mantenha esta aba aberta.' : restored ? 'Rascunho recuperado. Os dados ficam salvos nesta aba para sua conta.' : 'Rascunho salvo nesta aba para sua conta.'}</p><Button type="button" variant="ghost" size="sm" disabled={Boolean(pending)} onClick={() => { resetDraft(); setImage(undefined) }}>Recomeçar</Button></div>}
    <fieldset disabled={Boolean(pending)} className="min-w-0 space-y-5">
      <section className="min-w-0 rounded-3xl border border-card-outline bg-card/80 p-5 shadow-lg sm:p-7" aria-labelledby="create-step-title">
        <h2 ref={heading} id="create-step-title" tabIndex={-1} className="scroll-mt-28 text-xl font-semibold outline-none sm:text-2xl">{title}</h2>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="min-w-0 space-y-5">
          {step === 'type' && <>
            <fieldset id="project-context" tabIndex={-1}><legend className="sr-only">Tipo de projeto</legend><div className="grid gap-4 sm:grid-cols-2">{([{ context: 'academic', title: 'Projeto acadêmico', text: 'Para trabalhos universitários, projetos integradores, pesquisas e outras atividades acadêmicas.', icon: GraduationCap }, { context: 'general', title: 'Projeto geral ou profissional', text: 'Para projetos pessoais, empresariais, iniciativas independentes e trabalhos colaborativos.', icon: Briefcase }] as const).map(item => <label key={item.context} className="cursor-pointer"><input type="radio" name="project-context" value={item.context} checked={values.context === item.context} onChange={() => update({ context: item.context }, ['project-context'])} className="peer sr-only" aria-labelledby={'type-' + item.context} aria-describedby={'type-' + item.context + '-description'} /><span className={'flex h-full flex-col gap-4 rounded-2xl border-2 p-5 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ring ' + (values.context === item.context ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/60')}><span className="flex items-center justify-between"><item.icon aria-hidden className="size-7 text-primary" />{values.context === item.context && <CheckCircle2 aria-hidden className="size-5 text-primary" />}</span><span id={'type-' + item.context} className="font-semibold">{item.title}</span><span id={'type-' + item.context + '-description'} className="text-sm leading-relaxed text-muted-foreground">{item.text}</span></span></label>)}</div></fieldset>
            {errors['project-context'] && <p role="alert" className="text-sm text-destructive">{errors['project-context']}</p>}
            {values.context === 'general' && academicSaved && <p className="rounded-xl border p-3 text-sm">Os dados acadêmicos foram mantidos no rascunho. Eles não serão enviados em um projeto geral; você pode voltar ao tipo acadêmico para reutilizá-los.</p>}
          </>}

          {step === 'presentation' && <>
            <ProjectImageField title={values.title} value={image} onChange={setImage} onProcessing={setImageProcessing} disabled={Boolean(pending)} />
            <WizardField id="project-title" label="Título do projeto" hint="Escolha um nome que identifique claramente seu projeto." errors={errors}><Input id="project-title" required maxLength={120} value={values.title} {...fieldProps('project-title')} onBlur={checkOnBlur} onChange={e => { setValues(current => changeProjectTitle(current, e.target.value)); setErrors(current => ({ ...current, 'project-title': '', 'project-slug': '' })) }} /></WizardField>
            <WizardField id="project-slug" label="Endereço da página" hint="Use letras minúsculas, números e hífens. O endereço será reservado na criação." errors={errors}><div className="flex min-w-0 items-center gap-2"><span className="shrink-0 text-xs text-muted-foreground">/projetos/</span><Input id="project-slug" required value={values.slug} {...fieldProps('project-slug')} onBlur={checkOnBlur} onChange={e => update({ slug: e.target.value, slugEdited: true }, ['project-slug'])} /></div><Button type="button" variant="ghost" size="sm" onClick={() => update({ slug: slugify(values.title), slugEdited: false }, ['project-slug'])}>Gerar a partir do título</Button>{availability?.slug === values.slug && <p role="status" className={'text-xs ' + (availability.state === 'used' || availability.state === 'error' ? 'text-destructive' : 'text-muted-foreground')}>{({ checking: 'Verificando endereço…', available: 'Endereço disponível na verificação inicial.', used: 'Endereço já utilizado. Escolha outro.', error: 'Não foi possível verificar o endereço. Tente avançar novamente.' })[availability.state]}</p>}</WizardField>
            <WizardField id="project-summary" label="Descrição resumida" hint="Apresentação curta para os cards e resultados públicos." errors={errors}><Textarea id="project-summary" required rows={3} value={values.summary} {...fieldProps('project-summary')} onChange={e => update({ summary: e.target.value }, ['project-summary'])} /></WizardField>
            <WizardField id="project-description" label="Descrição detalhada" hint="Explique o que deseja desenvolver e qual problema o projeto pretende resolver." errors={errors}><Textarea id="project-description" required rows={6} value={values.description} {...fieldProps('project-description')} onChange={e => update({ description: e.target.value }, ['project-description'])} /></WizardField>
          </>}

          {step === 'classification' && <>
            <WizardField id="project-category" label="Categoria principal" hint="Escolha a área principal do projeto, independentemente do tipo acadêmico ou profissional." errors={errors}><Choice id="project-category" value={values.category} placeholder="Selecione a principal" invalid={Boolean(errors['project-category'])} describedBy={errors['project-category'] ? 'project-category-error' : undefined} options={projectCategories.map(value => ({ value, label: value }))} onChange={category => update({ category, secondary: values.secondary.filter(item => item !== category) }, ['project-category', 'project-secondary'])} /></WizardField>
            <WizardField id="project-secondary" label="Categorias secundárias (opcional)" hint="Escolha até duas categorias diferentes da principal." errors={errors}>{values.secondary.length < 2 && <Choice id="project-secondary" value="" placeholder="Adicionar categoria" options={projectCategories.filter(category => category !== values.category && !values.secondary.includes(category)).map(value => ({ value, label: value }))} onChange={category => update({ secondary: [...values.secondary, category] }, ['project-secondary'])} />}<div className="flex flex-wrap gap-2">{values.secondary.map(category => <Button key={category} type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" aria-label={'Remover categoria ' + category} onClick={() => update({ secondary: values.secondary.filter(item => item !== category) }, ['project-secondary'])}>{category}<X aria-hidden className="size-3" /></Button>)}</div></WizardField>
            <ConceptChipInput disabled={Boolean(pending)} inputId="project-tags" label="Tags gerais do projeto" proposalNoun="tag" maxItems={10} value={values.tagConcepts ?? legacyConcepts(values.tags)} onChange={tagConcepts => update({ tags: conceptLabels(tagConcepts), tagConcepts }, ['project-tags'])} helperText={errors['project-tags'] || 'Use ao menos um conceito do projeto. Habilidades específicas ficam nas vagas.'} />
            <WizardField id="project-url" label="Link externo do projeto (opcional)" errors={errors}><Input id="project-url" inputMode="url" placeholder="https://…" value={values.url} {...fieldProps('project-url')} onChange={e => update({ url: e.target.value }, ['project-url'])} /></WizardField>
            <div className="grid gap-4 sm:grid-cols-2"><Field id="project-status" label="Situação inicial"><Choice id="project-status" value={values.status} onChange={status => update({ status: status as ProjectStatusValue })} options={PROJECT_STATUS_OPTIONS.map(value => ({ value, label: PROJECT_STATUS_LABEL[value] }))} /></Field><Field id="project-visibility" label="Visibilidade"><Choice id="project-visibility" value={values.visibility} onChange={visibility => update({ visibility: visibility as ProjectVisibility })} options={PROJECT_VISIBILITY_OPTIONS.map(value => ({ value, label: PROJECT_VISIBILITY_LABEL[value] }))} /></Field></div>
          </>}

          {step === 'academics' && <>
            <p className="text-sm text-muted-foreground">Todos os campos são opcionais. Você poderá completá-los depois.</p>
            <AcademicDefaultsFields value={values.defaults} onChange={defaults => update({ defaults })} />
            {(profile?.university || profile?.course) && <div className="space-y-2 rounded-xl border p-4"><p className="break-words text-sm">No seu perfil: {[profile.university, profile.course].filter(Boolean).join(' · ')}</p><Button type="button" variant="outline" className="min-h-11 whitespace-normal" onClick={() => update({ defaults: { ...values.defaults, institution_id: profile.university ? profile.institution_id ?? null : values.defaults.institution_id, institution: profile.university || values.defaults.institution, course_id: profile.course ? profile.course_id ?? null : values.defaults.course_id, course: profile.course || values.defaults.course } })}>Usar instituição e curso do meu perfil</Button><p className="text-xs text-muted-foreground">Use apenas se estes dados também se aplicarem ao novo projeto. Seu perfil não será alterado.</p></div>}
          </>}

          {step === 'period' && <>
            <div className="grid gap-4 sm:grid-cols-2"><WizardField id="period-year" label="Ano acadêmico (opcional)" errors={errors}><Input id="period-year" type="number" min={1900} max={2200} step={1} placeholder="Ex.: 2026" value={period.academic_year} {...fieldProps('period-year')} onChange={e => update({ period: changeFirstPeriod(period, { academic_year: e.target.value }) }, ['period-year', 'period-name'])} /></WizardField><WizardField id="period-semester" label="Semestre (opcional)" errors={errors}><Choice id="period-semester" value={period.academic_semester || 'pending'} options={[{ value: 'pending', label: 'Definir depois' }, { value: '1', label: 'Primeiro semestre' }, { value: '2', label: 'Segundo semestre' }]} onChange={value => update({ period: changeFirstPeriod(period, { academic_semester: value === 'pending' ? '' : value }) }, ['period-semester', 'period-name'])} /></WizardField></div>
            <WizardField id="period-name" label="Nome do período (opcional)" hint="Sugerido a partir do ano e semestre. Em branco, será usado Período inicial." errors={errors}><Input id="period-name" maxLength={160} placeholder="Ex.: 2026.2" value={period.name} {...fieldProps('period-name')} onChange={e => update({ period: { ...period, name: e.target.value } }, ['period-name'])} /></WizardField>
            <div className="grid gap-4 sm:grid-cols-2"><WizardField id="period-discipline" label="Disciplina (opcional)" errors={errors}><Input id="period-discipline" maxLength={500} placeholder="Ex.: Projeto Integrador III" value={period.discipline} onChange={e => update({ period: { ...period, discipline: e.target.value } })} /></WizardField><WizardField id="period-advisor" label="Professor orientador (opcional)" hint="Informe o orientador deste semestre, se já souber." errors={errors}><Input id="period-advisor" maxLength={500} value={period.advisor} onChange={e => update({ period: { ...period, advisor: e.target.value } })} /></WizardField></div>
            <div className="grid gap-4 sm:grid-cols-2"><WizardField id="period-start" label="Data de início (opcional)" errors={errors}><Input id="period-start" type="date" value={period.starts_on} {...fieldProps('period-start')} onChange={e => update({ period: { ...period, starts_on: e.target.value } }, ['period-start', 'period-end'])} /></WizardField><WizardField id="period-end" label="Data de término (opcional)" errors={errors}><Input id="period-end" type="date" value={period.ends_on} {...fieldProps('period-end')} onChange={e => update({ period: { ...period, ends_on: e.target.value } }, ['period-end'])} /></WizardField></div>
            <WizardField id="period-description" label="Observações do período (opcional)" errors={errors}><Textarea id="period-description" rows={3} maxLength={4000} value={period.description} onChange={e => update({ period: { ...period, description: e.target.value } })} /></WizardField>
            <p className="rounded-xl border p-3 text-xs leading-relaxed text-muted-foreground">Este será o período ativo inicial, compartilhado por atividades, metas e relatórios. Instituição, curso e cidade serão reaproveitados dos dados gerais do projeto.</p>
          </>}

          {step === 'team' && <>
            <p className="text-sm text-muted-foreground">Você será registrado com as permissões de criador. Não é preciso adicionar integrantes agora.</p>
            {values.deferVacancies && values.vacancies.length > 0 && <p className="rounded-xl border p-3 text-sm">Estas vagas ficaram no rascunho, mas não serão criadas se você escolher configurar depois. Use Próximo passo para incluí-las.</p>}
            {!values.vacancies.length && <p className="text-sm">Nenhuma vaga inicial. Você pode começar sem vagas.</p>}
            {values.vacancies.map((vacancy, at) => <section key={vacancy.key} className="min-w-0 space-y-4 rounded-2xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="break-words font-semibold">{vacancy.title.trim() || 'Vaga ' + (at + 1)}</h3><Button type="button" variant="outline" className="min-h-11" aria-label={'Remover vaga ' + (at + 1)} onClick={() => update({ vacancies: values.vacancies.filter(v => v.key !== vacancy.key) })}>Remover vaga</Button></div><div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><WizardField id={vacancy.key + '-title'} label="Perfil procurado" errors={errors}><Input id={vacancy.key + '-title'} maxLength={120} placeholder="Ex.: Pesquisa, Design ou Engenharia" value={vacancy.title} {...fieldProps(vacancy.key + '-title')} onChange={e => changeVacancy(vacancy.key, { title: e.target.value })} /></WizardField><WizardField id={vacancy.key + '-positions'} label="Quantidade de posições" errors={errors}><Input id={vacancy.key + '-positions'} type="number" min={1} max={1000000} step={1} value={vacancy.positions} {...fieldProps(vacancy.key + '-positions')} onChange={e => changeVacancy(vacancy.key, { positions: e.target.value })} /></WizardField></div><WizardField id={vacancy.key + '-description'} label="Descrição da vaga (opcional)" errors={errors}><Textarea id={vacancy.key + '-description'} rows={3} maxLength={4000} value={vacancy.description} onChange={e => changeVacancy(vacancy.key, { description: e.target.value })} /></WizardField><VacancySkillsInput disabled={Boolean(pending)} label={'Habilidades desejadas da vaga ' + (at + 1)} value={vacancy.skillConcepts ?? legacyConcepts(vacancy.skills)} onChange={skillConcepts => changeVacancy(vacancy.key, { skills: conceptLabels(skillConcepts), skillConcepts })} /><Field id={vacancy.key + '-state'} label="Estado da vaga"><Choice id={vacancy.key + '-state'} value={vacancy.open ? 'open' : 'closed'} options={[{ value: 'open', label: 'Aberta' }, { value: 'closed', label: 'Encerrada' }]} onChange={value => changeVacancy(vacancy.key, { open: value === 'open' })} /></Field></section>)}
            <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => update({ deferVacancies: false, vacancies: [...values.vacancies, { key: crypto.randomUUID(), id: null, title: '', description: '', skills: [], positions: '1', occupied: 0, open: true, changed: true }] })}><Plus aria-hidden className="size-4" />Adicionar vaga</Button>
          </>}

          {step === 'review' && <>
            <ReviewBlock title="Tipo de projeto" editLabel="Editar tipo de projeto" onEdit={() => go('type')}><p className="text-sm">{values.context === 'academic' ? 'Acadêmico' : 'Geral / Profissional'}</p></ReviewBlock>
            <ReviewBlock title="Apresentação" editLabel="Editar apresentação" onEdit={() => go('presentation', true)}><dl className="space-y-4"><ReviewValue label="Título">{values.title}</ReviewValue><ReviewValue label="Endereço">{'/projetos/' + values.slug}</ReviewValue><ReviewValue label="Descrição resumida">{values.summary}</ReviewValue><ReviewValue label="Descrição detalhada">{values.description}</ReviewValue></dl></ReviewBlock>
            <ReviewBlock title="Classificação e publicação" editLabel="Editar classificação" onEdit={() => go('classification', true)}><dl className="grid gap-4 sm:grid-cols-2"><ReviewValue label="Categoria principal">{values.category}</ReviewValue><ReviewValue label="Categorias secundárias">{values.secondary.join(', ')}</ReviewValue><ReviewValue label="Tags gerais">{values.tags.join(', ')}</ReviewValue><ReviewValue label="Link externo">{values.url}</ReviewValue><ReviewValue label="Situação">{PROJECT_STATUS_LABEL[values.status]}</ReviewValue><ReviewValue label="Visibilidade">{PROJECT_VISIBILITY_LABEL[values.visibility]}</ReviewValue></dl></ReviewBlock>
            {values.context === 'academic' && <>
              <ReviewBlock title="Informações acadêmicas gerais" editLabel="Editar dados acadêmicos" onEdit={() => go('academics', true)}><dl className="grid gap-4 sm:grid-cols-3">{(['institution', 'course', 'city'] as const).map(key => <ReviewValue key={key} label={{ institution: 'Instituição', course: 'Curso', city: 'Cidade' }[key]}>{values.defaults[key]}</ReviewValue>)}</dl></ReviewBlock>
              <ReviewBlock title="Primeiro período acadêmico" editLabel="Editar primeiro período" onEdit={() => go('period', true)}><dl className="grid gap-4 sm:grid-cols-2"><ReviewValue label="Período ativo inicial">{period.name || 'Período inicial'}</ReviewValue><ReviewValue label="Ano e semestre">{[period.academic_year, period.academic_semester && (period.academic_semester === '1' ? 'Primeiro semestre' : 'Segundo semestre')].filter(Boolean).join(' · ')}</ReviewValue><ReviewValue label="Disciplina">{period.discipline}</ReviewValue><ReviewValue label="Professor orientador">{period.advisor}</ReviewValue><ReviewValue label="Data de início">{period.starts_on}</ReviewValue><ReviewValue label="Data de término">{period.ends_on}</ReviewValue><ReviewValue label="Observações">{period.description}</ReviewValue></dl></ReviewBlock>
            </>}
            <ReviewBlock title="Equipe e vagas" editLabel="Editar equipe e vagas" onEdit={() => go('team', true)}>{currentVacancies.length ? <ul className="space-y-4">{currentVacancies.map(v => <li key={v.key} className="space-y-1 break-words text-sm"><p className="font-semibold">{v.title} · {v.positions} posições · {v.open ? 'Aberta' : 'Encerrada'}</p><p className="whitespace-pre-wrap">{v.description || 'Sem descrição adicional.'}</p><p>Habilidades: {v.skills.join(', ') || 'Não informadas'}</p></li>)}</ul> : <p className="text-sm">Sem vagas iniciais. Você poderá configurá-las depois pelo gerenciamento do projeto.</p>}</ReviewBlock>
            <details className="rounded-2xl border p-4"><summary className="cursor-pointer text-sm font-medium">Prévia do cartão em Projetos publicados</summary><ProjectCard preview draft={image} className="mt-4 max-w-md" project={{ id: 'preview', slug: values.slug, title: values.title, shortDescription: values.summary, description: values.description, category: values.category, secondaryCategories: values.secondary, status: values.status, visibility: values.visibility, openSpots: values.status === 'open' ? currentVacancies.reduce((sum, v) => sum + (v.open ? Number(v.positions) : 0), 0) : 0, desiredProfile: null, projectUrl: null, createdAt: '', updatedAt: '', ownerId: '', ownerName: profile?.full_name || 'Você', ownerAvatarUrl: null, ownerCourse: null, tags: values.tags, requiredSkills: [], likesCount: 0, commentsCount: 0, membersCount: 0 }} /></details>
          </>}
        </div>
      </section>
      {error && <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
      <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex gap-3">{index > 0 ? <Button type="button" variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => go(steps[index - 1])}>Voltar</Button> : <Button asChild variant="outline" className="min-h-11"><Link href="/explorar">Cancelar</Link></Button>}</div>
        <div className="flex flex-col gap-3 sm:flex-row">{step === 'team' && <Button type="button" variant="outline" className="min-h-11 whitespace-normal" onClick={() => { setValues(current => ({ ...current, deferVacancies: true })); go('review') }}>Configurar vagas depois</Button>}<Button type="submit" className="min-h-11" disabled={imageProcessing}>{pending === 'saving' ? 'Criando projeto…' : pending === 'checking' ? 'Verificando endereço…' : step === 'review' ? 'Criar projeto' : returnToReview ? 'Voltar à revisão' : 'Próximo passo'}</Button></div>
      </div>
    </fieldset>
  </form>
}
