'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft, MessageCircle, User } from 'lucide-react'
import { Container } from '@/components/layout/container'
import { EmptyState } from '@/components/team-link/empty-state'
import { ProfileProjects } from '@/components/profile/profile-projects'
import { Button } from '@/components/ui/button'
import { AcademicTags, ProfileHeading } from '@/components/profile/profile-heading'
import { FriendshipControls, useProfileSocial } from '@/components/profile/friendships'
import { getSupabaseClient } from '@/lib/supabase/client'
import { canonicalProfileCourse, PROFILE_FIELDS } from '@/lib/profile-social'
import { loadProfileProjects, type ProfileProjects as ProfileProjectsData } from '@/lib/profile-projects'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { ProfileRow } from '@/types/database'

export function PublicProfileClient({ userId }: { userId: string }) {
  const { user } = useSupabaseSession()
  const [result, setResult] = useState<{ key: string; data: { profile: ProfileRow; projects: ProfileProjectsData } | null }>()
  const key = userId + ':' + (user?.id ?? '')
  const data = result?.key === key ? result.data : undefined
  const [error, setError] = useState(false)
  const social = useProfileSocial(userId, user?.id)

  useEffect(() => {
    let active = true
    async function load() {
      setResult(undefined)
      setError(false)
      try {
        const client = getSupabaseClient()
        const [profile, projects] = await Promise.all([
          client.from('profiles').select(PROFILE_FIELDS).eq('id', userId).maybeSingle(),
          loadProfileProjects(userId),
        ])
        if (profile.error) throw new Error('Falha na consulta.')
        if (active) setResult({ key, data: profile.data ? { profile: canonicalProfileCourse(profile.data as ProfileRow)!,
          projects } : null })
      } catch {
        if (active) setError(true)
      }
    }
    void load()
    const refresh = () => { if (!document.hidden) void load() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [key, userId, user?.id])

  return <main className="bg-background">
    <Container className="space-y-4 py-8">
      <Button asChild variant="ghost"><Link href="/explorar"><ArrowLeft aria-hidden /> Explorar</Link></Button>
      {error ? <p role="alert">Não foi possível carregar o perfil. Recarregue a página para tentar novamente.</p>
        : data === undefined ? <p role="status">Carregando perfil…</p>
        : data === null ? <EmptyState icon={User} title="Perfil não encontrado" description="O perfil pode ter sido removido." />
        : <>
          <ProfileHeading profile={data.profile} projects={data.projects.created} projectCount={data.projects.total} social={social}>
            {user?.id === userId ? <Button asChild><Link href="/perfil">Meu perfil</Link></Button> :
              user && social && <>
                <FriendshipControls userId={userId} relationship={social.relationship} />
                {social.relationship === 'accepted' && <Button asChild variant="outline">
                  <Link href={'/mensagens?aba=amigos&amigo=' + userId}><MessageCircle aria-hidden /> Enviar mensagem</Link>
                </Button>}
              </>}
          </ProfileHeading>
          <AcademicTags profile={data.profile} />
          <ProfileProjects key={userId} data={data.projects} />
        </>}
    </Container>
  </main>
}
