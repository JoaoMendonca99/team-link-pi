'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'

import { AcademicDefaultsFields, PeriodAcademicFields } from './academic-fields'
import { emptyDefaults, periodDraft, periodPayload } from '@/lib/projects/academics'
import { ConceptChipInput } from '@/components/team-link/concept-chip-input'
import { VacancySkillsInput } from './vacancy-skills-input'
import { conceptLabels, legacyConcepts, type ConceptChoice, type ProjectConcepts } from '@/lib/concepts'
import { getSupabaseClient } from '@/lib/supabase/client'
import { ProjectCard } from '@/components/team-link/project-card'
import { FormSection } from '@/components/team-link/form-section'
import type { Vacancy } from '@/components/team-link/recruitment'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { projectCategories } from '@/data/mock-projects'
import {
  PROJECT_STATUS_LABEL, PROJECT_STATUS_OPTIONS, PROJECT_VISIBILITY_LABEL, PROJECT_VISIBILITY_OPTIONS,
} from '@/lib/projects/display'
import { projectFormErrors, projectFormPayload, type VacancyDraft } from '@/lib/projects/form'
import { notifyRecommendations, RECOMMENDATION_ACCESS_CHANGED } from '@/lib/graph/events'
import { saveProjectForm } from '@/lib/projects/save-form'
import { slugify } from '@/lib/projects/slug'
import type { ProjectRow, ProjectStatusValue, ProjectVisibility } from '@/types/database'

const cardClass = 'min-w-0 border-0 bg-transparent p-0 pt-4 sm:p-0 sm:pt-4'

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>
}

