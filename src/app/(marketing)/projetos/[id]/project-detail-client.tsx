'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarDays,
  LayoutDashboard,
  MessageCircle,
  Pencil,
  Share2,
} from 'lucide-react'

import { CategoryBadge } from '@/components/team-link/category-badge'
import { ProjectStatusBadge } from '@/components/team-link/project-status-badge'
import { EmptyState } from '@/components/team-link/empty-state'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapPublicDetailToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type {
  MemberBadgeColor,
  ProjectPublicDetailRow,
  ProjectPublicMemberRow,
} from '@/types/database'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { CommentsSection } from './_components/comments-section'
import { ApplyButton, VacancySummary, useVacancies } from '@/components/team-link/recruitment'
import { LikeButton } from './_components/like-button'
import { MembersPreviewCard } from './_components/members-preview-card'
import { ProjectDescription, ProjectSummary } from './_components/project-description'
import { isValidBadgeColor } from './_components/member-badge'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MembershipRole = 'owner' | 'admin' | 'member' | 'mentor'

interface CurrentMembership {
  role: MembershipRole
  displayRole: string | null
  badgeColor: MemberBadgeColor | null
}

export function ProjectDetailClient({ slug }: { slug: string }) {
  const { user, isAuthenticated, loading: sessionLoading } = useSupabaseSession()

  const [project, setProject] = useState<ProjectDisplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  const [likesCount, setLikesCount] = useState(0)
  const [commentsCount, setCommentsCount] = useState(0)
  // Membership do usuário atual no projeto (para gating de UI).
  const [membership, setMembership] = useState<CurrentMembership | null>(null)

  const [members, setMembers] = useState<ProjectPublicMemberRow[]>([])
  const { vacancies, error: vacancyError, reload: reloadVacancies } = useVacancies(project?.id)

  // -------------------------------------------------------------------------
  // Carregamento do projeto
  // -------------------------------------------------------------------------

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

      const urlFromView = (row.project_url ?? '').trim()
      let detailRow: ProjectPublicDetailRow = row
      if (!urlFromView) {
        const { data: urlRow, error: urlError } = await client
          .from('projects')
          .select('project_url')
          .eq('id', row.id)
          .maybeSingle()
        if (!urlError && urlRow && typeof urlRow === 'object' && 'project_url' in urlRow) {
          const u = (urlRow as { project_url: string | null }).project_url?.trim()
          if (u) {
            detailRow = { ...row, project_url: u }
          }
        }
      }

      const display = mapPublicDetailToDisplay(detailRow)
      setProject(display)
      setLikesCount(display.likesCount)
      setCommentsCount(display.commentsCount)
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Erro desconhecido ao carregar projeto.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void loadProject()
  }, [loadProject])

  // -------------------------------------------------------------------------
  // Membership do usuário atual no projeto
  // -------------------------------------------------------------------------

  const loadMembership = useCallback(async () => {
    if (!project || !user) {
      setMembership(null)
      return
    }
    try {
      const client = getSupabaseClient()
      const { data } = await client
        .from('project_public_members')
        .select('role, display_role, badge_color')
        .eq('project_id', project.id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (data) {
        setMembership({
          role: (data.role as MembershipRole) ?? 'member',
          displayRole: (data.display_role as string | null) ?? null,
          badgeColor: isValidBadgeColor(
            (data.badge_color as string | null) ?? null,
          )
            ? ((data.badge_color as MemberBadgeColor) ?? null)
            : null,
        })
      } else {
        setMembership(null)
      }
    } catch {
      setMembership(null)
    }
  }, [project, user])

  useEffect(() => {
    void loadMembership()
  }, [loadMembership])

  // -------------------------------------------------------------------------
  // Derivados de tipo de usuário
  // -------------------------------------------------------------------------

  const [canEditProject, setCanEditProject] = useState(false)
  const isMember = Boolean(membership) || canEditProject
  const isLoggedNonMember = isAuthenticated && !isMember && !sessionLoading
  const isVisitor = !isAuthenticated && !sessionLoading

  // -------------------------------------------------------------------------
  // Helpers de UI
  // -------------------------------------------------------------------------

  const updatedAtLabel = useMemo(() => {
    if (!project) return ''
    const date = new Date(project.updatedAt)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [project])

  const summary = project?.shortDescription.trim() ?? ''
  const description = project?.description?.trim() ?? ''
  const sameDescription = summary.replace(/\s+/g, ' ') === description.replace(/\s+/g, ' ')

  const handleShare = async () => {
    if (!project) return
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: project.title,
          text: project.shortDescription,
          url,
        })
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

  // -------------------------------------------------------------------------
  // Estados intermediários
  // -------------------------------------------------------------------------

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
            icon={MessageCircle}
            title="Projeto não encontrado"
            description="O endereço acessado não corresponde a um projeto disponível. Ele pode ter sido removido ou estar com visibilidade restrita."
            actionLabel="Voltar para explorar"
            href="/explorar"
          />
        </Container>
      </main>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <main className="bg-background pb-20">
      <div className="border-b border-border bg-gradient-to-b from-muted/50 to-transparent">
        <Container className="space-y-2 py-2.5">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground sm:text-sm">
            <ol className="flex flex-wrap items-center gap-1.5">
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
              <li className="min-w-0 max-w-[min(100vw-4rem,28rem)]">
                <span
                  className="block truncate font-semibold text-foreground"
                  title={project.title}
                >
                  {project.title}
                </span>
              </li>
            </ol>
          </nav>

          <Button asChild variant="ghost" className="h-8 w-fit gap-2 rounded-xl px-2 text-sm font-semibold">
            <Link href="/explorar">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
          </Button>
        </Container>
      </div>

      <Container className="grid min-w-0 items-start gap-4 py-4 lg:grid-cols-[minmax(0,7fr)_minmax(17rem,3fr)] lg:grid-rows-[auto_1fr] lg:gap-6">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="min-w-0 space-y-5 rounded-[1.85rem] border border-card-outline bg-card bg-gradient-to-br from-primary/10 to-transparent p-5 shadow-sm sm:p-7 lg:col-start-1 lg:row-start-1"
          aria-labelledby="project-data-heading"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <h1
                id="project-data-heading"
                className="break-words text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl"
              >
                {project.title}
              </h1>
              {project.projectUrl ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Link do projeto: </span>
                  <a
                    href={project.projectUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="break-all text-primary no-underline hover:text-primary/90"
                  >
                    {project.projectUrl}
                  </a>
                </p>
              ) : null}
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              {project.category ? <CategoryBadge label={project.category} /> : null}
              {project.secondaryCategories?.map((category) => (
                <span key={category} className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">{category}</span>
              ))}
              <ProjectStatusBadge status={project.status} />
              {updatedAtLabel ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden />
                  Atualizado em {updatedAtLabel}
                </span>
              ) : null}
            </div>
          </div>

          {summary && <ProjectSummary text={summary} />}
          {description && !sameDescription && <ProjectDescription key={project.id} text={description} />}
          {!summary && !description && <p className="text-sm text-muted-foreground">Nenhuma descrição informada.</p>}

          {project.requiredSkills.length > 0 || project.openSpots > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
                Habilidades procuradas
              </p>
              {project.requiredSkills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {project.requiredSkills.map((skill) => (
                    <span
                      key={skill}
                      className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma habilidade informada.</p>
              )}
            </div>
          ) : null}

          {project.tags.length > 0 ? (
            <ul aria-label="Tags do projeto" className="flex flex-wrap gap-2">
              {project.tags.map((tag) => (
                <li key={tag} className="max-w-full break-words rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-card-outline/70 pt-4 sm:flex-row sm:flex-wrap sm:items-center">
            <ApplyButton key={project.id + (user?.id ?? '')} projectId={project.id} title={project.title}
              vacancies={vacancies} userId={user?.id} canApply={isLoggedNonMember} isVisitor={isVisitor} />
            <LikeButton
              projectId={project.id}
              initialCount={likesCount}
              onCountChange={setLikesCount}
              className="w-full sm:w-auto"
            />
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-2xl font-semibold sm:w-auto"
              onClick={() => void handleShare()}
            >
              <Share2 className="h-4 w-4" aria-hidden />
              Compartilhar
            </Button>
            {isMember ? (
              <Button asChild className="w-full rounded-2xl font-semibold sm:w-auto">
                <Link href={`/projetos/${project.slug}/painel`}>
                  <LayoutDashboard className="h-4 w-4" aria-hidden />
                  Painel do projeto
                </Link>
              </Button>
            ) : null}
            {canEditProject ? (
              <Button asChild variant="outline" className="w-full rounded-2xl font-semibold sm:w-auto">
                <Link href={`/projetos/${project.slug}/editar`}>
                  <Pencil className="h-4 w-4" aria-hidden />
                  Editar projeto
                </Link>
              </Button>
            ) : null}
          </div>
        </motion.section>

        <aside aria-label="Equipe e vagas" className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-stretch">
          <div className="space-y-4">
            <MembersPreviewCard
              key={project.id}
              onMembersChange={setMembers}
              onMemberRemoved={() => { void reloadVacancies(); void loadMembership() }}
              projectId={project.id}
              onAdminChange={setCanEditProject}
              currentUserId={user?.id ?? null}
            />

            <VacancySummary vacancies={vacancies} error={vacancyError} />
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <CommentsSection
            members={members}
            projectId={project.id}
            initialCount={commentsCount}
            onCountChange={setCommentsCount}
          />
        </div>
      </Container>
    </main>
  )

}
