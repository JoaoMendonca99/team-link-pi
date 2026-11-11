'use client'

import Link from 'next/link'
import { MyApplications } from '@/components/team-link/recruitment'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Layers, PlusCircle } from 'lucide-react'

import { EmptyState } from '@/components/team-link/empty-state'
import { ProjectCard } from '@/components/team-link/project-card'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import { isSupabaseConfigured } from '@/lib/supabase/client'
import { loadProfileProjects, type ProfileProjects as ProfileProjectsData } from '@/lib/profile-projects'
import { ProfileProjects } from '@/components/profile/profile-projects'
import type { ProjectDisplay } from '@/lib/projects/display'
import { AcademicTags, ProfileHeading } from '@/components/profile/profile-heading'
import { FriendsPanel, useProfileSocial } from '@/components/profile/friendships'
import { useProjectLeadership } from '@/hooks/use-project-leadership'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

export function ProfileContent({ embedded=false }: { embedded?:boolean }) {
  const params = useSearchParams()
  const router = useRouter()
  const tab = embedded ? 'Projetos' : params.get('aba') === 'amigos' ? 'Amigos' : params.get('aba') === 'candidaturas' ? 'Candidaturas' : 'Projetos'
  const { loading, isAuthenticated, profile, user } = useSupabaseSession()

  const social = useProfileSocial(user?.id, user?.id)
  const [projectResult, setProjectResult] = useState<{ userId: string; data: ProfileProjectsData }>()
  const projects = projectResult?.userId === user?.id && projectResult ? projectResult.data : { created: [], participating: [], total: 0 }
  const ownProjects = projects.created
  const participations = projects.participating
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
      const data = await loadProfileProjects(user.id)
      setProjectResult({ userId: user.id, data })
    } catch (error) {
      setFetchError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar suas informações no momento.',
      )
      setProjectResult(undefined)
    } finally {
      setProjectsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (loading) return
    if (!isAuthenticated) return
    void loadData()
    const refresh = () => { if (!document.hidden) void loadData() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
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
      <div className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-1/2 rounded-2xl bg-muted" />
            <div className="h-6 w-3/4 rounded-2xl bg-muted" />
            <div className="h-40 rounded-3xl bg-muted" />
          </div>
        </Container>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="bg-background">
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
      </div>
    )
  }

  return (
    <div className="min-w-0 bg-background">
      <Container className={embedded?"space-y-4 px-0 sm:px-0 lg:px-0":"space-y-4 py-8"}>
        {profile ? <ProfileHeading profile={profile} projects={ownProjects}
          projectCount={projects.total}
          social={social} own editHref={embedded?'/meu-espaco/perfil/editar':'/perfil/editar'}>
          <Button asChild variant="ghost"><Link href={embedded?'/meu-espaco/projetos':'/meus-projetos'}>Meus projetos</Link></Button>
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

        {!embedded && <nav aria-label="Seções do perfil" className="flex flex-wrap gap-1 rounded-2xl border border-card-outline bg-card p-1">
          {(['Projetos', 'Amigos', 'Candidaturas'] as const).map((label) => <Button
            key={label} type="button" variant={tab === label ? 'default' : 'ghost'} size="sm"
            aria-pressed={tab === label} onClick={() => router.replace(label === 'Projetos' ? '/perfil' : '/perfil?aba=' + label.toLocaleLowerCase('pt-BR'), { scroll: false })}>{label}</Button>)}
        </nav>}

        {tab === 'Projetos' && (
          <section aria-labelledby={embedded ? "profile-projects-title" : undefined} className="space-y-5">
            {embedded && <h2 id="profile-projects-title" className="text-lg font-semibold">Projetos</h2>}
            {(fetchError || envMissing) && <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">Não foi possível carregar seus projetos.</p>
              <Button type="button" variant="outline" onClick={() => void loadData()}>Tentar novamente</Button>
            </div>}
            {projectsLoading && <p role="status" className="text-sm text-muted-foreground">Carregando projetos…</p>}
            {!projectsLoading && !fetchError && !envMissing && <ProfileProjects data={projects}
              renderProject={project => <ProfileProject project={project} userId={user.id} />}
              action={!embedded && <Button asChild variant="outline" size="sm"><Link href="/nova-ideia"><PlusCircle aria-hidden /> Nova ideia</Link></Button>} />}
          </section>
        )}
        {tab === 'Amigos' && <FriendsPanel key={user.id} initialSection={params.get('secao') === 'recebidas' ? 'received' : 'accepted'} />}
        {tab === 'Candidaturas' && <MyApplications key={user.id} userId={user.id} initialRequestId={params.get('candidatura')} />}
      </Container>
    </div>
  )
}

function ProfileProject({ project, userId }: { project: ProjectDisplay; userId: string }) {
  const canEdit = useProjectLeadership(project.id, userId)
  return <ProjectCard project={project} className="h-auto min-w-0 flex-1" footer={<>
      <Button asChild size="sm" variant="outline"><Link href={'/projetos/' + project.slug}>Ver projeto</Link></Button>
      {canEdit && <Button asChild size="sm" variant="ghost"><Link href={'/projetos/' + project.slug + '/editar'}>Editar</Link></Button>}
  </>} />
}
