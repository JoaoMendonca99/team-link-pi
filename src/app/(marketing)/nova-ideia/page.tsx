'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { FormSection } from '@/components/team-link/form-section'
import { PageHeader } from '@/components/team-link/page-header'
import { ProjectCard } from '@/components/team-link/project-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { projectCategories } from '@/data/mock-projects'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { translateAuthError } from '@/lib/supabase/auth-errors'
import type { ProjectDisplay } from '@/lib/projects/display'
import { slugify } from '@/lib/projects/slug'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

const today = () => new Date().toISOString()

export default function NovaIdeiaPage() {
  const router = useRouter()
  const { user, profile, loading: sessionLoading, isAuthenticated } = useSupabaseSession()

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [shortDescription, setShortDescription] = useState('')
  const [fullDescription, setFullDescription] = useState('')
  const [skills, setSkills] = useState<string[]>([])
  const [skillsInput, setSkillsInput] = useState('')
  const [spots, setSpots] = useState('2')
  const [profileSeek, setProfileSeek] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  useEffect(() => {
    setEnvMissing(!isSupabaseConfigured())
  }, [])

  const authorName =
    profile?.full_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Você'
  const authorId = user?.id ?? 'preview-author'
  const generatedSlug = useMemo(() => (title.trim() ? slugify(title) : ''), [title])

  const previewProject = useMemo<ProjectDisplay>(() => {
    const parsedSpots = Number.parseInt(spots, 10)
    return {
      id: 'preview-local',
      slug: generatedSlug || 'pre-visualizacao',
      title: title.trim() || 'Seu projeto aparecerá aqui',
      shortDescription:
        shortDescription.trim() ||
        'Resumo curto aparece aqui. Explique o problema, o objetivo e por que vale a pena agora.',
      description: fullDescription.trim() || null,
      category: category || null,
      status: 'open',
      visibility: 'public',
      openSpots: Number.isFinite(parsedSpots) && parsedSpots > 0 ? parsedSpots : 2,
      desiredProfile:
        profileSeek.trim() ||
        'Descreva o ritmo de trabalho esperado, formato (remoto, presencial, híbrido) e responsabilidades iniciais.',
      createdAt: today(),
      updatedAt: today(),
      ownerId: authorId,
      ownerName: authorName,
      ownerCourse: profile?.course ?? null,
      ownerAvatarUrl: profile?.avatar_url ?? null,
      tags,
      requiredSkills: skills,
      likesCount: 0,
      commentsCount: 0,
      membersCount: 1,
    }
  }, [
    authorId,
    authorName,
    category,
    fullDescription,
    generatedSlug,
    profile?.avatar_url,
    profile?.course,
    profileSeek,
    shortDescription,
    skills,
    spots,
    tags,
    title,
  ])

  const isValid =
    Boolean(title.trim()) &&
    Boolean(shortDescription.trim()) &&
    Boolean(fullDescription.trim()) &&
    Boolean(category) &&
    Boolean(profileSeek.trim()) &&
    tags.length > 0

  const appendUnique = (
    raw: string,
    list: string[],
    setter: (value: string[]) => void,
    transform: (value: string) => string = (value) => value.trim(),
  ) => {
    const value = transform(raw)
    if (!value || list.includes(value)) return
    setter([...list, value])
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    if (!isAuthenticated || !user) {
      setErrorMessage('Você precisa estar conectado para publicar uma ideia.')
      return
    }
    if (!isValid) return

    if (envMissing) {
      setErrorMessage('Não foi possível conectar ao serviço de dados. Tente novamente em instantes.')
      return
    }

    const parsedSpots = Number.parseInt(spots, 10)
    const safeSpots = Number.isFinite(parsedSpots) && parsedSpots > 0 ? parsedSpots : 1

    const baseSlug = slugify(title)
    if (!baseSlug) {
      setErrorMessage('Informe um título válido (sem apenas símbolos).')
      return
    }

    setSubmitting(true)
    try {
      const client = getSupabaseClient()
      const { data, error } = await client.rpc('create_project_with_details', {
        p_title: title.trim(),
        p_slug: baseSlug,
        p_short_description: shortDescription.trim(),
        p_description: fullDescription.trim(),
        p_category: category,
        p_open_spots: safeSpots,
        p_desired_profile: profileSeek.trim(),
        p_tags: tags,
        p_required_skills: skills,
      })

      if (error) {
        const normalized = error.message?.toLowerCase() ?? ''
        if (
          normalized.includes('duplicate') ||
          normalized.includes('unique') ||
          normalized.includes('projects_slug_key')
        ) {
          setErrorMessage(
            'Já existe um projeto com esse endereço. Altere o título ou tente novamente.',
          )
        } else {
          setErrorMessage(translateAuthError(error.message))
        }
        return
      }

      const createdSlug = extractCreatedSlug(data) ?? baseSlug
      router.push(`/projetos/${createdSlug}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : null
      setErrorMessage(translateAuthError(message))
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionLoading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-1/2 rounded-2xl bg-muted" />
            <div className="h-64 rounded-3xl bg-muted" />
          </div>
        </Container>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <PageHeader
            eyebrow="Publicar projeto"
            title="Entre para publicar uma ideia"
            description="Para criar um projeto e formar equipe, você precisa estar conectado com sua conta."
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="rounded-2xl font-semibold">
              <Link href="/login">Ir para login</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link href="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  return (
    <main className="bg-background pb-20">
      <div className="border-b border-border bg-gradient-to-br from-muted/60 via-background to-background">
        <Container className="space-y-10 py-14">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-4">
            <Button asChild variant="ghost" size="icon" className="mt-1 shrink-0 rounded-2xl">
              <Link href="/explorar" aria-label="Voltar para explorar">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <PageHeader
              eyebrow="Publicar projeto"
              title="Descreva sua ideia"
              description="Ao publicar, seu projeto fica visível para outras pessoas no Team Link."
              className="min-w-0 flex-1 border-none pb-0"
            />
          </div>

          <form className="grid min-w-0 gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.92fr)]" onSubmit={handleSubmit}>
            <div className="min-w-0 space-y-8">
              <FormSection
                title="Informações básicas"
                description="Conte o que é o projeto, qual o objetivo e em que área ele se encaixa."
              >
                <div className="space-y-3">
                  <Label htmlFor="titulo">Título</Label>
                  <Input
                    id="titulo"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Um nome curto e fácil de lembrar para o projeto"
                    maxLength={120}
                    required
                    className="rounded-2xl"
                  />
                  {generatedSlug ? (
                    <p className="text-xs text-muted-foreground">
                      Endereço público: <span className="font-mono">/projetos/{generatedSlug}</span>
                    </p>
                  ) : null}
                </div>

                <div className="space-y-3">
                  <Label>Categoria</Label>
                  <Select value={category} onValueChange={setCategory} required>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="Área principal do projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {projectCategories.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label htmlFor="short">Descrição curta</Label>
                  <Textarea
                    id="short"
                    rows={5}
                    value={shortDescription}
                    onChange={(event) => setShortDescription(event.target.value)}
                    placeholder="Resumo direto: o problema, para quem é e o que o projeto pretende entregar."
                    required
                    className="rounded-2xl"
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="complete">Descrição completa</Label>
                  <Textarea
                    id="complete"
                    rows={8}
                    value={fullDescription}
                    onChange={(event) => setFullDescription(event.target.value)}
                    placeholder="Detalhe contexto, etapas previstas, recursos necessários e o que você espera construir junto."
                    required
                    className="rounded-2xl"
                  />
                </div>
              </FormSection>

              <FormSection
                title="Equipe e vagas"
                description="Indique quantas vagas estão em aberto e que perfil você procura."
              >
                <div className="space-y-4">
                  <Label htmlFor="vagas">Vagas disponíveis</Label>
                  <Input
                    id="vagas"
                    min={1}
                    type="number"
                    value={spots}
                    onChange={(event) => setSpots(event.target.value)}
                    className="rounded-2xl"
                    required
                  />
                  <Label htmlFor="perfil">Perfil procurado</Label>
                  <Textarea
                    id="perfil"
                    rows={6}
                    value={profileSeek}
                    onChange={(event) => setProfileSeek(event.target.value)}
                    placeholder="Descreva disponibilidade esperada, ritmo de trabalho, tecnologias envolvidas e responsabilidades."
                    required
                    className="rounded-2xl"
                  />
                </div>

                <div className="space-y-4">
                  <Label>Habilidades desejadas</Label>
                  <div className="flex flex-wrap gap-2 rounded-3xl border border-dashed border-border p-4">
                    {skills.map((skill) => (
                      <button
                        key={skill}
                        type="button"
                        className="cursor-pointer rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold transition-colors hover:bg-muted/70"
                        onClick={() => setSkills(skills.filter((item) => item !== skill))}
                      >
                        {skill} · remover
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      value={skillsInput}
                      onChange={(event) => setSkillsInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          appendUnique(skillsInput, skills, setSkills)
                          setSkillsInput('')
                        }
                      }}
                      placeholder="Ex.: React, design, comunicação..."
                      className="rounded-2xl"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-2xl font-semibold"
                      onClick={() => {
                        appendUnique(skillsInput, skills, setSkills)
                        setSkillsInput('')
                      }}
                    >
                      Adicionar
                    </Button>
                  </div>
                </div>
              </FormSection>

              <FormSection
                title="Tags"
                description="Ajuda outras pessoas a encontrarem seu projeto pelos temas certos."
              >
                <div className="flex flex-wrap gap-2 rounded-3xl border border-border bg-muted/40 p-4">
                  {tags.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      className="cursor-pointer rounded-full border border-transparent bg-background px-3 py-1 text-xs font-semibold shadow-sm transition-colors hover:bg-muted"
                      onClick={() => setTags(tags.filter((item) => item !== chip))}
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    placeholder="Ex.: educação, sustentabilidade, robótica..."
                    value={tagInput}
                    className="rounded-2xl"
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        appendUnique(tagInput, tags, setTags, (value) =>
                          value
                            .trim()
                            .toLowerCase(),
                        )
                        setTagInput('')
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-2xl font-semibold"
                    onClick={() => {
                      appendUnique(tagInput, tags, setTags, (value) => value.trim().toLowerCase())
                      setTagInput('')
                    }}
                  >
                    Adicionar tag
                  </Button>
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

              {envMissing ? (
                <div
                  role="status"
                  className="rounded-2xl border border-amber-400/40 bg-amber-100/60 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  Não foi possível conectar ao serviço de dados. Tente novamente em instantes.
                </div>
              ) : null}

              <div className="flex flex-wrap gap-4">
                <Button type="submit" disabled={!isValid || submitting} className="rounded-2xl px-8 font-semibold">
                  {submitting ? 'Publicando...' : 'Publicar projeto'}
                </Button>
                <Button asChild type="button" variant="outline" className="rounded-2xl font-semibold">
                  <Link href="/explorar">Cancelar</Link>
                </Button>
              </div>
            </div>

            <div className="min-w-0 space-y-4 lg:sticky lg:top-[96px]">
              <p className="text-sm font-semibold text-muted-foreground">Pré-visualização</p>
              <ProjectCard project={previewProject} disableLink className="opacity-95" />
            </div>
          </form>
        </Container>
      </div>
    </main>
  )
}

/**
 * A RPC `create_project_with_details` pode retornar diferentes shapes
 * (linha de `projects`, somente o id, etc.). Tentamos extrair um `slug` quando
 * disponível e caímos no slug normalizado pelo formulário caso contrário.
 */
function extractCreatedSlug(payload: unknown): string | null {
  if (!payload) return null
  if (typeof payload === 'string') return payload || null
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const found = extractCreatedSlug(entry)
      if (found) return found
    }
    return null
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    if (typeof record.slug === 'string' && record.slug) return record.slug
    if (typeof record.project_slug === 'string' && record.project_slug) return record.project_slug
  }
  return null
}
