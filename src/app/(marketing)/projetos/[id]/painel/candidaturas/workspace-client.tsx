'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/layout/container'
import { RecruitmentManager } from '@/components/team-link/recruitment'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { authorizeRecruitmentWorkspace } from './authorize'

export function RecruitmentWorkspace({ slug }: { slug: string }) {
  const { user, loading } = useSupabaseSession()
  const userId = user?.id
  const [result, setResult] = useState<{ userId: string; project: Awaited<ReturnType<typeof authorizeRecruitmentWorkspace>> }>()
  useEffect(() => {
    if (!userId) return
    let current = true
    async function verify() {
      try {
        const { data: { session } } = await getSupabaseClient().auth.getSession()
        const project = session && session.user.id === userId ? await authorizeRecruitmentWorkspace(slug, session.access_token) : null
        if (current && userId) setResult({ userId, project })
      } catch {
        if (current && userId) setResult({ userId, project: null })
      }
    }
    void verify()
    return () => { current = false }
  }, [slug, userId])

  const project = result?.userId === userId ? result?.project : null
  return <main><Container className="space-y-6 py-8">
    <Button asChild variant="outline" size="sm"><Link href={'/projetos/' + encodeURIComponent(slug) + '/painel'}>Voltar ao painel</Link></Button>
    {loading || (userId && result?.userId !== userId) ? <p role="status">Verificando acesso…</p> :
      project ? <>
        <header className="space-y-1"><p className="text-sm text-muted-foreground">{project.title}</p>
          <h1 className="text-2xl font-bold">Vagas e candidaturas</h1></header>
        <RecruitmentManager projectId={project.id} />
      </> : <p role="alert">Esta área está disponível para Líderes e Gestores do projeto.</p>}
  </Container></main>
}
