'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Heart, Layers, MessageSquare, PlusCircle, Users } from 'lucide-react'

import { ProjectCard } from '@/components/team-link/project-card'
import { StatCard } from '@/components/team-link/stat-card'
import { TagList } from '@/components/team-link/tag-list'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { EmptyState } from '@/components/team-link/empty-state'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapPublicCardToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type {
  ProjectMemberRoleValue,
  ProjectMemberStatusValue,
  ProjectPublicCardRow,
} from '@/types/database'
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

function roleLabel(role: ProjectMemberRoleValue): string {
  switch (role) {
    case 'mentor':
      return 'Mentor'
    case 'member':
      return 'Membro'
    case 'owner':
    default:
      return 'Dono'
  }
}

export default function ProfilePage() {
  const { loading, isAuthenticated, profile, user } = useSupabaseSession()

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
            description="Entre com sua conta para visualizar e editar seus dados acadêmicos."
            actionLabel="Ir para login"
            href="/login"
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

  const fullName = profile?.full_name?.trim() || user.email?.split('@')[0] || 'Conta Team Link'
  const email = profile?.email ?? user.email ?? ''
  const course = profile?.course?.trim() || 'Curso não informado'
  const bio =
    profile?.bio?.trim() ||
    'Você ainda não adicionou uma biografia. Edite seu perfil para apresentar sua trajetória, interesses e habilidades.'
  const skills = profile?.skills ?? []
  const interests = profile?.interests ?? []
  const avatarUrl = profile?.avatar_url ?? undefined
  const joinedAt = formatDate(profile?.created_at)

  const showOwnSkeleton = projectsLoading && ownProjects.length === 0
  const showParticipationSkeleton = projectsLoading && participations.length === 0

  return (
    <main className="bg-muted/40 pb-20">
      <div className="relative overflow-hidden rounded-b-[40px] border-b border-white/60 bg-[#081021] pb-24 pt-24 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute right-[-20%] top-[-35%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,#2563EB_0%,transparent_70%)] blur-3xl opacity-95" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(8,16,39,0.95),rgba(79,70,229,0.35))]" />
        </div>
        <Container className="relative flex flex-col gap-10 text-center md:flex-row md:items-end md:text-left">
          <UserAvatar name={fullName} imageUrl={avatarUrl} ring sizeClassName="h-24 w-24" />
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.3em] text-white/65">Perfil acadêmico</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-bold">{fullName}</h1>
              <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
                {course}
              </span>
            </div>
            <p className="max-w-2xl text-white/85">{bio}</p>
            {email ? <p className="text-sm text-white/70">{email}</p> : null}
            {joinedAt ? <p className="text-sm text-white/60">Perfil criado em {joinedAt}</p> : null}
            <div className="flex flex-wrap gap-3">
              <Button asChild className="rounded-2xl font-semibold shadow-lg shadow-primary/30">
                <Link href="/perfil/editar">Editar perfil</Link>
              </Button>
              <Button
                asChild
                variant="secondary"
                className="rounded-2xl border border-white/20 bg-transparent text-white hover:bg-white/15"
              >
                <Link href="/meus-projetos">Meus projetos</Link>
              </Button>
            </div>
          </div>
        </Container>
      </div>

      <Container className="space-y-14 py-14">
        <div className="grid gap-4 md:grid-cols-4">
          <StatCard icon={Layers} label="Projetos publicados" value={stats.projectsPublished} />
          <StatCard icon={Heart} label="Curtidas recebidas" value={stats.likesReceived} />
          <StatCard icon={Users} label="Participações" value={stats.participationsCount} />
          <StatCard
            icon={MessageSquare}
            label="Comentários recebidos"
            value={stats.commentsReceived}
          />
        </div>

        {envMissing ? (
          <div
            role="status"
            className="rounded-2xl border border-amber-400/40 bg-amber-100/60 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
          >
            Não foi possível conectar ao serviço de dados. Tente novamente em instantes.
          </div>
        ) : null}

        {fetchError ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-destructive">
              Não foi possível carregar seus projetos no momento.
            </p>
            <p className="mt-2 text-xs text-destructive/80">{fetchError}</p>
            <Button onClick={() => void loadData()} className="mt-4 rounded-2xl font-semibold">
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {skills.length > 0 ? (
          <section className="rounded-[2rem] border border-border bg-card p-8 shadow-xl">
            <h2 className="text-xl font-semibold text-foreground">Habilidades</h2>
            <div className="mt-4">
              <TagList tags={skills} max={skills.length} size="md" />
            </div>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-dashed border-border bg-card/40 p-8">
            <h2 className="text-xl font-semibold text-foreground">Habilidades</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Você ainda não cadastrou habilidades. Edite seu perfil para incluí-las e ser encontrado por projetos compatíveis.
            </p>
          </section>
        )}

        {interests.length > 0 ? (
          <section className="rounded-[2rem] border border-border bg-card p-8 shadow-xl">
            <h2 className="text-xl font-semibold text-foreground">Áreas de interesse</h2>
            <div className="mt-4">
              <TagList tags={interests} max={interests.length} size="md" />
            </div>
          </section>
        ) : null}

        <section className="space-y-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-primary">Suas publicações</p>
              <h2 className="text-3xl font-bold">Projetos publicados</h2>
              <p className="text-sm text-muted-foreground">
                Ideias que você criou no Team Link.
              </p>
            </div>
            <Button asChild className="rounded-2xl font-semibold shadow-lg shadow-primary/25">
              <Link href="/nova-ideia" className="inline-flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                Nova ideia
              </Link>
            </Button>
          </div>

          {showOwnSkeleton ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-64 animate-pulse rounded-[1.65rem] bg-muted" />
              ))}
            </div>
          ) : ownProjects.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="Nenhum projeto publicado"
              description="Quando você criar uma ideia, ela aparecerá aqui."
              actionLabel="Criar nova ideia"
              href="/nova-ideia"
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {ownProjects.map((project) => (
                <div key={project.id} className="space-y-4">
                  <ProjectCard project={project} />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      asChild
                      variant="outline"
                      className="flex-1 rounded-2xl font-semibold"
                    >
                      <Link href={`/projetos/${project.slug}/editar`}>Editar</Link>
                    </Button>
                    <Button asChild className="flex-1 rounded-2xl font-semibold">
                      <Link href={`/projetos/${project.slug}`}>Ver projeto</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Equipes</p>
            <h2 className="text-3xl font-bold">Participações em projetos</h2>
            <p className="text-sm text-muted-foreground">
              Projetos de outras pessoas dos quais você faz parte.
            </p>
          </div>

          {showParticipationSkeleton ? (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-64 animate-pulse rounded-[1.65rem] bg-muted" />
              ))}
            </div>
          ) : participations.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Sem participações registradas"
              description="Quando você entrar em um projeto de outra pessoa, ele aparecerá aqui."
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {participations.map((participation) => {
                const joinedLabel = formatDate(participation.joinedAt)
                return (
                  <div key={participation.membershipId} className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {roleLabel(participation.role)}
                      </span>
                      {joinedLabel ? (
                        <span className="text-xs text-muted-foreground">
                          Desde {joinedLabel}
                        </span>
                      ) : null}
                    </div>
                    <ProjectCard project={participation.project} />
                    <Button asChild className="w-full rounded-2xl font-semibold">
                      <Link href={`/projetos/${participation.project.slug}`}>Ver projeto</Link>
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </Container>
    </main>
  )
}
