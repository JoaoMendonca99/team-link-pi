import { projectCategories } from '../../data/mock-projects'
import type { ProjectStatusValue, ProjectVisibility } from '@/types/database'
import { parseOptionalProjectUrl } from './project-url'
import { isValidSlug, slugify } from './slug'
import { emptyDefaults, periodDraft, periodPayload, type AcademicDefaults, type PeriodDraft } from './academics'

export type VacancyDraft = { key: string; id: string | null; title: string; description: string; skills: string[]; positions: string; occupied: number; open: boolean; changed: boolean }
export type ProjectFormValues = { title: string; slug: string; category: string; secondary: string[]; url: string; summary: string; description: string; tags: string[]; status: ProjectStatusValue; visibility: ProjectVisibility; vacancies: VacancyDraft[] }
export type ProjectWizardValues = ProjectFormValues & { context: '' | 'academic' | 'general'; slugEdited: boolean; defaults: AcademicDefaults; period: PeriodDraft; deferVacancies: boolean }
export type ProjectStep = 'type' | 'presentation' | 'classification' | 'academics' | 'period' | 'team' | 'review'
export type FieldErrors = Record<string, string>

export const projectStepLabels: Record<ProjectStep, string> = { type: 'Tipo', presentation: 'Apresentação', classification: 'Classificação', academics: 'Dados acadêmicos', period: 'Primeiro período', team: 'Equipe e vagas', review: 'Revisão' }
export function projectSteps(context: ProjectWizardValues['context']): ProjectStep[] {
  return context === 'academic' ? ['type', 'presentation', 'classification', 'academics', 'period', 'team', 'review'] : ['type', 'presentation', 'classification', 'team', 'review']
}
export function emptyProjectWizard(): ProjectWizardValues {
  return { context: '', title: '', slug: '', slugEdited: false, category: '', secondary: [], url: '', summary: '', description: '', tags: [], status: 'open', visibility: 'public', vacancies: [], deferVacancies: false, defaults: { ...emptyDefaults }, period: periodDraft() }
}
export function changeProjectTitle(values: ProjectWizardValues, title: string): ProjectWizardValues {
  return { ...values, title, slug: values.slugEdited ? values.slug : slugify(title) }
}
export function suggestedPeriodName(period: PeriodDraft) {
  return /^\d{4}$/.test(period.academic_year) && ['1', '2'].includes(period.academic_semester) ? `${period.academic_year}.${period.academic_semester}` : ''
}
export function changeFirstPeriod(current: PeriodDraft, patch: Partial<PeriodDraft>) {
  const automatic = !current.name || current.name === suggestedPeriodName(current)
  const next = { ...current, ...patch }
  return automatic && !('name' in patch) ? { ...next, name: suggestedPeriodName(next) } : next
}

