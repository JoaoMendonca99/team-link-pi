'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  Users,
} from 'lucide-react'

import { CategoryBadge } from '@/components/team-link/category-badge'
import { EmptyState } from '@/components/team-link/empty-state'
import { PageHeader } from '@/components/team-link/page-header'
import { ProjectStatusBadge } from '@/components/team-link/project-status-badge'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import {
  linkProjectGithubRepository,
  syncProjectGithubRepository,
  unlinkProjectGithubRepository,
  updateGithubCommitVisibility,
} from '@/lib/github/actions'
import {
  loadProjectGithubCommits,
  loadProjectGithubRepository,
} from '@/lib/github/loaders'
import type { GithubCommitItem, GithubRepositoryLink } from '@/lib/github/types'
import { mapPublicDetailToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import {
  canAccessProjectPanel,
  isProjectManager,
  type ProjectMembership,
} from '@/lib/projects/membership'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { MemberBadgeColor, ProjectPublicDetailRow } from '@/types/database'

import { isValidBadgeColor } from '../_components/member-badge'
import { CommitDetailModal } from './_components/commit-detail-modal'
import { LinkGithubDialog } from './_components/link-github-dialog'
import { PanelAccessDenied } from './_components/panel-access-denied'
import { PanelGithubSection } from './_components/panel-github-section'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MembershipRole = 'owner' | 'admin' | 'member' | 'mentor'

export function ProjectPanelClient({ slug }: { slug: string }) {
  const { user, isAuthenticated, loading: sessionLoading } = useSupabaseSession()

  const [project, setProject] = useState<ProjectDisplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  const [membership, setMembership] = useState<ProjectMembership | null>(null)
  const [membershipLoaded, setMembershipLoaded] = useState(false)

  const [repository, setRepository] = useState<GithubRepositoryLink | null>(null)
  const [commits, setCommits] = useState<GithubCommitItem[]>([])
  const [repoLoading, setRepoLoading] = useState(false)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<GithubCommitItem | null>(null)

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

      setProject(mapPublicDetailToDisplay(row))
    } catch (error) {
      setFetchError(
        error instanceof Error ? error.message : 'Erro desconhecido ao carregar projeto.',
      )
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void loadProject()
  }, [loadProject])

  const loadMembership = useCallback(async () => {
    if (!project || !user) {
      setMembership(null)
      setMembershipLoaded(true)
      return
    }

    setMembershipLoaded(false)
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
          badgeColor: isValidBadgeColor((data.badge_color as string | null) ?? null)
            ? ((data.badge_color as MemberBadgeColor) ?? null)
            : null,
        })
      } else if (user.id === project.ownerId) {
        setMembership({ role: 'owner', displayRole: null, badgeColor: null })
      } else {
        setMembership(null)
      }
    } catch {
      setMembership(null)
    } finally {
      setMembershipLoaded(true)
    }
  }, [project, user])

  useEffect(() => {
    void loadMembership()
  }, [loadMembership])

  const hasPanelAccess = useMemo(() => {
    if (!project) return false
    return canAccessProjectPanel(user?.id, project.ownerId, membership)
  }, [membership, project, user?.id])

  const isManager = useMemo(() => {
    if (!project) return false
    return isProjectManager(user?.id, project.ownerId, membership)
  }, [membership, project, user?.id])

  const refreshGithub = useCallback(async () => {
    if (!project || !hasPanelAccess) return
    setRepoLoading(true)
    setCommitsLoading(true)
    setGithubError(null)
    try {
      const [repo, commitRows] = await Promise.all([
        loadProjectGithubRepository(project.id),
        loadProjectGithubCommits(project.id, 5),
      ])
      setRepository(repo)
      setCommits(commitRows)
    } catch (error) {
      setGithubError(
        error instanceof Error ? error.message : 'Não foi possível carregar dados do GitHub.',
      )
      setRepository(null)
      setCommits([])
    } finally {
      setRepoLoading(false)
      setCommitsLoading(false)
    }
  }, [hasPanelAccess, project])

  useEffect(() => {
    if (!hasPanelAccess || !project) return
    void refreshGithub()
  }, [hasPanelAccess, project, refreshGithub])

  async function handleLink(input: {
    installation_id: number
    owner: string
    repo: string
    commit_visibility: 'members' | 'public'
  }) {
    if (!project) return { ok: false as const, message: 'Projeto indisponível.' }
    setActionLoading(true)
    setFeedback(null)
    const result = await linkProjectGithubRepository({
      project_id: project.id,
      installation_id: input.installation_id,
      owner: input.owner,
      repo: input.repo,
      commit_visibility: input.commit_visibility,
    })
    setActionLoading(false)
    if (!result.ok) return result
    setFeedback(
      result.total_commits_imported > 0
        ? `Repositório conectado. ${result.total_commits_imported} commit(s) importado(s).`
        : 'Repositório conectado com sucesso.',
    )
    await refreshGithub()
    return { ok: true as const }
  }

  async function handleSync() {
    if (!repository) return
    setActionLoading(true)
    setFeedback(null)
    const result = await syncProjectGithubRepository(repository.id)
    setActionLoading(false)
    if (!result.ok) {
      setFeedback(result.message)
      return
    }
    setFeedback(
      result.commits_synced > 0
        ? `${result.commits_synced} commit(s) sincronizado(s).`
        : 'Repositório já estava atualizado.',
    )
    await refreshGithub()
  }

  async function handleUnlink() {
    if (!repository) return
    const confirmed = window.confirm(
      'Deseja desconectar este repositório do projeto? Os commits já importados permanecem no histórico.',
    )
    if (!confirmed) return
    setActionLoading(true)
    setFeedback(null)
    const result = await unlinkProjectGithubRepository(repository.id)
    setActionLoading(false)
    if (!result.ok) {
      setFeedback(result.message)
      return
    }
    setFeedback('Repositório desconectado.')
    await refreshGithub()
  }

  async function handleToggleVisibility() {
    if (!repository) return
    const next = repository.commit_visibility === 'public' ? 'members' : 'public'
    setActionLoading(true)
    setFeedback(null)
    const result = await updateGithubCommitVisibility(repository.id, next)
    setActionLoading(false)
    if (!result.ok) {
      setFeedback(result.message)
      return
    }
    setFeedback(
      next === 'public'
        ? 'Commits visíveis na página pública do projeto.'
        : 'Commits visíveis apenas para membros.',
    )
    await refreshGithub()
  }

  if (loading || sessionLoading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando painel…
          </div>
        </Container>
      </main>
    )
  }

  if (envMissing || (fetchError && !project) || notFound || !project) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <EmptyState
            icon={LayoutDashboard}
            title={notFound ? 'Projeto não encontrado' : 'Não foi possível abrir o painel'}
            description={
              notFound
                ? 'Este projeto não está disponível ou o endereço está incorreto.'
                : 'Tente novamente em instantes.'
            }
            actionLabel="Voltar para explorar"
            href="/explorar"
          />
        </Container>
      </main>
    )
  }

  if (membershipLoaded && !hasPanelAccess) {
    return <PanelAccessDenied slug={project.slug} isAuthenticated={isAuthenticated} />
  }

  return (
    <main className="bg-background pb-20">
      <div className="border-b border-border bg-gradient-to-b from-muted/50 to-transparent">
        <Container className="space-y-6 py-8 sm:py-10">
          <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground sm:text-sm">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>
                <Link href="/" className="font-semibold text-primary hover:underline">
                  Início
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li>
                <Link href="/meus-projetos" className="font-semibold text-primary hover:underline">
                  Meus projetos
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li className="truncate font-semibold text-foreground">{project.title}</li>
            </ol>
          </nav>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm" className="rounded-2xl font-semibold">
              <Link href={`/projetos/${project.slug}`}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Página pública
              </Link>
            </Button>
            {isManager ? (
              <Button asChild variant="outline" size="sm" className="rounded-2xl font-semibold">
                <Link href={`/projetos/${project.slug}/editar`}>Editar projeto</Link>
              </Button>
            ) : null}
          </div>

          <PageHeader
            eyebrow="Área da equipe"
            title={project.title}
            description="Resumo do projeto, integração com GitHub e atividade recente."
          />
        </Container>
      </div>

      <Container className="space-y-8 py-10">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            icon={Users}
            label="Membros"
            value={String(project.membersCount)}
          />
          <SummaryTile
            icon={MessageCircle}
            label="Comentários"
            value={String(project.commentsCount)}
          />
          <SummaryTile label="Vagas abertas" value={String(project.openSpots)} />
          <SummaryTile label="Status">
            <ProjectStatusBadge status={project.status} />
          </SummaryTile>
        </section>

        <section className="flex flex-wrap items-center gap-2">
          {project.category ? <CategoryBadge label={project.category} /> : null}
          <Button asChild variant="outline" size="sm" className="rounded-2xl font-semibold">
            <Link href="/mensagens">Mensagens da equipe</Link>
          </Button>
        </section>

        {githubError ? (
          <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {githubError}
          </p>
        ) : null}

        <PanelGithubSection
          repository={repository}
          commits={commits}
          repoLoading={repoLoading}
          commitsLoading={commitsLoading}
          actionLoading={actionLoading}
          isManager={isManager}
          feedback={feedback}
          onConnect={() => setLinkOpen(true)}
          onSync={() => void handleSync()}
          onUnlink={() => void handleUnlink()}
          onToggleVisibility={() => void handleToggleVisibility()}
          onOpenCommit={setSelectedCommit}
        />
      </Container>

      <LinkGithubDialog
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onSubmit={handleLink}
      />

      <CommitDetailModal
        commit={selectedCommit}
        onClose={() => setSelectedCommit(null)}
      />
    </main>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  label: string
  value?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-card-outline bg-card px-4 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {Icon ? <Icon className="h-4 w-4 text-primary" aria-hidden /> : null}
        {children ?? (
          <p className="text-lg font-bold text-foreground">{value ?? '—'}</p>
        )}
      </div>
    </div>
  )
}
