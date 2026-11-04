'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { PageHeader } from '@/components/team-link/page-header'
import { ProjectForm } from '@/components/team-link/project-form'
import type { Vacancy } from '@/components/team-link/recruitment'
import { Button } from '@/components/ui/button'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import type { ProjectRow } from '@/types/database'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type EditorData = { project: ProjectRow; tags: string[]; vacancies: Vacancy[] }
type Result =
  | { state: 'ready'; data: EditorData }
  | { state: 'loading' | 'denied' | 'missing' | 'error' }

export function ProjectEditorClient({ slug }: { slug: string }) {
  const { loading: sessionLoading, user } = useSupabaseSession()
  const userId = user?.id
  const [result, setResult] = useState<Result>({ state: 'loading' })
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return
    let active = true
    async function load() {
      try {
        const client = getSupabaseClient()
        let response = await client.from('projects').select('*').eq('slug', slug).maybeSingle()
        if (!response.error && !response.data && UUID_RE.test(slug)) {
          response = await client.from('projects').select('*').eq('id', slug).maybeSingle()
        }
        if (response.error) throw response.error
        const project = response.data as ProjectRow | null
        if (!active) return
        if (!project) return setResult({ state: 'missing' })
        const leadership = await client.rpc('is_project_join_manager', { p_project_id: project.id })
        if (leadership.error) throw leadership.error
        if (!active) return
        if (!leadership.data) return setResult({ state: 'denied' })

        const [tags, vacancies] = await Promise.all([
          client.from('project_tags').select('tag').eq('project_id', project.id),
          client.rpc('recruitment_vacancies', { p_project: project.id }),
        ])
        if (tags.error || vacancies.error) throw tags.error ?? vacancies.error
        if (active) setResult({
          state: 'ready',
          data: { project, tags: tags.data.map((row) => row.tag), vacancies: vacancies.data as Vacancy[] },
        })
      } catch {
        if (active) setResult({ state: 'error' })
      }
    }
    void load()
    return () => { active = false }
  }, [slug, userId, retry])

  return (
    <main className="bg-background pb-20">
      <div className="border-b border-border bg-gradient-to-br from-muted/60 via-background to-background">
        <Container className="space-y-6 py-12">
          <Button asChild variant="ghost" className="gap-2">
            <Link href={'/projetos/' + slug}><ArrowLeft aria-hidden className="size-4" /> Voltar ao projeto</Link>
          </Button>
          <PageHeader title="Editar projeto" description="Atualize a apresentação, as vagas e as configurações de publicação." />
        </Container>
      </div>
      <Container className="py-8 sm:py-12">
        {sessionLoading ? <p role="status">Carregando…</p>
          : !isSupabaseConfigured() ? <p role="alert">Não foi possível conectar ao serviço de dados.</p>
          : !userId ? (
            <div className="space-y-4">
              <p>Entre na sua conta para editar o projeto.</p>
              <Button asChild><Link href="/login">Entrar</Link></Button>
            </div>
          )
          : result.state === 'loading' ? <p role="status">Carregando…</p>
          : result.state === 'missing' ? <p>Projeto não encontrado.</p>
          : result.state === 'denied' ? <p>Somente Líderes ou Gestores podem editar os dados do projeto.</p>
          : result.state === 'error' ? (
            <div className="space-y-4">
              <p role="alert">Não foi possível carregar o projeto e suas vagas.</p>
              <Button onClick={() => { setResult({ state: 'loading' }); setRetry((value) => value + 1) }}>Tentar novamente</Button>
            </div>
          )
          : result.state === 'ready' ? <ProjectForm key={result.data.project.id} project={result.data.project}
              initialTags={result.data.tags} initialVacancies={result.data.vacancies} /> : null}
      </Container>
    </main>
  )
}
