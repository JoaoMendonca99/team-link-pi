'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Construction } from 'lucide-react'

import { ChipInput } from '@/components/team-link/chip-input'
import { Container } from '@/components/layout/container'
import { EmptyState } from '@/components/team-link/empty-state'
import { FormSection } from '@/components/team-link/form-section'
import { PageHeader } from '@/components/team-link/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { projectCategories } from '@/data/mock-projects'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_OPTIONS,
  PROJECT_VISIBILITY_LABEL,
  PROJECT_VISIBILITY_OPTIONS,
} from '@/lib/projects/display'
import type {
  ProjectRow,
  ProjectStatusValue,
  ProjectVisibility,
} from '@/types/database'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type FormErrorField =
  | 'title'
  | 'category'
  | 'shortDescription'
  | 'fullDescription'
  | 'spots'
  | 'profileSeek'
  | 'tags'

type FormErrors = Partial<Record<FormErrorField, string>>

const FIELD_ORDER: FormErrorField[] = [
  'title',
  'category',
  'shortDescription',
  'fullDescription',
  'spots',
  'profileSeek',
  'tags',
]

export function ProjectEditorClient({ slug }: { slug: string }) {
  const router = useRouter()
  const { loading: sessionLoading, isAuthenticated, user } = useSupabaseSession()

  // Snapshot do projeto carregado (id, slug original, owner_id...)
  const [project, setProject] = useState<ProjectRow | null>(null)
  const [canEdit, setCanEdit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  // Form state
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [fullDescription, setFullDescription] = useState('')
  const [status, setStatus] = useState<ProjectStatusValue>('open')
  const [visibility, setVisibility] = useState<ProjectVisibility>('public')
  const [spots, setSpots] = useState('1')
  const [profileSeek, setProfileSeek] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])

  // Snapshot dos chips ao carregar — usado para gerar diff no save
  const [originalSkills, setOriginalSkills] = useState<string[]>([])
  const [originalTags, setOriginalTags] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [formErrors, setFormErrors] = useState<FormErrors>({})

  // -------------------------------------------------------------------------
  // Carregamento
  // -------------------------------------------------------------------------

  const loadProject = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setEnvMissing(true)
      setLoading(false)
      return
    }
    if (!user) return
    setLoading(true)
    setFetchError(null)
    setNotFound(false)
    try {
      const client = getSupabaseClient()
      const bySlug = await client
        .from('projects')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (bySlug.error) throw bySlug.error

      let row: ProjectRow | null = (bySlug.data as ProjectRow | null) ?? null

      if (!row && UUID_RE.test(slug)) {
        const byId = await client
          .from('projects')
          .select('*')
          .eq('id', slug)
          .maybeSingle()
        if (byId.error) throw byId.error
        row = (byId.data as ProjectRow | null) ?? null
      }

      if (!row) {
        setNotFound(true)
        return
      }

      const projectRow = row

      // Permissão: dono OU admin/owner em project_members.
      let editAllowed = projectRow.owner_id === user.id
      if (!editAllowed) {
        const membership = await client
          .from('project_members')
          .select('role, status')
          .eq('project_id', projectRow.id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle()
        if (
          !membership.error &&
          membership.data &&
          (membership.data.role === 'owner' || membership.data.role === 'admin')
        ) {
          editAllowed = true
        }
      }

      // Carrega tags e skills em paralelo
      const [tagsRes, skillsRes] = await Promise.all([
        client.from('project_tags').select('tag').eq('project_id', projectRow.id),
        client
          .from('project_required_skills')
          .select('skill')
          .eq('project_id', projectRow.id),
      ])

      const loadedTags =
        (tagsRes.data ?? [])
          .map((entry) => (typeof entry.tag === 'string' ? entry.tag : ''))
          .filter(Boolean)
      const loadedSkills =
        (skillsRes.data ?? [])
          .map((entry) => (typeof entry.skill === 'string' ? entry.skill : ''))
          .filter(Boolean)

      setProject(projectRow)
      setCanEdit(editAllowed)
      setTitle(projectRow.title)
      setCategory(projectRow.category ?? '')
      setShortDescription(projectRow.short_description ?? '')
      setFullDescription(projectRow.description ?? '')
      setStatus(projectRow.status)
      setVisibility(projectRow.visibility)
      setSpots(String(projectRow.open_spots ?? 1))
      setProfileSeek(projectRow.desired_profile ?? '')
      setTags(loadedTags)
      setSkills(loadedSkills)
      setOriginalTags(loadedTags)
      setOriginalSkills(loadedSkills)
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar este projeto agora.',
      )
    } finally {
      setLoading(false)
    }
  }, [slug, user])

  useEffect(() => {
    void loadProject()
  }, [loadProject])

  // -------------------------------------------------------------------------
  // Validação
  // -------------------------------------------------------------------------

  function validateForm(): FormErrors {
    const errors: FormErrors = {}
    if (!title.trim()) errors.title = 'Preencha o título do projeto.'
    if (!category) errors.category = 'Selecione uma categoria.'
    if (!shortDescription.trim()) errors.shortDescription = 'Informe uma descrição curta.'
    if (!fullDescription.trim()) errors.fullDescription = 'Descreva o projeto com mais detalhes.'

    const parsedSpots = Number.parseInt(spots, 10)
    if (!Number.isFinite(parsedSpots) || parsedSpots < 1) {
      errors.spots = 'Informe pelo menos uma vaga em aberto.'
    }
    if (!profileSeek.trim()) errors.profileSeek = 'Descreva o perfil que você procura.'
    if (tags.length === 0) errors.tags = 'Adicione pelo menos uma tag.'
    return errors
  }

  function clearFieldError(field: FormErrorField) {
    setFormErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function focusFirstError(errors: FormErrors) {
    const firstField = FIELD_ORDER.find((field) => Boolean(errors[field]))
    if (!firstField) return
    const target = document.querySelector<HTMLElement>(`[data-field="${firstField}"]`)
    if (!target) return
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const focusable = target.querySelector<HTMLElement>(
      'input, textarea, [role="combobox"], button',
    )
    focusable?.focus({ preventScroll: true })
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!project || !user || !canEdit) {
      setErrorMessage('Você não tem permissão para editar este projeto.')
      return
    }
    if (envMissing) {
      setErrorMessage('Não foi possível conectar ao serviço de dados. Tente novamente em instantes.')
      return
    }

    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      window.setTimeout(() => focusFirstError(errors), 50)
      return
    }
    setFormErrors({})

    const parsedSpots = Number.parseInt(spots, 10)
    const safeSpots = Number.isFinite(parsedSpots) && parsedSpots > 0 ? parsedSpots : 1

    setSubmitting(true)
    try {
      const client = getSupabaseClient()

      const updates = {
        title: title.trim(),
        short_description: shortDescription.trim(),
        description: fullDescription.trim(),
        category,
        status,
        visibility,
        open_spots: safeSpots,
        desired_profile: profileSeek.trim(),
      }

      const projectsResult = await client
        .from('projects')
        .update(updates)
        .eq('id', project.id)

      if (projectsResult.error) {
        console.error('[project-editor] update projects', {
          projectId: project.id,
          message: projectsResult.error.message,
          details: projectsResult.error.details,
          hint: projectsResult.error.hint,
          code: projectsResult.error.code,
          raw: projectsResult.error,
        })
        setErrorMessage('Não foi possível salvar as alterações agora.')
        return
      }

      // Reconciliação de tags
      const tagsToRemove = originalTags.filter((tag) => !tags.includes(tag))
      const tagsToAdd = tags.filter((tag) => !originalTags.includes(tag))

      if (tagsToRemove.length > 0) {
        const deleteRes = await client
          .from('project_tags')
          .delete()
          .eq('project_id', project.id)
          .in('tag', tagsToRemove)
        if (deleteRes.error) {
          console.error('[project-editor] delete tags', deleteRes.error)
          setErrorMessage('Não foi possível salvar as alterações agora.')
          return
        }
      }
      if (tagsToAdd.length > 0) {
        const insertRes = await client.from('project_tags').insert(
          tagsToAdd.map((tag) => ({ project_id: project.id, tag })),
        )
        if (insertRes.error) {
          console.error('[project-editor] insert tags', insertRes.error)
          setErrorMessage('Não foi possível salvar as alterações agora.')
          return
        }
      }

      // Reconciliação de habilidades
      const skillsToRemove = originalSkills.filter((skill) => !skills.includes(skill))
      const skillsToAdd = skills.filter((skill) => !originalSkills.includes(skill))

      if (skillsToRemove.length > 0) {
        const deleteRes = await client
          .from('project_required_skills')
          .delete()
          .eq('project_id', project.id)
          .in('skill', skillsToRemove)
        if (deleteRes.error) {
          console.error('[project-editor] delete skills', deleteRes.error)
          setErrorMessage('Não foi possível salvar as alterações agora.')
          return
        }
      }
      if (skillsToAdd.length > 0) {
        const insertRes = await client.from('project_required_skills').insert(
          skillsToAdd.map((skill) => ({ project_id: project.id, skill })),
        )
        if (insertRes.error) {
          console.error('[project-editor] insert skills', insertRes.error)
          setErrorMessage('Não foi possível salvar as alterações agora.')
          return
        }
      }

      setSuccessMessage('Projeto atualizado com sucesso.')
      // Pequena pausa para o usuário ver o feedback, depois redireciona.
      window.setTimeout(() => {
        router.push(`/projetos/${project.slug}`)
      }, 700)
    } catch (error) {
      console.error('[project-editor] save failed', error)
      setErrorMessage('Não foi possível salvar as alterações agora.')
    } finally {
      setSubmitting(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const headerHref = project ? `/projetos/${project.slug}` : '/meus-projetos'

  const hasAnyError = useMemo(
    () => Object.keys(formErrors).length > 0,
    [formErrors],
  )

  if (sessionLoading || loading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-1/2 rounded-2xl bg-muted" />
            <div className="h-64 rounded-3xl bg-muted" />
            <div className="h-64 rounded-3xl bg-muted" />
          </div>
        </Container>
      </main>
    )
  }

  if (envMissing) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <EmptyState
            icon={Construction}
            title="Não foi possível abrir este projeto"
            description="Tente novamente em instantes. Se o problema continuar, volte para os seus projetos."
            actionLabel="Voltar para Meus projetos"
            href="/meus-projetos"
          />
        </Container>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <PageHeader
            title="Acesso necessário"
            description="Entre com sua conta para editar este projeto."
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-2xl font-semibold">
              <Link href="/login">Ir para login</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  if (fetchError) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-destructive">
              Não foi possível carregar este projeto.
            </p>
            <Button
              onClick={() => void loadProject()}
              className="mt-4 rounded-2xl font-semibold"
            >
              Tentar novamente
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  if (notFound || !project) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <EmptyState
            icon={Construction}
            title="Projeto não encontrado"
            description="O endereço acessado não corresponde a um projeto disponível ou foi removido."
            actionLabel="Voltar para Meus projetos"
            href="/meus-projetos"
          />
        </Container>
      </main>
    )
  }

  if (!canEdit) {
    return (
      <main className="bg-background pb-20">
        <div className="border-b border-border bg-gradient-to-b from-muted/50 to-transparent">
          <Container className="space-y-6 py-14">
            <Button asChild variant="ghost" className="w-fit gap-2 rounded-2xl font-semibold">
              <Link href={headerHref}>
                <ArrowLeft className="h-4 w-4" />
                Voltar ao projeto
              </Link>
            </Button>
            <PageHeader
              eyebrow="Editar projeto"
              title="Você não tem permissão para editar este projeto."
              description="Apenas a pessoa que publicou ou um administrador da equipe pode alterar as informações."
            />
            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-2xl font-semibold">
                <Link href={headerHref}>Voltar para o projeto</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-2xl font-semibold">
                <Link href="/meus-projetos">Ir para Meus projetos</Link>
              </Button>
            </div>
          </Container>
        </div>
      </main>
    )
  }

  return (
    <main className="bg-background pb-20">
      <div className="border-b border-border bg-gradient-to-br from-muted/60 via-background to-background">
        <Container className="space-y-8 py-14">
          <Button asChild variant="ghost" className="w-fit gap-2 rounded-2xl font-semibold">
            <Link href={headerHref}>
              <ArrowLeft className="h-4 w-4" />
              Voltar ao projeto
            </Link>
          </Button>

          <PageHeader
            eyebrow="Editar projeto"
            title={project.title || 'Editar projeto'}
            description="Atualize as informações públicas do projeto."
          />
        </Container>
      </div>

      <Container size="article" className="py-12">
        <form className="space-y-8" onSubmit={handleSubmit} noValidate>
          <FormSection
            title="Informações principais"
            description="Como o projeto se apresenta para quem visita a página."
          >
            <div className="space-y-3" data-field="title">
              <Label htmlFor="edit-title">Título</Label>
              <Input
                id="edit-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  clearFieldError('title')
                }}
                placeholder="Um nome curto e fácil de lembrar"
                maxLength={120}
                aria-invalid={Boolean(formErrors.title)}
                aria-describedby={formErrors.title ? 'edit-title-error' : undefined}
                className="rounded-2xl"
              />
              {formErrors.title ? (
                <p id="edit-title-error" className="text-xs font-medium text-destructive">
                  {formErrors.title}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Endereço público:{' '}
                  <span className="font-mono">/projetos/{project.slug}</span>
                </p>
              )}
            </div>

            <div className="space-y-3" data-field="category">
              <Label htmlFor="edit-category">Categoria</Label>
              <Select
                value={category}
                onValueChange={(value) => {
                  setCategory(value)
                  clearFieldError('category')
                }}
              >
                <SelectTrigger
                  id="edit-category"
                  className="rounded-2xl"
                  aria-invalid={Boolean(formErrors.category)}
                  aria-describedby={
                    formErrors.category ? 'edit-category-error' : undefined
                  }
                >
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {projectCategories.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formErrors.category ? (
                <p id="edit-category-error" className="text-xs font-medium text-destructive">
                  {formErrors.category}
                </p>
              ) : null}
            </div>

            <div className="space-y-3" data-field="shortDescription">
              <Label htmlFor="edit-short">Descrição curta</Label>
              <Textarea
                id="edit-short"
                rows={4}
                value={shortDescription}
                onChange={(event) => {
                  setShortDescription(event.target.value)
                  clearFieldError('shortDescription')
                }}
                placeholder="Resumo direto: o problema, para quem é e o que o projeto pretende entregar."
                aria-invalid={Boolean(formErrors.shortDescription)}
                aria-describedby={
                  formErrors.shortDescription ? 'edit-short-error' : undefined
                }
                className="rounded-2xl"
              />
              {formErrors.shortDescription ? (
                <p id="edit-short-error" className="text-xs font-medium text-destructive">
                  {formErrors.shortDescription}
                </p>
              ) : null}
            </div>

            <div className="space-y-3" data-field="fullDescription">
              <Label htmlFor="edit-full">Descrição completa</Label>
              <Textarea
                id="edit-full"
                rows={8}
                value={fullDescription}
                onChange={(event) => {
                  setFullDescription(event.target.value)
                  clearFieldError('fullDescription')
                }}
                placeholder="Detalhe contexto, etapas previstas, recursos necessários e o que você espera construir junto."
                aria-invalid={Boolean(formErrors.fullDescription)}
                aria-describedby={
                  formErrors.fullDescription ? 'edit-full-error' : undefined
                }
                className="rounded-2xl"
              />
              {formErrors.fullDescription ? (
                <p id="edit-full-error" className="text-xs font-medium text-destructive">
                  {formErrors.fullDescription}
                </p>
              ) : null}
            </div>
          </FormSection>

          <FormSection
            title="Vagas e habilidades"
            description="Quem pode contribuir e o que você espera dessa pessoa."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3" data-field="spots">
                <Label htmlFor="edit-spots">Vagas em aberto</Label>
                <Input
                  id="edit-spots"
                  type="number"
                  min={1}
                  value={spots}
                  onChange={(event) => {
                    setSpots(event.target.value)
                    clearFieldError('spots')
                  }}
                  aria-invalid={Boolean(formErrors.spots)}
                  aria-describedby={formErrors.spots ? 'edit-spots-error' : undefined}
                  className="rounded-2xl"
                />
                {formErrors.spots ? (
                  <p id="edit-spots-error" className="text-xs font-medium text-destructive">
                    {formErrors.spots}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="space-y-3" data-field="profileSeek">
              <Label htmlFor="edit-profile">Perfil procurado</Label>
              <Textarea
                id="edit-profile"
                rows={6}
                value={profileSeek}
                onChange={(event) => {
                  setProfileSeek(event.target.value)
                  clearFieldError('profileSeek')
                }}
                placeholder="Disponibilidade esperada, ritmo de trabalho, tecnologias envolvidas e responsabilidades."
                aria-invalid={Boolean(formErrors.profileSeek)}
                aria-describedby={
                  formErrors.profileSeek ? 'edit-profile-error' : undefined
                }
                className="rounded-2xl"
              />
              {formErrors.profileSeek ? (
                <p id="edit-profile-error" className="text-xs font-medium text-destructive">
                  {formErrors.profileSeek}
                </p>
              ) : null}
            </div>

            <ChipInput
              label="Habilidades desejadas"
              value={skills}
              onChange={setSkills}
              placeholder="Ex.: React, design, comunicação..."
              helperText="Adicione habilidades importantes para quem se juntar ao projeto. Pressione Enter para incluir cada uma."
            />
          </FormSection>

          <FormSection
            title="Organização"
            description="Como o projeto aparece em buscas e como ele é apresentado."
          >
            <div className="space-y-3" data-field="tags">
              <ChipInput
                label="Tags"
                value={tags}
                onChange={(next) => {
                  const normalized = Array.from(
                    new Set(
                      next.map((value) => value.trim().toLowerCase()).filter(Boolean),
                    ),
                  )
                  setTags(normalized)
                  if (normalized.length > 0) clearFieldError('tags')
                }}
                placeholder="Ex.: educação, sustentabilidade, robótica..."
                helperText="Use palavras-chave para ajudar outras pessoas a encontrarem este projeto."
              />
              {formErrors.tags ? (
                <p id="edit-tags-error" className="text-xs font-medium text-destructive">
                  {formErrors.tags}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3">
                <Label htmlFor="edit-status">Status do projeto</Label>
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as ProjectStatusValue)}
                >
                  <SelectTrigger id="edit-status" className="rounded-2xl">
                    <SelectValue placeholder="Selecione um status" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {PROJECT_STATUS_LABEL[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label htmlFor="edit-visibility">Visibilidade</Label>
                <Select
                  value={visibility}
                  onValueChange={(value) => setVisibility(value as ProjectVisibility)}
                >
                  <SelectTrigger id="edit-visibility" className="rounded-2xl">
                    <SelectValue placeholder="Selecione a visibilidade" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_VISIBILITY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {PROJECT_VISIBILITY_LABEL[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </FormSection>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              {errorMessage}
            </div>
          ) : null}

          {hasAnyError ? (
            <div
              role="alert"
              className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
            >
              Revise os campos destacados antes de salvar.
            </div>
          ) : null}

          {successMessage ? (
            <div
              role="status"
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300"
            >
              {successMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild type="button" variant="outline" className="rounded-2xl font-semibold">
              <Link href={headerHref}>Cancelar</Link>
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="rounded-2xl px-8 font-semibold"
            >
              {submitting ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </form>
      </Container>
    </main>
  )
}
