'use client'

import Link from 'next/link'
import { MyApplications } from '@/components/team-link/recruitment'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Layers, PlusCircle } from 'lucide-react'

import { EmptyState } from '@/components/team-link/empty-state'
import { ProjectCard } from '@/components/team-link/project-card'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapPublicCardToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type {
  ProjectMemberRoleValue,
  ProjectMemberStatusValue,
  ProjectPublicCardRow,
} from '@/types/database'
import { AcademicTags, ProfileHeading } from '@/components/profile/profile-heading'
import { FriendsPanel, useProfileSocial } from '@/components/profile/friendships'
import { useProjectLeadership } from '@/hooks/use-project-leadership'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

interface Participation {
  membershipId: string
  role: ProjectMemberRoleValue
  joinedAt: string
  project: ProjectDisplay
}

interface MembershipRow {
  id: string
  role: ProjectMemberRoleValue
  status: ProjectMemberStatusValue
  joined_at: string
  project_id: string
}

function formatDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('pt-BR')
}

export default function ProfilePage() {
  const { loading, isAuthenticated, profile, user } = useSupabaseSession()

  const social = useProfileSocial(user?.id, user?.id)
  const [tab, setTab] = useState<'Projetos' | 'Amigos' | 'Candidaturas'>('Projetos')
  const [ownProjects, setOwnProjects] = useState<ProjectDisplay[]>([])
  const [participations, setParticipations] = useState<Participation[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  const loadData = useCallback(async () => {
    if (!user) return

    if (!isSupabaseConfigured()) {
      setEnvMissing(true)
      return
    }

    setProjectsLoading(true)
    setFetchError(null)

    try {
      const client = getSupabaseClient()

      const ownResult = await client
        .from('project_public_cards')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (ownResult.error) throw ownResult.error

      const ownRows = (ownResult.data ?? []) as ProjectPublicCardRow[]
      const ownDisplay = ownRows.map(mapPublicCardToDisplay)
      setOwnProjects(ownDisplay)

      const memberResult = await client
        .from('project_members')
        .select('id, role, status, joined_at, project_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .neq('role', 'owner')
        .order('joined_at', { ascending: false })

      if (memberResult.error) throw memberResult.error

      const memberRows = (memberResult.data ?? []) as MembershipRow[]

      if (memberRows.length === 0) {
        setParticipations([])
        return
      }

      const projectIds = memberRows.map((row) => row.project_id)
      const participatingResult = await client
        .from('project_public_cards')
        .select('*')
        .in('id', projectIds)

      if (participatingResult.error) throw participatingResult.error

      const byId = new Map<string, ProjectDisplay>()
      const participatingRows = (participatingResult.data ?? []) as ProjectPublicCardRow[]
      participatingRows.forEach((row) => byId.set(row.id, mapPublicCardToDisplay(row)))

      const list: Participation[] = memberRows
        .map((row) => {
          const project = byId.get(row.project_id)
          if (!project) return null
          return {
            membershipId: row.id,
            role: row.role,
            joinedAt: row.joined_at,
            project,
          }
        })
        .filter((value): value is Participation => value !== null)

      setParticipations(list)
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar suas informações no momento.',
      )
      setOwnProjects([])
      setParticipations([])
    } finally {
      setProjectsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) return
    void loadData()
  }, [isAuthenticated, loadData, loading])

  const stats = useMemo(() => {
    const projectsPublished = ownProjects.length
    const likesReceived = ownProjects.reduce((sum, project) => sum + project.likesCount, 0)
    const commentsReceived = ownProjects.reduce((sum, project) => sum + project.commentsCount, 0)
    const participationsCount = participations.length
    return { projectsPublished, likesReceived, commentsReceived, participationsCount }
  }, [ownProjects, participations])

  if (loading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-1/2 rounded-2xl bg-muted" />
            <div className="h-6 w-3/4 rounded-2xl bg-muted" />
            <div className="h-40 rounded-3xl bg-muted" />
          </div>
        </Container>
      </main>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <EmptyState
            icon={Layers}
            title="Você precisa estar conectado para ver o perfil"
            description="Entre com sua conta para visualizar e editar suas informações."
            actionLabel="Ir para login"
            href="/login"
            className="mx-auto w-full max-w-md md:max-w-none"
          />
          <div className="mt-6 text-center">
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link href="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  return (
    <main className="bg-background pb-12">
      <Container className="space-y-4 py-8">
        {profile ? <ProfileHeading profile={profile} projects={ownProjects}
          projectCount={new Set([...ownProjects.map(({ id }) => id), ...participations.map(({ project }) => project.id)]).size}
          social={social} own>
          <Button asChild variant="ghost"><Link href="/meus-projetos">Meus projetos</Link></Button>
        </ProfileHeading> : <p role="alert">Não foi possível carregar seu perfil.</p>}

        <dl className="grid grid-cols-2 gap-2 rounded-2xl border border-card-outline bg-card p-4 sm:grid-cols-4">
          {[
            ['Projetos publicados', stats.projectsPublished], ['Participações', stats.participationsCount],
            ['Curtidas recebidas', stats.likesReceived], ['Comentários recebidos', stats.commentsReceived],
          ].map(([label, value]) => <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold">{value}</dd>
          </div>)}
        </dl>

        {profile && <AcademicTags profile={profile} />}

        <nav aria-label="Seções do perfil" className="flex flex-wrap gap-1 rounded-2xl border border-card-outline bg-card p-1">
          {(['Projetos', 'Amigos', 'Candidaturas'] as const).map((label) => <Button
            key={label} type="button" variant={tab === label ? 'default' : 'ghost'} size="sm"
            aria-pressed={tab === label} onClick={() => setTab(label)}>{label}</Button>)}
        </nav>

        {tab === 'Projetos' && (
          <div className="space-y-5">
            {(fetchError || envMissing) && <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">Não foi possível carregar seus projetos.</p>
              <Button type="button" variant="outline" onClick={() => void loadData()}>Tentar novamente</Button>
            </div>}
            {projectsLoading && <p role="status" className="text-sm text-muted-foreground">Carregando projetos…</p>}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">Projetos criados por você</h2>
                <Button asChild variant="outline" size="sm"><Link href="/nova-ideia"><PlusCircle aria-hidden /> Nova ideia</Link></Button>
              </div>
              {ownProjects.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {ownProjects.map((project) => <ProfileProject key={project.id} project={project} userId={user.id} />)}
              </div> : !projectsLoading && <p className="text-sm text-muted-foreground">Nenhum projeto público criado.</p>}
            </section>
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">Participações em projetos de outras pessoas</h2>
              {participations.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {participations.map(({ membershipId, project, joinedAt }) => <div key={membershipId} className="flex min-w-0 flex-col gap-2">
                  {joinedAt && <p className="text-xs text-muted-foreground">Desde {formatDate(joinedAt)}</p>}
                  <ProfileProject project={project} userId={user.id} />
                </div>)}
              </div> : !projectsLoading && <p className="text-sm text-muted-foreground">Nenhuma participação registrada.</p>}
            </section>
          </div>
        )}
        {tab === 'Amigos' && <FriendsPanel key={user.id} />}
        {tab === 'Candidaturas' && <MyApplications key={user.id} userId={user.id} />}
      </Container>
    </main>
  )
}

function ProfileProject({ project, userId }: { project: ProjectDisplay; userId: string }) {
  const canEdit = useProjectLeadership(project.id, userId)
  return <ProjectCard project={project} className="h-auto min-w-0 flex-1" footer={<>
      <Button asChild size="sm" variant="outline"><Link href={'/projetos/' + project.slug}>Ver projeto</Link></Button>
      {canEdit && <Button asChild size="sm" variant="ghost"><Link href={'/projetos/' + project.slug + '/editar'}>Editar</Link></Button>}
  </>} />
}
