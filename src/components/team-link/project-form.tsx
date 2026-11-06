'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'

import { AcademicDefaultsFields, PeriodAcademicFields } from './academic-fields'
import { emptyDefaults, periodDraft } from '@/lib/projects/academics'
import { ChipInput } from '@/components/team-link/chip-input'
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
import { parseOptionalProjectUrl } from '@/lib/projects/project-url'
import { slugify } from '@/lib/projects/slug'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { ProjectRow, ProjectStatusValue, ProjectVisibility } from '@/types/database'

type VacancyDraft = Pick<Vacancy, 'title' | 'description' | 'skills' | 'open'> & {
  key: string
  id: string | null
  positions: string
  occupied: number
  changed: boolean
}

const cardClass = 'min-w-0 p-5 sm:p-7'

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>
}

function Choice({ id, value, options, onChange, placeholder }: {
  id: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
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
  const [status, setStatus] = useState(project?.status ?? 'open')
  const [visibility, setVisibility] = useState(project?.visibility ?? 'public')
  const [vacancies, setVacancies] = useState<VacancyDraft[]>(() => initialVacancies.map((vacancy) => ({
    ...vacancy, key: vacancy.id, positions: String(vacancy.positions),
    occupied: vacancy.positions - vacancy.available, changed: false,
  })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const slug = project?.slug ?? slugify(title)
  const cancelHref = project ? '/projetos/' + project.slug : '/explorar'
  const categories = project?.category && !projectCategories.includes(project.category)
    ? [...projectCategories, project.category]
    : projectCategories
  const availableCategories = projectCategories.filter((name) => name !== category && !secondary.includes(name))

  function changeVacancy(key: string, values: Partial<VacancyDraft>) {
    setVacancies((current) => current.map((item) => item.key === key ? { ...item, ...values, changed: true } : item))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError('')
    const parsedUrl = parseOptionalProjectUrl(url)
    if (!slug) return setError('Informe um título que gere um endereço válido.')
    if (!category) return setError('Selecione a categoria principal.')
    if (!parsedUrl.ok) return setError('Informe um link externo válido.')
    if (!summary.trim()) return setError('Preencha a descrição curta.')
    if (!description.trim()) return setError('Preencha a descrição completa.')
    if (!tags.length) return setError('Adicione pelo menos uma tag geral.')

    for (const [index, vacancy] of vacancies.entries()) {
      if (!vacancy.title.trim()) return setError('Informe o perfil procurado na vaga ' + (index + 1) + '.')
      const positions = Number(vacancy.positions)
      if (!Number.isInteger(positions) || positions < Math.max(vacancy.occupied, 1) || positions > 1000000) {
        return setError('Confira a quantidade de posições na vaga ' + (index + 1) + '.')
      }
    }

    setSaving(true)
    try {
      const { data, error: saveError } = await getSupabaseClient().rpc('save_project_form_with_academics', {p_form: {
        p_project_id: project?.id ?? null,
        p_slug: slug,
        p_title: title,
        p_category: category,
        p_secondary_categories: secondary,
        p_project_url: parsedUrl.value,
        p_short_description: summary,
        p_description: description,
        p_status: status,
        p_visibility: visibility,
        p_tags: tags,
        p_vacancies: vacancies.filter((vacancy) => vacancy.changed).map((vacancy) => ({
          id: vacancy.id, title: vacancy.title, description: vacancy.description,
          skills: vacancy.skills, positions: Number(vacancy.positions), open: vacancy.open,
        })),
      },p_academic:!project&&context?{context,defaults:academicDefaults,period:firstPeriod}:null})
      if (saveError) {
        setError(saveError.code === '23505' ? 'Já existe um projeto com esse endereço.'
          : saveError.code === '23514' ? 'Confira os campos do projeto, as datas do período e as vagas.'
          : saveError.message)
        setSaving(false)
        return
      }
      router.push('/projetos/' + data)
    } catch {
      setError('Não foi possível salvar agora. Confira sua conexão e tente novamente.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <fieldset disabled={saving} className="min-w-0 space-y-6">

          <FormSection className={cardClass} title="Informações principais" description="Apresente seu projeto e ajude outras pessoas a encontrá-lo.">
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
            <ChipInput label="Tags gerais do projeto" value={tags} onChange={setTags} placeholder="Digite e pressione Enter"
              helperText="Use assuntos e palavras-chave do projeto." maxItems={10} />
          </FormSection>

          {!project&&<FormSection className={cardClass} title="Contexto do projeto" description="Independente das categorias e tags. As informações acadêmicas são opcionais.">
            <label className="block space-y-2 text-sm">Contexto do projeto<select aria-label="Contexto do projeto" className="block w-full rounded-xl border bg-background p-2" value={context} onChange={e=>setContext(e.target.value)}><option value="">Não configurado</option><option value="academic">Acadêmico</option><option value="general">Geral / Profissional</option></select></label>
            {context==='academic'&&<><AcademicDefaultsFields value={academicDefaults} onChange={setAcademicDefaults}/><details><summary className="cursor-pointer font-medium">Primeiro período acadêmico</summary><div className="mt-4 space-y-3"><label className="block text-sm">Nome ou identificação do semestre<Input maxLength={160} placeholder="Período inicial" value={firstPeriod.name} onChange={e=>setFirstPeriod({...firstPeriod,name:e.target.value})}/></label><div className="grid gap-3 sm:grid-cols-2">{(['starts_on','ends_on'] as const).map(key=><label key={key} className="block text-sm">{key==='starts_on'?'Data de início':'Data de término'}<Input type="date" value={firstPeriod[key]} onChange={e=>setFirstPeriod({...firstPeriod,[key]:e.target.value})}/></label>)}</div><PeriodAcademicFields draft={firstPeriod} onChange={setFirstPeriod} defaults={academicDefaults}/><p className="text-xs text-muted-foreground">Este será o período ativo inicial, compartilhado com atividades e relatórios. O módulo de atividades não precisa ser ativado.</p></div></details></>}
          </FormSection>}
          <FormSection className={cardClass} title="Vagas do projeto" description="Defina os perfis e as habilidades de cada vaga.">
            {vacancies.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma vaga cadastrada.</p>}
            {vacancies.map((vacancy, index) => (
              <section key={vacancy.key} className="min-w-0 space-y-4 rounded-2xl border border-border p-4 sm:p-5">
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
                <ChipInput label="Habilidades desejadas" optional maxItems={30} maxLength={120} value={vacancy.skills}
                  onChange={(skills) => changeVacancy(vacancy.key, { skills })} placeholder="Digite e pressione Enter" />
                <Field id={vacancy.key + '-state'} label="Estado da vaga">
                  <Choice id={vacancy.key + '-state'} value={vacancy.open ? 'open' : 'closed'}
                    options={[{ value: 'open', label: 'Aberta' }, { value: 'closed', label: 'Encerrada' }]}
                    onChange={(value) => changeVacancy(vacancy.key, { open: value === 'open' })} />
                </Field>
              </section>
            ))}
            <Button type="button" variant="outline" className="w-fit gap-2"
              onClick={() => setVacancies((current) => [...current, {
                key: crypto.randomUUID(), id: null, title: '', description: '', skills: [],
                positions: '1', occupied: 0, open: true, changed: true,
              }])}>
              <Plus aria-hidden className="size-4" /> Adicionar vaga
            </Button>
          </FormSection>
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

        <section aria-labelledby="project-publishing" className="space-y-4 border-t border-border px-1 pt-5">
          <h2 id="project-publishing" className="font-semibold">Configurações de publicação</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="project-status" label="Status do projeto">
              <Choice id="project-status" value={status} onChange={(value) => setStatus(value as ProjectStatusValue)}
                options={PROJECT_STATUS_OPTIONS.map((value) => ({ value, label: PROJECT_STATUS_LABEL[value] }))} />
            </Field>
            <Field id="project-visibility" label="Visibilidade">
              <Choice id="project-visibility" value={visibility} onChange={(value) => setVisibility(value as ProjectVisibility)}
                options={PROJECT_VISIBILITY_OPTIONS.map((value) => ({ value, label: PROJECT_VISIBILITY_LABEL[value] }))} />
            </Field>
          </div>
          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button asChild variant="outline"><Link href={cancelHref}>Cancelar</Link></Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : project ? 'Salvar alterações' : 'Criar projeto'}</Button>
          </div>
        </section>
      </fieldset>
    </form>
  )
}
