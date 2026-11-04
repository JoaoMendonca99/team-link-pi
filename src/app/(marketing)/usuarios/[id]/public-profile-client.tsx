'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, User } from 'lucide-react'
import { Container } from '@/components/layout/container'
import { EmptyState } from '@/components/team-link/empty-state'
import { ProjectCard } from '@/components/team-link/project-card'
import { Button } from '@/components/ui/button'
import { AcademicTags, ProfileHeading } from '@/components/profile/profile-heading'
import { FriendshipControls, useProfileSocial } from '@/components/profile/friendships'
import { getSupabaseClient } from '@/lib/supabase/client'
import { PROFILE_FIELDS } from '@/lib/profile-social'
import { mapPublicCardToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { ProfileRow, ProjectPublicCardRow } from '@/types/database'

export function PublicProfileClient({ userId }: { userId: string }) {
  const { user } = useSupabaseSession()
  const [data, setData] = useState<{ profile: ProfileRow; projects: ProjectDisplay[] } | null>()
  const [error, setError] = useState(false)
  const social = useProfileSocial(userId, user?.id)

  useEffect(() => {
    let active = true
    async function load() {
      setData(undefined)
      setError(false)
      try {
        const client = getSupabaseClient()
        const [profile, projects] = await Promise.all([
          client.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle(),
          client.from('project_public_cards').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
        ])
        if (profile.error || projects.error) throw new Error('Falha na consulta.')
        if (active) setData(profile.data ? { profile: profile.data as ProfileRow,
          projects: (projects.data as ProjectPublicCardRow[]).map(mapPublicCardToDisplay) } : null)
      } catch {
        if (active) setError(true)
      }
    }
    void load()
    return () => { active = false }
  }, [userId])

  return <main className="bg-background">
    <Container className="space-y-4 py-8">
      <Button asChild variant="ghost"><Link href="/explorar"><ArrowLeft aria-hidden /> Explorar</Link></Button>
      {error ? <p role="alert">Não foi possível carregar o perfil. Recarregue a página para tentar novamente.</p>
        : data === undefined ? <p role="status">Carregando perfil…</p>
        : data === null ? <EmptyState icon={User} title="Perfil não encontrado" description="O perfil pode ter sido removido." />
        : <>
          <ProfileHeading profile={data.profile} projects={data.projects} social={social}>
            {user?.id === userId ? <Button asChild><Link href="/perfil">Meu perfil</Link></Button> :
              user && social && <FriendshipControls userId={userId} relationship={social.relationship} />}
          </ProfileHeading>
          <AcademicTags profile={data.profile} />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Projetos públicos</h2>
            {data.projects.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.projects.map((project) => <ProjectCard key={project.id} project={project} />)}
            </div> : <p className="text-sm text-muted-foreground">Nenhum projeto público cadastrado.</p>}
          </section>
        </>}
    </Container>
  </main>
}
