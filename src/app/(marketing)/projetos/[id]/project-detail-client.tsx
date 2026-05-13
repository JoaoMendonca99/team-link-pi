'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  Users,
} from 'lucide-react'

import { CategoryBadge } from '@/components/team-link/category-badge'
import { ProjectStatusBadge } from '@/components/team-link/project-status-badge'
import { TagList } from '@/components/team-link/tag-list'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { StatCard } from '@/components/team-link/stat-card'
import { EmptyState } from '@/components/team-link/empty-state'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapPublicDetailToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type { ProjectPublicDetailRow } from '@/types/database'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

import { CommentsSection } from './_components/comments-section'
import { JoinRequestSection } from './_components/join-request-section'
import { LikeButton } from './_components/like-button'
import { MembersList, type MembersListHandle } from './_components/members-list'
import { OwnerRequestsSection } from './_components/owner-requests-section'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function ProjectDetailClient({ slug }: { slug: string }) {
  const { user, isAuthenticated } = useSupabaseSession()

  const [project, setProject] = useState<ProjectDisplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  // Contadores locais para refletir reações em tempo real sem refetch do projeto.
  const [likesCount, setLikesCount] = useState(0)
  const [commentsCount, setCommentsCount] = useState(0)
  const [membersCount, setMembersCount] = useState(0)

  const membersRef = useRef<MembersListHandle | null>(null)

  const loadProject = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setEnvMissing(true)
      setLoading(false)
      return
    }

    setLoading(true)
    setFetchError(null)
    setNotFound(false)
    try {
      const client = getSupabaseClient()
      const bySlug = await client
        .from('project_public_details')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      let row: ProjectPublicDetailRow | null =
        (bySlug.data as ProjectPublicDetailRow | null) ?? null

      // Fallback opcional: se o parâmetro parece UUID, tenta por id.
      if (!row && !bySlug.error && UUID_RE.test(slug)) {
        const byId = await client
          .from('project_public_details')
          .select('*')
          .eq('id', slug)
          .maybeSingle()
        row = (byId.data as ProjectPublicDetailRow | null) ?? null
      }

      if (bySlug.error && !row) {
        setFetchError(bySlug.error.message)
        return
      }
      if (!row) {
        setNotFound(true)
        return
      }

      const display = mapPublicDetailToDisplay(row)
      setProject(display)
      setLikesCount(display.likesCount)
      setCommentsCount(display.commentsCount)
      setMembersCount(display.membersCount)
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Erro desconhecido ao carregar projeto.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void loadProject()
  }, [loadProject])

  const updatedAtLabel = useMemo(() => {
    if (!project) return ''
    const date = new Date(project.updatedAt)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('pt-BR')
  }, [project])

  const handleShare = async () => {
    if (!project) return
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: project.title, text: project.shortDescription, url })
        return
      } catch {
        // share dialog cancelled, fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // ignore clipboard failure
    }
  }

  const handleRequestsChange = useCallback(async () => {
    // Após aprovar/recusar, recarrega a lista de membros para refletir o trigger
    // `add_member_when_join_request_approved` no banco.
    await membersRef.current?.reload()
  }, [])

  if (loading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-2/3 rounded-2xl bg-muted" />
            <div className="h-6 w-1/2 rounded-2xl bg-muted" />
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="h-64 rounded-3xl bg-muted lg:col-span-2" />
              <div className="h-64 rounded-3xl bg-muted" />
            </div>
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
            icon={MessageCircle}
            title="Não foi possível carregar este projeto"
            description="Tente novamente em instantes. Se o problema continuar, volte para o explorar."
            actionLabel="Voltar para explorar"
            href="/explorar"
          />
        </Container>
      </main>
    )
  }

  if (fetchError && !project) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-destructive">Não foi possível carregar este projeto.</p>
            <p className="mt-2 text-xs text-destructive/80">{fetchError}</p>
            <Button onClick={() => void loadProject()} className="mt-4 rounded-2xl font-semibold">
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
            icon={MessageCircle}
            title="Projeto não encontrado"
            description="O endereço acessado não corresponde a um projeto público. Talvez ele tenha sido removido ou esteja com visibilidade privada."
            actionLabel="Voltar para explorar"
            href="/explorar"
          />
        </Container>
      </main>
    )
  }

  const isOwner = isAuthenticated && user?.id === project.ownerId

  return (
    <main className="bg-background">
      <div className="border-b border-border bg-gradient-to-b from-muted/60 to-transparent">
        <Container className="space-y-8 py-10">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link href="/" className="font-semibold text-primary hover:underline">
                  Início
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href="/explorar" className="font-semibold text-primary hover:underline">
                  Explorar
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="min-w-0 max-w-[min(100vw-4rem,32rem)] sm:max-w-md">
                <span className="block truncate font-semibold text-foreground" title={project.title}>
                  {project.title}
                </span>
              </li>
            </ol>
          </nav>

          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <Button asChild variant="ghost" className="w-fit gap-2 rounded-2xl px-3 font-semibold">
              <Link href="/explorar">
                <ArrowLeft className="h-4 w-4" />
                Voltar ao explorar
              </Link>
            </Button>
            <div className="flex flex-wrap items-start gap-3 md:justify-end">
              <LikeButton
                projectId={project.id}
                initialCount={likesCount}
                onCountChange={setLikesCount}
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl font-semibold"
                onClick={() => void handleShare()}
              >
                <Share2 className="h-4 w-4" aria-hidden />
                Compartilhar
              </Button>
              {isOwner ? (
                <Button asChild variant="outline" className="rounded-2xl font-semibold">
                  <Link href={`/projetos/${project.slug}/editar`}>Editar projeto</Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-6 border-b border-border/80 pb-8">
            <div className="space-y-3">
              <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
                {project.title}
              </h1>
              {project.shortDescription ? (
                <p className="max-w-3xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                  {project.shortDescription}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {project.category ? <CategoryBadge label={project.category} /> : null}
              <ProjectStatusBadge status={project.status} />
              {updatedAtLabel ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
                  Atualizado {updatedAtLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <UserAvatar
              name={project.ownerName}
              imageUrl={project.ownerAvatarUrl ?? undefined}
              sizeClassName="h-12 w-12"
            />
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Autor</p>
              <p className="text-lg font-semibold text-foreground">{project.ownerName}</p>
              {project.ownerCourse ? (
                <p className="text-sm text-muted-foreground">{project.ownerCourse}</p>
              ) : null}
            </div>
          </div>

          {project.tags.length > 0 ? <TagList tags={project.tags} max={12} size="md" /> : null}
        </Container>
      </div>

      <Container className="grid gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_minmax(240px,300px)] lg:items-start">
        <div className="min-w-0 space-y-10">
          {project.description ? (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="space-y-6 rounded-[1.85rem] border border-border bg-card p-8 shadow-sm"
            >
              <h2 className="text-2xl font-bold">Visão geral</h2>
              <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            </motion.section>
          ) : null}

          {project.requiredSkills.length > 0 ? (
            <section className="space-y-4 rounded-[1.85rem] border border-border bg-card p-8 shadow-sm">
              <h3 className="text-xl font-semibold">Habilidades procuradas</h3>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                {project.requiredSkills.map((skill) => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-6 rounded-[1.85rem] border border-border bg-card p-8 shadow-sm">
            <div className="flex items-center gap-4">
              <Users className="h-10 w-10 text-[#14B8A6]" aria-hidden />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Vagas</p>
                <h3 className="text-xl font-semibold">{project.openSpots} vaga(s) aberta(s) neste ciclo</h3>
              </div>
            </div>
            {project.desiredProfile ? (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{project.desiredProfile}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Perfil procurado ainda não informado pelo autor.</p>
            )}
          </section>

          <section className="space-y-4 rounded-[1.85rem] border border-border bg-card p-8 shadow-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Equipe atual</p>
              <h3 className="text-xl font-semibold">Membros ({membersCount})</h3>
              <p className="text-sm text-muted-foreground">
                Pessoas que fazem parte deste projeto.
              </p>
            </div>
            <MembersList
              ref={membersRef}
              projectId={project.id}
              onCountChange={setMembersCount}
            />
          </section>

          {isOwner ? (
            <OwnerRequestsSection projectId={project.id} onChange={handleRequestsChange} />
          ) : null}

          <CommentsSection
            projectId={project.id}
            initialCount={commentsCount}
            onCountChange={setCommentsCount}
          />
        </div>

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-[96px]">
          <section className="rounded-[1.75rem] border border-border bg-card p-6 shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Facilitador</p>
            <div className="mt-5 flex gap-4">
              <UserAvatar
                name={project.ownerName}
                imageUrl={project.ownerAvatarUrl ?? undefined}
                sizeClassName="h-14 w-14"
              />
              <div>
                <p className="text-lg font-semibold">{project.ownerName}</p>
                {project.ownerCourse ? (
                  <p className="text-sm text-muted-foreground">{project.ownerCourse}</p>
                ) : null}
              </div>
            </div>
          </section>

          <div className="grid gap-4">
            <StatCard icon={Heart} label="Curtidas" value={likesCount} />
            <StatCard icon={MessageCircle} label="Comentários" value={commentsCount} />
            <StatCard icon={Users} label="Membros" value={membersCount} />
            <StatCard icon={Eye} label="Vagas abertas" value={project.openSpots} />
          </div>

          <JoinRequestSection projectId={project.id} ownerId={project.ownerId} />
        </aside>
      </Container>
    </main>
  )
}
