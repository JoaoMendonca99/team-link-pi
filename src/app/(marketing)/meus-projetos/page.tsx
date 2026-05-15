'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { PenSquare, PlusCircle } from 'lucide-react'

import { PageHeader } from '@/components/team-link/page-header'
import { ProjectCard } from '@/components/team-link/project-card'
import { EmptyState } from '@/components/team-link/empty-state'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapProjectRowToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type { ProjectRow } from '@/types/database'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

export default function MeusProjetosPage() {
  const { loading: sessionLoading, isAuthenticated, user, profile } = useSupabaseSession()
  const [projects, setProjects] = useState<ProjectDisplay[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  const loadProjects = useCallback(async () => {
    if (!user) return

    if (!isSupabaseConfigured()) {
      setEnvMissing(true)
      return
    }

    setLoading(true)
    setFetchError(null)
    try {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('projects')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        setFetchError(error.message)
        setProjects([])
        return
      }

      const rows = (data ?? []) as ProjectRow[]
      const ownerContext = {
        ownerName: profile?.full_name ?? null,
        ownerCourse: profile?.course ?? null,
        ownerAvatarUrl: profile?.avatar_url ?? null,
      }
      setProjects(rows.map((row) => mapProjectRowToDisplay(row, ownerContext)))
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Erro desconhecido ao carregar projetos.')
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [profile?.avatar_url, profile?.course, profile?.full_name, user])

  useEffect(() => {
    if (sessionLoading) return
    if (!isAuthenticated) return
    void loadProjects()
  }, [isAuthenticated, loadProjects, sessionLoading])

  return (
    <main className="bg-background pb-20">
      <div className="border-b border-border bg-gradient-to-b from-muted/50 to-transparent">
        <Container className="space-y-10 py-14">
          <PageHeader
            eyebrow="Suas publicações"
            title="Meus projetos"
            description="Projetos que você publicou no Team Link."
            actions={
              <Button asChild className="rounded-2xl font-semibold shadow-lg shadow-primary/25">
                <Link href="/nova-ideia" className="inline-flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Nova ideia
                </Link>
              </Button>
            }
          />
        </Container>
      </div>

      <Container className="space-y-10 py-14">
        {sessionLoading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="mx-auto h-64 w-full max-w-md animate-pulse rounded-[1.65rem] bg-muted md:mx-0 md:max-w-none"
              />
            ))}
          </div>
        ) : !isAuthenticated ? (
          <div className="space-y-6">
            <EmptyState
              icon={PenSquare}
              title="Entre para ver seus projetos"
              description="Você precisa estar conectado para ver os projetos da sua conta."
              actionLabel="Ir para login"
              href="/login"
              className="mx-auto w-full max-w-md md:max-w-none"
            />
            <div className="flex justify-center">
              <Button asChild variant="outline" className="rounded-2xl font-semibold">
                <Link href="/cadastro">Criar conta</Link>
              </Button>
            </div>
          </div>
        ) : envMissing ? (
          <div
            role="status"
            className="mx-auto w-full max-w-md rounded-2xl border border-amber-400/40 bg-amber-100/60 px-4 py-3 text-center text-sm font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200 md:mx-0 md:max-w-none md:text-left"
          >
            Não foi possível carregar seus projetos no momento. Tente novamente em instantes.
          </div>
        ) : loading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="mx-auto h-64 w-full max-w-md animate-pulse rounded-[1.65rem] bg-muted md:mx-0 md:max-w-none"
              />
            ))}
          </div>
        ) : fetchError ? (
          <div className="mx-auto w-full max-w-md rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center md:max-w-none">
            <p className="text-sm font-semibold text-destructive">Não foi possível carregar seus projetos.</p>
            <p className="mt-2 text-xs text-destructive/80">{fetchError}</p>
            <Button onClick={() => void loadProjects()} className="mt-4 rounded-2xl font-semibold">
              Tentar novamente
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={PenSquare}
            title="Nenhum projeto publicado ainda"
            description="Quando você publicar um projeto, ele aparecerá aqui."
            actionLabel="Publicar projeto"
            href="/nova-ideia"
            className="mx-auto w-full max-w-md md:max-w-none"
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <div
                key={project.id}
                className="mx-auto w-full max-w-md space-y-4 md:mx-0 md:max-w-none"
              >
                <ProjectCard
                  project={project}
                  href={`/projetos/${project.slug}/painel`}
                />
                <div className="flex flex-wrap gap-3">
                  <Button asChild className="flex-1 rounded-2xl font-semibold">
                    <Link href={`/projetos/${project.slug}/painel`}>Painel do projeto</Link>
                  </Button>
                  <Button asChild variant="outline" className="flex-1 rounded-2xl font-semibold">
                    <Link href={`/projetos/${project.slug}/editar`}>Editar</Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </main>
  )
}
