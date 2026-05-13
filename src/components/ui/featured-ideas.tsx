'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Layers } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { EmptyState } from '@/components/team-link/empty-state'
import { ProjectCard } from '@/components/team-link/project-card'
import { Button } from '@/components/ui/button'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapPublicCardToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type { ProjectPublicCardRow } from '@/types/database'

const FEATURED_LIMIT = 3

export function FeaturedIdeas() {
  const [projects, setProjects] = useState<ProjectDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [envMissing, setEnvMissing] = useState(false)

  const loadProjects = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setEnvMissing(true)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('project_public_cards')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(FEATURED_LIMIT)

      if (error) {
        setProjects([])
        return
      }

      const rows = (data ?? []) as ProjectPublicCardRow[]
      setProjects(rows.map(mapPublicCardToDisplay))
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  return (
    <section className="border-b border-border bg-muted/30 py-20 dark:bg-background">
      <Container className="space-y-12">
        <div className="flex flex-col gap-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">Projetos recentes</p>
          <h2 className="text-balance text-3xl font-bold sm:text-4xl">O que a comunidade está publicando</h2>
          <p className="mx-auto max-w-3xl text-base text-muted-foreground">
            Veja os projetos mais recentes do Team Link e descubra equipes para colaborar.
          </p>
        </div>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: FEATURED_LIMIT }).map((_, index) => (
              <div
                key={index}
                className="mx-auto h-64 w-full max-w-md animate-pulse rounded-[1.65rem] bg-card md:mx-0 md:max-w-none"
              />
            ))}
          </div>
        ) : envMissing || projects.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Nenhum projeto publicado ainda"
            description={
              envMissing
                ? 'Não foi possível carregar os projetos no momento. Tente novamente em instantes.'
                : 'Seja o primeiro a publicar uma ideia. Em segundos ela aparecerá nesta vitrine.'
            }
            actionLabel="Criar primeira ideia"
            href="/nova-ideia"
            className="mx-auto w-full max-w-md border-border bg-card shadow-sm dark:bg-card md:max-w-none"
          />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <div key={project.id} className="mx-auto w-full max-w-md md:mx-0 md:max-w-none">
                <ProjectCard project={project} />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-center">
          <Button size="lg" asChild variant="outline" className="rounded-2xl px-10 font-semibold">
            <Link href="/explorar">Abrir explorar</Link>
          </Button>
        </div>
      </Container>
    </section>
  )
}