export function Choice({ id, value, options, onChange, placeholder, invalid, describedBy }: {
  id: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  placeholder?: string
  invalid?: boolean
  describedBy?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid} aria-describedby={describedBy}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

export function ProjectForm({ project, initialTags = [], initialVacancies = [], previewOwner }: {
  project?: ProjectRow
  initialTags?: string[]
  initialVacancies?: Vacancy[]
  previewOwner?: string
}) {
  const router = useRouter()
  const [context,setContext]=useState('')
  const [academicDefaults,setAcademicDefaults]=useState(emptyDefaults)
  const [firstPeriod,setFirstPeriod]=useState(periodDraft)
  const [title, setTitle] = useState(project?.title ?? '')
  const [category, setCategory] = useState(project?.category ?? '')
  const [secondary, setSecondary] = useState(project?.secondary_categories ?? [])
  const [url, setUrl] = useState(project?.project_url ?? '')
  const [summary, setSummary] = useState(project?.short_description ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [tags, setTags] = useState(initialTags)
  const [tagConcepts,setTagConcepts]=useState<ConceptChoice[]>(()=>legacyConcepts(initialTags))
  const [conceptsReady,setConceptsReady]=useState(!project)
  const [status, setStatus] = useState(project?.status ?? 'open')
  const [visibility, setVisibility] = useState(project?.visibility ?? 'public')
  const [vacancies, setVacancies] = useState<VacancyDraft[]>(() => initialVacancies.map((vacancy) => ({
    ...vacancy, key: vacancy.id, positions: String(vacancy.positions),
    occupied: vacancy.positions - vacancy.available, changed: false,
  })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const initialSnapshot=useRef<string|null>(null),saved=useRef(false)
  const snapshot=JSON.stringify({title,category,secondary,url,summary,description,tags,tagConcepts,status,visibility,vacancies,context,academicDefaults,firstPeriod})
  useEffect(()=>{if(conceptsReady&&initialSnapshot.current===null)initialSnapshot.current=snapshot},[conceptsReady,snapshot])
  const dirty=initialSnapshot.current!==null&&initialSnapshot.current!==snapshot
  useEffect(()=>{
    if(!dirty)return
    const unload=(event:BeforeUnloadEvent)=>{if(!saved.current){event.preventDefault();event.returnValue=''}}
    const navigate=(event:MouseEvent)=>{const a=(event.target as Element).closest?.('a[href]');if(!a||saved.current||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;const href=a.getAttribute('href');if(!href||href.startsWith('#')||a.getAttribute('target')==='_blank'||a.hasAttribute('download'))return;if(!window.confirm('Há alterações não salvas. Deseja sair sem salvar?')){event.preventDefault();event.stopPropagation()}}
    window.addEventListener('beforeunload',unload);document.addEventListener('click',navigate,true)
    return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',navigate,true)}
  },[dirty])
  const slug = project?.slug ?? slugify(title)
  const cancelHref = project ? '/projetos/' + project.slug : '/explorar'
  const categories = project?.category && !projectCategories.includes(project.category)
    ? [...projectCategories, project.category]
    : projectCategories
  const availableCategories = projectCategories.filter((name) => name !== category && !secondary.includes(name))

  useEffect(()=>{
    if(!project?.id)return
    let cancelled=false
    void getSupabaseClient().rpc('get_project_concept_refs',{p_project:project.id}).then(({data,error})=>{
      if(cancelled)return
      if(error||!data){setError('Não foi possível carregar os conceitos. Recarregue a página antes de salvar.');return}
      const refs=data as ProjectConcepts
      setTagConcepts(refs.tags);setTags(conceptLabels(refs.tags))
      setVacancies(current=>current.map(v=>({...v,skillConcepts:refs.vacancies.find(row=>row.id===v.id)?.concepts??legacyConcepts(v.skills)})))
      setConceptsReady(true)
    })
    return()=>{cancelled=true}
  },[project?.id])

  function changeVacancy(key: string, values: Partial<VacancyDraft>) {
    setVacancies((current) => current.map((item) => item.key === key ? { ...item, ...values, changed: true } : item))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !conceptsReady) return
    setError('')
    const values = { title, slug, category, secondary, url, summary, description, tags, tagConcepts, status, visibility, vacancies }
    const validation = projectFormErrors(values)
    if (Object.keys(validation).length) return setError(Object.values(validation)[0])

    setSaving(true)
    try {
      const { data, error: saveError } = await saveProjectForm(projectFormPayload(values, project?.id ?? null), !project&&context?{context,defaults:academicDefaults,period:periodPayload(firstPeriod,academicDefaults)}:null)
      if (saveError) {
        setError(saveError.code === '23505' ? 'Já existe um projeto com esse endereço.'
          : saveError.code === '23514' ? 'Confira os campos do projeto, as datas do período e as vagas.'
          : saveError.message)
        setSaving(false)
        return
      }
      notifyRecommendations(project && (project.visibility!==visibility || project.status!==status) ? RECOMMENDATION_ACCESS_CHANGED : undefined)
      saved.current=true
      router.push('/projetos/' + data)
    } catch {
      setError('Não foi possível salvar agora. Confira sua conexão e tente novamente.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} onInvalidCapture={event=>{const target=event.target as HTMLElement;let parent=target.parentElement;while(parent){if(parent instanceof HTMLDetailsElement)parent.open=true;parent=parent.parentElement}requestAnimationFrame(()=>target.focus())}} className="mx-auto max-w-4xl space-y-6">
      <nav aria-label="Seções do editor" className="flex flex-wrap gap-2">{[['project-information','Informações'],['project-vacancies-section','Vagas'],['project-publication','Publicação']].map(([id,label])=><Button key={id} type="button" variant="outline" size="sm" onClick={()=>{const section=document.getElementById(id);if(section instanceof HTMLDetailsElement)section.open=true;section?.scrollIntoView({block:'start',behavior:'instant'})}}>{label}</Button>)}</nav>
      <p role="status" className="text-xs text-muted-foreground">{dirty?'Alterações não salvas. Salve ao concluir.':'Edite as seções abaixo. As alterações serão aplicadas ao salvar.'}</p>
      <fieldset disabled={saving||!conceptsReady} className="min-w-0 space-y-6">

          <details id="project-information" open className="editor-section scroll-mt-24 rounded-2xl border border-border p-4"><summary className="cursor-pointer font-semibold">Informações do projeto</summary><FormSection className={cardClass} title="Informações principais" description="Apresente seu projeto e ajude outras pessoas a encontrá-lo.">
            <Field id="project-title" label="Título do projeto">
              <Input id="project-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field id="project-slug" label="Endereço da página">
              <Input id="project-slug" readOnly value={slug ? '/projetos/' + slug : ''} placeholder="Gerado a partir do título" />
              {project && <p className="text-xs text-muted-foreground">O endereço permanece fixo para preservar os links compartilhados.</p>}
            </Field>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Field id="project-category" label="Categoria principal">
                <Choice id="project-category" value={category} placeholder="Selecione a principal"
                  options={categories.map((name) => ({ value: name, label: name }))}
                  onChange={(name) => { setCategory(name); setSecondary((current) => current.filter((item) => item !== name)) }} />
              </Field>
              <Field id="project-secondary" label="Categorias secundárias (opcional)">
                {secondary.length < 2 && <Choice id="project-secondary" value="" placeholder="Adicionar categoria"
                  options={availableCategories.map((name) => ({ value: name, label: name }))}
                  onChange={(name) => setSecondary((current) => [...current, name])} />}
                <div className="flex flex-wrap gap-2">
                  {secondary.map((name) => (
                    <Button key={name} type="button" variant="outline" size="sm" className="h-auto whitespace-normal"
                      aria-label={'Remover categoria ' + name}
                      onClick={() => setSecondary((current) => current.filter((item) => item !== name))}>
                      {name}<X aria-hidden className="ml-1 size-3" />
                    </Button>
                  ))}
                </div>
              </Field>
            </div>
            <Field id="project-url" label="Link externo do projeto (opcional)">
              <Input id="project-url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </Field>
            <Field id="project-summary" label="Descrição curta">
              <Textarea id="project-summary" required rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </Field>
            <Field id="project-description" label="Descrição completa">
              <Textarea id="project-description" required rows={7} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <ConceptChipInput disabled={saving||!conceptsReady} label="Tags gerais do projeto" value={tagConcepts} onChange={choices=>{setTagConcepts(choices);setTags(conceptLabels(choices))}}
              helperText="Use assuntos e palavras-chave do projeto." maxItems={10} />
          </FormSection>

          </details>
          {!project&&<FormSection className={cardClass} title="Contexto do projeto" description="Independente das categorias e tags. As informações acadêmicas são opcionais.">
            <label className="block space-y-2 text-sm">Contexto do projeto<select aria-label="Contexto do projeto" className="block w-full rounded-xl border bg-background p-2" value={context} onChange={e=>setContext(e.target.value)}><option value="">Não configurado</option><option value="academic">Acadêmico</option><option value="general">Geral / Profissional</option></select></label>
            {context==='academic'&&<><AcademicDefaultsFields value={academicDefaults} onChange={setAcademicDefaults}/><details><summary className="cursor-pointer font-medium">Primeiro período acadêmico</summary><div className="mt-4 space-y-3"><label className="block text-sm">Nome ou identificação do semestre<Input maxLength={160} placeholder="Período inicial" value={firstPeriod.name} onChange={e=>setFirstPeriod({...firstPeriod,name:e.target.value})}/></label><div className="grid gap-3 sm:grid-cols-2">{(['starts_on','ends_on'] as const).map(key=><label key={key} className="block text-sm">{key==='starts_on'?'Data de início':'Data de término'}<Input type="date" value={firstPeriod[key]} onChange={e=>setFirstPeriod({...firstPeriod,[key]:e.target.value})}/></label>)}</div><PeriodAcademicFields draft={firstPeriod} onChange={setFirstPeriod} defaults={academicDefaults}/><p className="text-xs text-muted-foreground">Este será o período ativo inicial, compartilhado com atividades e relatórios. O módulo de atividades não precisa ser ativado.</p></div></details></>}
          </FormSection>}
          <details id="project-vacancies-section" className="editor-section scroll-mt-24 rounded-2xl border border-border p-4"><summary className="cursor-pointer font-semibold">Vagas · {vacancies.length}</summary><FormSection className={cardClass} title="Vagas do projeto" description="Defina os perfis e as habilidades de cada vaga.">
            <span id="project-vacancies" className="scroll-mt-24" aria-hidden/>
            {vacancies.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma vaga cadastrada.</p>}
            {vacancies.map((vacancy, index) => (
              <details key={vacancy.key} open={!vacancy.id} className="min-w-0 space-y-4 rounded-xl border border-border p-4"><summary className="cursor-pointer break-words font-medium">{vacancy.title.trim() || "Nova vaga"} · {vacancy.open?"Aberta":"Encerrada"}</summary>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="min-w-0 break-words font-semibold">{vacancy.title.trim() || 'Vaga ' + (index + 1)}</h3>
                  {vacancy.id ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => changeVacancy(vacancy.key, { open: !vacancy.open })}>
                      {vacancy.open ? 'Encerrar vaga' : 'Reabrir vaga'}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline"
                      onClick={() => setVacancies((current) => current.filter((item) => item.key !== vacancy.key))}>
                      Remover vaga
                    </Button>
                  )}
                </div>
                <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <Field id={vacancy.key + '-title'} label="Perfil procurado">
                    <Input id={vacancy.key + '-title'} required maxLength={120} value={vacancy.title}
                      onChange={(e) => changeVacancy(vacancy.key, { title: e.target.value })} />
                  </Field>
                  <Field id={vacancy.key + '-positions'} label="Quantidade de posições">
                    <Input id={vacancy.key + '-positions'} type="number" required step={1}
                      min={Math.max(1, vacancy.occupied)} max={1000000} value={vacancy.positions}
                      onChange={(e) => changeVacancy(vacancy.key, { positions: e.target.value })} />
                    <p className="text-xs text-muted-foreground">
                      {vacancy.occupied} ocupadas · {vacancy.open ? Math.max(0, Number(vacancy.positions) - vacancy.occupied) : 0} disponíveis
                    </p>
                  </Field>
                </div>
                <Field id={vacancy.key + '-description'} label="Descrição da vaga">
                  <Textarea id={vacancy.key + '-description'} rows={3} maxLength={4000} value={vacancy.description}
                    onChange={(e) => changeVacancy(vacancy.key, { description: e.target.value })} />
                </Field>
                {conceptsReady && <VacancySkillsInput disabled={saving} value={vacancy.skillConcepts??legacyConcepts(vacancy.skills)}
                  onChange={skillConcepts => changeVacancy(vacancy.key, { skills:conceptLabels(skillConcepts),skillConcepts })} />}
                <Field id={vacancy.key + '-state'} label="Estado da vaga">
                  <Choice id={vacancy.key + '-state'} value={vacancy.open ? 'open' : 'closed'}
                    options={[{ value: 'open', label: 'Aberta' }, { value: 'closed', label: 'Encerrada' }]}
                    onChange={(value) => changeVacancy(vacancy.key, { open: value === 'open' })} />
                </Field>
              </details>
            ))}
            <Button type="button" variant="outline" className="w-fit gap-2"
              onClick={() => setVacancies((current) => [...current, {
                key: crypto.randomUUID(), id: null, title: '', description: '', skills: [],
                positions: '1', occupied: 0, open: true, changed: true,
              }])}>
              <Plus aria-hidden className="size-4" /> Adicionar vaga
            </Button>
          </FormSection>
          </details>
          {!project && (
            <details className="rounded-2xl border border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Prévia do cartão em Explorar</summary>
              <ProjectCard disableLink className="mt-4 max-w-md" project={{
                id: 'preview', slug, title: title.trim() || 'Seu projeto', shortDescription: summary,
                description, category, secondaryCategories: secondary, status, visibility,
                openSpots: status === 'open' ? vacancies.reduce((total, vacancy) =>
                  total + (vacancy.open ? Math.max(0, Number(vacancy.positions) || 0) : 0), 0) : 0,
                desiredProfile: null, projectUrl: null, createdAt: '', updatedAt: '',
                ownerId: '', ownerName: previewOwner ?? 'Você', ownerAvatarUrl: null, ownerCourse: null,
                tags, requiredSkills: [], likesCount: 0, commentsCount: 0, membersCount: 0,
              }} />
            </details>
          )}

        <details id="project-publication" className="editor-section scroll-mt-24 rounded-2xl border border-border p-4"><summary className="cursor-pointer font-semibold">Publicação</summary><section aria-labelledby="project-publishing" className="mt-4 space-y-4">
          <h2 id="project-publishing" className="font-semibold">Configurações de publicação</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="project-status" label="Status do projeto">
              <Choice id="project-status" value={status} onChange={(value) => setStatus(value as ProjectStatusValue)}
                options={PROJECT_STATUS_OPTIONS.filter(value=>project||!['completed','archived'].includes(value)).map((value) => ({ value, label: PROJECT_STATUS_LABEL[value] }))} />
            </Field>
            <Field id="project-visibility" label="Visibilidade">
              <Choice id="project-visibility" value={visibility} onChange={(value) => setVisibility(value as ProjectVisibility)}
                options={PROJECT_VISIBILITY_OPTIONS.map((value) => ({ value, label: PROJECT_VISIBILITY_LABEL[value] }))} />
            </Field>
          </div>
        </section></details>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button asChild variant="outline"><Link href={cancelHref}>Cancelar</Link></Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : project ? 'Salvar alterações' : 'Criar projeto'}</Button>
          </div>
      </fieldset>
    </form>
  )
}
