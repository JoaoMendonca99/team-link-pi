'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Construction } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { EmptyState } from '@/components/team-link/empty-state'
import { PageHeader } from '@/components/team-link/page-header'
import { Button } from '@/components/ui/button'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapPublicDetailToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type { ProjectPublicDetailRow } from '@/types/database'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

export function ProjectEditorClient({ slug }: { slug: string }) {
  const { loading: sessionLoading, isAuthenticated, user } = useSupabaseSession()
  const [project, setProject] = useState<ProjectDisplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

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
      const { data, error } = await client
        .from('project_public_details')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (error) {
        setFetchError(error.message)
        return
      }
      if (!data) {
        setNotFound(true)
        return
      }
      setProject(mapPublicDetailToDisplay(data as ProjectPublicDetailRow))
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Erro desconhecido ao carregar projeto.')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    void loadProject()
  }, [loadProject])

  if (sessionLoading || loading) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-1/2 rounded-2xl bg-muted" />
            <div className="h-64 rounded-3xl bg-muted" />
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
            icon={Construction}
            title="Conexão com Supabase ausente"
            description="Configure NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY em .env.local para abrir esta página."
            actionLabel="Voltar para Meus Projetos"
            href="/meus-projetos"
          />
        </Container>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <PageHeader title="Acesso necessário" description="Entre com sua conta para editar este projeto." />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-2xl font-semibold">
              <Link href="/login">Ir para login</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  if (fetchError) {
    return (
      <main className="bg-background">
        <Container className="py-24">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-destructive">Não foi possível carregar este projeto.</p>
            <p className="mt-2 text-xs text-destructive/80">{fetchError}</p>
            <Button onClick={() => void loadProject()} className="mt-4 rounded-2xl font-semibold">
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
            icon={Construction}
            title="Projeto não encontrado"
            description="O endereço acessado não corresponde a um projeto público ou foi removido."
            actionLabel="Voltar para Meus Projetos"
            href="/meus-projetos"
          />
        </Container>
      </main>
    )
  }

  const isOwner = user?.id === project.ownerId

  return (
    <main className="bg-background pb-20">
      <div className="border-b border-border bg-gradient-to-b from-muted/50 to-transparent">
        <Container className="space-y-8 py-14">
          <Button asChild variant="ghost" className="w-fit gap-2 rounded-2xl font-semibold">
            <Link href={`/projetos/${project.slug}`}>
              <ArrowLeft className="h-4 w-4" />
              Voltar ao projeto
            </Link>
          </Button>

          <PageHeader
            eyebrow="Edição de projeto"
            title={project.title}
            description={
              isOwner
                ? 'A edição completa será habilitada na próxima etapa. Por enquanto, você pode visualizar os dados atuais do projeto.'
                : 'Apenas o owner do projeto pode editá-lo. Você pode visualizar os dados atuais, mas o formulário de edição está restrito.'
            }
          />

          {!isOwner ? (
            <div
              role="status"
              className="rounded-2xl border border-amber-400/40 bg-amber-100/60 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
            >
              Esta página requer que você seja o owner do projeto (RLS no banco também bloqueia atualizações de outros usuários).
            </div>
          ) : null}
        </Container>
      </div>

      <Container size="article" className="space-y-6 py-14">
        <section className="rounded-[1.85rem] border border-border bg-card p-8 shadow-sm">
          <h2 className="text-xl font-semibold">Dados atuais</h2>
          <dl className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Slug</dt>
              <dd className="mt-1 font-mono text-sm">{project.slug}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</dt>
              <dd className="mt-1">{project.status}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visibilidade</dt>
              <dd className="mt-1">{project.visibility}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vagas abertas</dt>
              <dd className="mt-1">{project.openSpots}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Categoria</dt>
              <dd className="mt-1">{project.category ?? '—'}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição curta</dt>
              <dd className="mt-1 whitespace-pre-line">{project.shortDescription || '—'}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descrição completa</dt>
              <dd className="mt-1 whitespace-pre-line">{project.description ?? '—'}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</dt>
              <dd className="mt-1">{project.tags.length > 0 ? project.tags.join(', ') : '—'}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Habilidades procuradas</dt>
              <dd className="mt-1">
                {project.requiredSkills.length > 0 ? project.requiredSkills.join(', ') : '—'}
              </dd>
            </div>
          </dl>
        </section>

        <div className="flex flex-wrap gap-4">
          <Button asChild className="rounded-2xl px-8 font-semibold">
            <Link href={`/projetos/${project.slug}`}>Ver projeto público</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl font-semibold">
            <Link href="/meus-projetos">Voltar para Meus Projetos</Link>
          </Button>
        </div>
      </Container>
    </main>
  )
}
