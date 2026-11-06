'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  LayoutDashboard,
  Loader2,
} from 'lucide-react'

import { EmptyState } from '@/components/team-link/empty-state'
import { PageHeader } from '@/components/team-link/page-header'
import { ProjectStatusBadge } from '@/components/team-link/project-status-badge'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import {
  syncProjectGithubRepository,
  unlinkProjectGithubRepository,
  updateGithubActivitySource,
  updateGithubCommitVisibility,
} from '@/lib/github/actions'
import {
  loadProjectGithubCommits,
  loadProjectGithubReleases,
  loadProjectGithubRepository,
} from '@/lib/github/loaders'
import type {
  GithubActivitySource,
  GithubCommitItem,
  GithubReleaseItem,
  GithubRepositoryLink,
} from '@/lib/github/types'
import { mapPublicDetailToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import {
  type ProjectMembership,
} from '@/lib/projects/membership'
import {
  loadProjectSupportIntegration,
  loadProjectSupportTicketStats,
} from '@/lib/support/loaders'
import {
  isSupportSacActive,
  isSupportSacConfigured,
  type SupportIntegrationInfo,
  type SupportProjectTicketStats,
} from '@/lib/support/types'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { MemberBadgeColor, ProjectPublicDetailRow } from '@/types/database'

import { isValidBadgeColor } from '../_components/member-badge'
import { CommitDetailModal } from './_components/commit-detail-modal'
import { ConnectGithubDialog } from './_components/connect-github-dialog'
import { PanelAccessDenied } from './_components/panel-access-denied'
import { PanelGithubSection } from './_components/panel-github-section'
import { PanelSupportSection } from './_components/panel-support-section'
import { useProjectLeadership } from '@/hooks/use-project-leadership'
import { ProjectTools, type WorkspaceModule } from './_components/project-tools'
import {AcademicPeriodSummary} from '@/components/team-link/academic-period-summary'
import { ActivityOverview, PanelTeam, usePanelSummary } from './_components/panel-overview'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MembershipRole = 'owner' | 'admin' | 'member' | 'mentor'

export function ProjectPanelClient({ slug }: { slug: string }) {
  const router = useRouter()
  const { user, isAuthenticated, loading: sessionLoading } = useSupabaseSession()

  const [project, setProject] = useState<ProjectDisplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  const [membership, setMembership] = useState<ProjectMembership | null>(null)
  const [membershipLoaded, setMembershipLoaded] = useState(false)
  const [modules, setModules] = useState<WorkspaceModule[]>([])
  const [modulesLoading, setModulesLoading] = useState(true)
  const [modulesError, setModulesError] = useState<string | null>(null)
  const [opened, setOpened] = useState<WorkspaceModule | null>(null)
  const [pending, setPending] = useState(0)

  const [repository, setRepository] = useState<GithubRepositoryLink | null>(null)
  const [commits, setCommits] = useState<GithubCommitItem[]>([])
  const [releases, setReleases] = useState<GithubReleaseItem[]>([])
  const [repoLoading, setRepoLoading] = useState(false)
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [releasesLoading, setReleasesLoading] = useState(false)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [linkOpen, setLinkOpen] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<GithubCommitItem | null>(null)

  const [supportIntegration, setSupportIntegration] = useState<SupportIntegrationInfo | null>(
    null,
  )
  const [supportIntegrationLoading, setSupportIntegrationLoading] = useState(false)
  const [supportIntegrationError, setSupportIntegrationError] = useState<string | null>(null)
  const [supportStats, setSupportStats] = useState<SupportProjectTicketStats | null>(null)
  const [supportStatsLoading, setSupportStatsLoading] = useState(false)

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
        .from('project_members')
        .select('role, display_role, badge_color, support_access')
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
          supportAccess: data.support_access === true,
        })
      } else if (user.id === project.ownerId) {
        setMembership({
          role: 'owner',
          displayRole: null,
          badgeColor: null,
          supportAccess: true,
        })
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

  const hasPanelAccess = Boolean(user && membership)
  const isManager = useProjectLeadership(project?.id, user?.id)
  const canEditProject = isManager
  const canViewSupport = isManager || membership?.supportAccess === true
  const projectId = project?.id
  const overview = usePanelSummary(projectId, user?.id, hasPanelAccess && membershipLoaded)
  const recruitmentHref = project ? '/projetos/' + project.slug + '/painel/candidaturas' : ''
  const githubOpen = opened === 'github' && modules.includes('github')
  const supportOpen = opened === 'support' && modules.includes('support')

  useEffect(() => {
    if (!hasPanelAccess || !projectId) return
    let current = true
    setModulesLoading(true)
    setModules([])
    setModulesError(null)
    void getSupabaseClient().rpc('get_workspace_modules', { p_project: projectId }).then(({ data, error }) => {
      if (!current) return
      if (error) setModulesError('Não foi possível carregar as ferramentas.')
      else setModules(Array.isArray(data) ? data : [])
      setModulesLoading(false)
    })
    return () => { current = false }
  }, [hasPanelAccess, projectId])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('ferramenta') === 'github') setOpened('github')
  }, [slug])

  useEffect(() => {
    if (!isManager || !projectId) return
    if (window.location.hash === '#candidaturas') router.replace(recruitmentHref)
    let current = true
    const client = getSupabaseClient()
    const refresh = async () => {
      const { data, error } = await client.rpc('get_workspace_pending_count', { p_project: projectId })
      if (current && !error) setPending(Number(data) || 0)
    }
    void refresh()
    const channel = client.channel('workspace-count:' + projectId + ':' + crypto.randomUUID())
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel.on('postgres_changes', { event, schema: 'public', table: 'recruitment_updates', filter: 'project_id=eq.' + projectId }, refresh)
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') void refresh() })
    return () => { current = false; void client.removeChannel(channel) }
  }, [isManager, projectId, recruitmentHref, router])

  async function toggleModule(module: WorkspaceModule, active: boolean) {
    if (!projectId) return
    const { error } = await getSupabaseClient().rpc('set_workspace_module', { p_project: projectId, p_module: module, p_active: active })
    if (error) throw error
    setModules((current) => active ? [...new Set([...current, module])] : current.filter((entry) => entry !== module))
    if (!active) setOpened((current) => current === module ? null : current)
  }

  const refreshSupportIntegration = useCallback(async () => {
    if (!project || !hasPanelAccess) {
      setSupportIntegration(null)
      setSupportIntegrationError(null)
      setSupportIntegrationLoading(false)
      return
    }

    setSupportIntegrationLoading(true)
    try {
      const result = await loadProjectSupportIntegration(project.id)
      if (result.ok) {
        setSupportIntegration(result.integration)
        setSupportIntegrationError(null)
      } else {
        setSupportIntegrationError(result.message)
        setSupportIntegration((prev) => (isSupportSacConfigured(prev) ? prev : null))
      }
    } catch {
      setSupportIntegrationError('Não foi possível carregar a integração SAC.')
      setSupportIntegration((prev) => (isSupportSacConfigured(prev) ? prev : null))
    } finally {
      setSupportIntegrationLoading(false)
    }
  }, [hasPanelAccess, project])

  const handleSupportIntegrationChange = useCallback(
    (snapshot?: SupportIntegrationInfo) => {
      if (snapshot) {
        setSupportIntegration(snapshot)
        setSupportIntegrationError(null)
      }
      void refreshSupportIntegration()
    },
    [refreshSupportIntegration],
  )

  const refreshSupportStats = useCallback(async () => {
    if (
      !project ||
      !hasPanelAccess ||
      !canViewSupport ||
      !isSupportSacActive(supportIntegration)
    ) {
      setSupportStats(null)
      setSupportStatsLoading(false)
      return
    }

    setSupportStatsLoading(true)
    try {
      const result = await loadProjectSupportTicketStats(project.id)
      setSupportStats(result.ok ? result.stats : null)
    } catch {
      setSupportStats(null)
    } finally {
      setSupportStatsLoading(false)
    }
  }, [canViewSupport, hasPanelAccess, project, supportIntegration])

  useEffect(() => {
    if (!isSupportSacActive(supportIntegration)) {
      setSupportStats(null)
    }
  }, [supportIntegration])

  const refreshGithub = useCallback(async () => {
    if (!project || !hasPanelAccess) return
    setRepoLoading(true)
    setCommitsLoading(true)
    setReleasesLoading(true)
    setGithubError(null)
    try {
      const repo = await loadProjectGithubRepository(project.id)
      setRepository(repo)

      const showCommits =
        repo != null &&
        (repo.activity_source === 'commits' || repo.activity_source === 'both')
      const showReleases =
        repo != null &&
        (repo.activity_source === 'releases' || repo.activity_source === 'both')

      const [commitRows, releaseRows] = await Promise.all([
        showCommits ? loadProjectGithubCommits(project.id, 5) : Promise.resolve([]),
        showReleases ? loadProjectGithubReleases(project.id, 5) : Promise.resolve([]),
      ])

      setCommits(commitRows)
      setReleases(releaseRows)
    } catch (error) {
      setGithubError(
        error instanceof Error ? error.message : 'Não foi possível carregar dados do GitHub.',
      )
      setRepository(null)
      setCommits([])
      setReleases([])
    } finally {
      setRepoLoading(false)
      setCommitsLoading(false)
      setReleasesLoading(false)
    }
  }, [hasPanelAccess, project])

  useEffect(() => {
    if (!hasPanelAccess || !project || !githubOpen) return
    void refreshGithub()
  }, [githubOpen, hasPanelAccess, project, refreshGithub])

  useEffect(() => {
    if (!hasPanelAccess || !project || !supportOpen) return
    void refreshSupportIntegration()
  }, [hasPanelAccess, project, refreshSupportIntegration, supportOpen])

  useEffect(() => {
    if (!hasPanelAccess || !project || !supportOpen || !isSupportSacActive(supportIntegration)) return
    void refreshSupportStats()
  }, [hasPanelAccess, project, supportIntegration, refreshSupportStats, supportOpen])

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
    const parts: string[] = []
    if (repository.activity_source !== 'releases' && result.commits_synced > 0) {
      parts.push(`${result.commits_synced} commit(s)`)
    }
    if (repository.activity_source !== 'commits' && result.releases_synced > 0) {
      parts.push(`${result.releases_synced} release(s)`)
    }
    setFeedback(
      parts.length > 0
        ? `${parts.join(' e ')} sincronizado(s).`
        : 'Repositório já estava atualizado.',
    )
    await refreshGithub()
  }

  async function handleChangeActivitySource(next: GithubActivitySource) {
    if (!repository || repository.activity_source === next) return
    setActionLoading(true)
    setFeedback(null)
    const result = await updateGithubActivitySource(repository.id, next)
    setActionLoading(false)
    if (!result.ok) {
      setFeedback(result.message)
      return
    }
    const parts: string[] = [`Acompanhamento alterado para ${next === 'both' ? 'commits e releases' : next === 'releases' ? 'releases' : 'commits'}.`]
    if (result.commits_synced > 0) parts.push(`${result.commits_synced} commit(s) sincronizado(s)`)
    if (result.releases_synced > 0) parts.push(`${result.releases_synced} release(s) sincronizada(s)`)
    setFeedback(parts.join(' '))
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
        <Container className="space-y-4 py-5 sm:py-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="sm" className="rounded-2xl font-semibold">
              <Link href={`/projetos/${project.slug}`}>
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Página pública
              </Link>
            </Button>
            {canEditProject ? (
              <Button asChild variant="outline" size="sm" className="rounded-2xl font-semibold">
                <Link href={`/projetos/${project.slug}/editar`}>Editar projeto</Link>
              </Button>
            ) : null}
            {isManager && <Button asChild variant="outline" size="sm" className="rounded-2xl">
              <Link id="candidaturas" href={recruitmentHref}>Candidaturas{pending > 0 && <span className="rounded-full bg-primary/10 px-2 text-primary" aria-label={pending + ' pendentes'}>{pending}</span>}</Link>
            </Button>}
            <Button asChild variant="ghost" size="sm"><Link href="/mensagens">Mensagens da equipe</Link></Button>
          </div>

          <PageHeader
            eyebrow="Área da equipe"
            title={project.title}
            className="border-0 pb-0"
            actions={<ProjectStatusBadge status={project.status} />}
          />
          <AcademicPeriodSummary projectId={project.id}/>
        </Container>
      </div>

      <Container className="grid items-start gap-5 py-5 sm:py-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-5">
        <ActivityOverview data={overview.data} error={overview.error} slug={project.slug} />
        <ProjectTools active={modules} manager={isManager} loading={modulesLoading} error={modulesError}
          open={(module) => {
            if (module === 'activities') router.push('/projetos/' + project.slug + '/painel/atividades')
            else if (module === 'reports') router.push('/projetos/' + project.slug + '/painel/relatorios')
            else setOpened(module)
          }} toggle={toggleModule} />

        {githubOpen && githubError ? (
          <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {githubError}
          </p>
        ) : null}

        {(githubOpen || supportOpen) && <section className="space-y-3" aria-label="Ferramenta selecionada">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpened(null)}>Fechar ferramenta</Button>
          {githubOpen && <PanelGithubSection
            className="min-w-0"
            repository={repository}
            commits={commits}
            releases={releases}
            repoLoading={repoLoading}
            commitsLoading={commitsLoading}
            releasesLoading={releasesLoading}
            actionLoading={actionLoading}
            isManager={isManager}
            feedback={feedback}
            onConnect={() => setLinkOpen(true)}
            onSync={() => void handleSync()}
            onUnlink={() => void handleUnlink()}
            onToggleVisibility={() => void handleToggleVisibility()}
            onChangeActivitySource={(source) => void handleChangeActivitySource(source)}
            onOpenCommit={setSelectedCommit}
          />}
          {supportOpen ? (
            <PanelSupportSection
              className="h-fit min-w-0 self-start"
              projectId={project.id}
              isManager={isManager}
              integration={supportIntegration}
              integrationLoading={supportIntegrationLoading}
              integrationError={supportIntegrationError}
              onIntegrationChange={handleSupportIntegrationChange}
              stats={supportStats}
              statsLoading={supportStatsLoading}
              canViewSupport={canViewSupport}
              onRefreshStats={refreshSupportStats}
            />
          ) : null}
        </section>}
        </div>
        <PanelTeam data={overview.data} error={overview.error} now={overview.now} />
      </Container>

      <ConnectGithubDialog
        open={linkOpen && githubOpen}
        onClose={() => setLinkOpen(false)}
        projectId={project.id}
        projectSlug={project.slug}
        onLinked={(message) => {
          setLinkOpen(false)
          setFeedback(message)
          void refreshGithub()
        }}
      />

      <CommitDetailModal
        commit={githubOpen ? selectedCommit : null}
        onClose={() => setSelectedCommit(null)}
      />
    </main>
  )
}