/** Shared with the existing editor. Server validation remains authoritative. */
export function projectFormErrors(values: ProjectFormValues): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.title.trim() || values.title.trim().length > 120) errors['project-title'] = 'Informe um título de até 120 caracteres.'
  if (!isValidSlug(values.slug)) errors['project-slug'] = 'Use letras minúsculas, números e hífens, sem espaços ou hífens nas extremidades.'
  if (!values.summary.trim()) errors['project-summary'] = 'Preencha a descrição curta.'
  if (!values.description.trim()) errors['project-description'] = 'Preencha a descrição completa.'
  if (!values.category) errors['project-category'] = 'Selecione a categoria principal.'
  if (values.secondary.length > 2 || new Set(values.secondary).size !== values.secondary.length || values.secondary.includes(values.category) || values.secondary.some(category => !projectCategories.includes(category))) errors['project-secondary'] = 'Escolha até duas categorias secundárias diferentes da principal.'
  if (!parseOptionalProjectUrl(values.url).ok) errors['project-url'] = 'Informe um link externo válido.'
  if (!values.tags.some(tag => tag.trim())) errors['project-tags'] = 'Adicione pelo menos uma tag geral, conforme a regra de publicação do projeto.'
  for (const [index, vacancy] of values.vacancies.entries()) {
    if (!vacancy.title.trim() || vacancy.title.trim().length > 120) errors[vacancy.key + '-title'] = 'Informe o perfil procurado na vaga ' + (index + 1) + ' (até 120 caracteres).'
    const positions = Number(vacancy.positions)
    if (!Number.isInteger(positions) || positions < Math.max(vacancy.occupied, 1) || positions > 1000000) errors[vacancy.key + '-positions'] = 'Confira a quantidade de posições na vaga ' + (index + 1) + '.'
    if (vacancy.description.length > 4000) errors[vacancy.key + '-description'] = 'A descrição da vaga deve ter até 4000 caracteres.'
  }
  return errors
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function projectStepErrors(step: ProjectStep, values: ProjectWizardValues): FieldErrors {
  const active = values.deferVacancies ? { ...values, vacancies: [] } : values
  const all = projectFormErrors(active)
  const fields: Partial<Record<ProjectStep, string[]>> = { presentation: ['project-title', 'project-slug', 'project-summary', 'project-description'], classification: ['project-category', 'project-secondary', 'project-url', 'project-tags'] }
  if (step === 'type') return values.context ? {} : { 'project-context': 'Escolha o tipo de projeto para continuar.' }
  if (step === 'team') return Object.fromEntries(Object.entries(all).filter(([key]) => values.vacancies.some(v => key.startsWith(v.key + '-'))))
  if (step === 'period' && values.context === 'academic') {
    const errors: FieldErrors = {}, p = values.period
    if (p.academic_year && (!/^\d{4}$/.test(p.academic_year) || Number(p.academic_year) < 1900 || Number(p.academic_year) > 2200)) errors['period-year'] = 'Informe um ano entre 1900 e 2200 ou deixe em branco.'
    if (p.academic_semester && !['1', '2'].includes(p.academic_semester)) errors['period-semester'] = 'Escolha o primeiro ou o segundo semestre.'
    if (p.starts_on && !validDate(p.starts_on)) errors['period-start'] = 'Informe uma data de início válida.'
    if (p.ends_on && !validDate(p.ends_on)) errors['period-end'] = 'Informe uma data de término válida.'
    if (p.starts_on && p.ends_on && p.ends_on < p.starts_on) errors['period-end'] = 'A data de término deve ser igual ou posterior à data de início.'
    if (p.name.trim().length > 160) errors['period-name'] = 'Use até 160 caracteres no nome do período.'
    return errors
  }
  return Object.fromEntries(Object.entries(all).filter(([key]) => fields[step]?.includes(key)))
}
export function projectFormPayload(values: ProjectFormValues, projectId: string | null = null) {
  const url = parseOptionalProjectUrl(values.url)
  return { p_project_id: projectId, p_slug: values.slug, p_title: values.title, p_category: values.category, p_secondary_categories: values.secondary, p_project_url: url.ok ? url.value : null, p_short_description: values.summary, p_description: values.description, p_status: values.status, p_visibility: values.visibility, p_tags: values.tags, p_vacancies: values.vacancies.filter(v => v.changed).map(v => ({ id: v.id, title: v.title, description: v.description, skills: v.skills, positions: Number(v.positions), open: v.open })) }
}
export function projectWizardPayload(values: ProjectWizardValues) {
  return { p_form: projectFormPayload({ ...values, vacancies: values.deferVacancies ? [] : values.vacancies.map(v => ({ ...v, id: null, occupied: 0, changed: true })) }), p_academic: values.context === 'academic' ? { context: values.context, defaults: values.defaults, period: periodPayload(values.period, values.defaults) } : { context: 'general', defaults: { ...emptyDefaults } } }
}

/** An allowlist for a per-user, per-tab draft; never restores IDs or access levels. */
export function restoreProjectWizard(raw: string): ProjectWizardValues | null {
  try {
    if (raw.length > 1_000_000) return null
    const saved = JSON.parse(raw)
    if (saved.version !== 1 || !saved.values || typeof saved.values !== 'object') return null
    const value = saved.values, result = emptyProjectWizard()
    for (const key of ['title', 'slug', 'category', 'url', 'summary', 'description'] as const) if (typeof value[key] === 'string') result[key] = value[key]
    if (value.context === 'academic' || value.context === 'general') result.context = value.context
    if (['open', 'in_progress', 'completed', 'archived'].includes(value.status)) result.status = value.status
    if (['public', 'private'].includes(value.visibility)) result.visibility = value.visibility
    result.slugEdited = value.slugEdited === true; result.deferVacancies = value.deferVacancies === true
    result.tags = Array.isArray(value.tags) ? value.tags.filter((s: unknown): s is string => typeof s === 'string').slice(0, 10) : []
    result.secondary = Array.isArray(value.secondary) ? value.secondary.filter((s: unknown): s is string => typeof s === 'string').slice(0, 2) : []
    for (const key of ['institution', 'course', 'city'] as const) if (typeof value.defaults?.[key] === 'string') result.defaults[key] = value.defaults[key]
    if (typeof value.defaults?.institution_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.defaults.institution_id)) result.defaults.institution_id = value.defaults.institution_id
    for (const key of ['name', 'description', 'starts_on', 'ends_on', 'academic_year', 'academic_semester', 'discipline', 'advisor'] as const) if (typeof value.period?.[key] === 'string') result.period[key] = value.period[key]
    if (Array.isArray(value.vacancies)) result.vacancies = value.vacancies.filter((v: unknown) => v && typeof v === 'object').map((v: Record<string, unknown>, index: number) => ({ key: 'restored-vacancy-' + index, id: null, title: typeof v.title === 'string' ? v.title : '', description: typeof v.description === 'string' ? v.description : '', positions: typeof v.positions === 'string' ? v.positions : '1', skills: Array.isArray(v.skills) ? v.skills.filter((s: unknown): s is string => typeof s === 'string').slice(0, 30) : [], open: v.open !== false, occupied: 0, changed: true }))
    return result
  } catch { return null }
}
