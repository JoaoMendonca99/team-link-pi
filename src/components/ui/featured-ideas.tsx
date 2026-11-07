'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { MotionConfig } from 'framer-motion'

import { Container } from '@/components/layout/container'
import { ProjectCard } from '@/components/team-link/project-card'
import { Button } from '@/components/ui/button'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapPublicCardToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type { ProjectPublicCardRow } from '@/types/database'
import { projectCategories } from '@/data/mock-projects'
import styles from '@/components/home/home.module.css'
import { ProjectStart } from '@/components/home/project-start'

const FEATURED_LIMIT = 3

export function FeaturedIdeas() {
  const [projects, setProjects] = useState<ProjectDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function loadProjects() {
      setLoading(true)
      setError(false)
      try {
        if (!isSupabaseConfigured()) throw new Error('Serviço indisponível')
        const { data, error } = await getSupabaseClient()
          .from('project_public_cards')
          .select('*')
          .eq('visibility', 'public')
          .neq('status', 'archived')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(FEATURED_LIMIT)
          .abortSignal(controller.signal)
        if (error) throw error
        if (!controller.signal.aborted) setProjects(((data ?? []) as ProjectPublicCardRow[]).map(mapPublicCardToDisplay))
      } catch {
        if (!controller.signal.aborted) { setError(true); setProjects([]) }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadProjects()
    return () => controller.abort()
  }, [retry])

  return (
    <section aria-labelledby="community-title" className={`${styles.section} ${styles.community}`}>
      <Container>
        <div className={styles.communityHeading}>
          <div><p className={styles.eyebrow}>Construído pela comunidade</p><h2 id="community-title">Veja o que já está sendo desenvolvido.</h2><p>Projetos públicos reais. Ideias de diferentes áreas. Uma oportunidade de construir junto.</p></div>
          <Button asChild variant="outline" className="rounded-lg"><Link href="/explorar">Explorar todos os projetos<ArrowUpRight aria-hidden className="size-4" /></Link></Button>
        </div>
        <nav aria-label="Projetos por categoria" className={styles.categoryLinks}>{projectCategories.map(category => <Link key={category} href={`/explorar?category=${encodeURIComponent(category)}`}>{category}</Link>)}</nav>
        {loading ? (
          <div role="status" aria-label="Carregando projetos da comunidade" className={`grid gap-6 md:grid-cols-2 xl:grid-cols-3 ${styles.communityCards}`}>
            {Array.from({ length: FEATURED_LIMIT }).map((_, index) => (
              <div
                key={index}
                className="h-96 w-full animate-pulse rounded-[1.65rem] border border-border bg-card motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className={styles.communityFeedback}><p>Não foi possível carregar os projetos agora. Você pode tentar novamente ou acessar o catálogo.</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>Tentar novamente</Button></div>
        ) : projects.length === 0 ? (
          <div className={styles.communityFeedback}><p>Nenhum projeto público disponível no momento. Sua próxima ideia pode começar esta comunidade.</p><ProjectStart>Começar um projeto</ProjectStart></div>
        ) : (
          <MotionConfig reducedMotion="user"><div className={`grid gap-6 ${projects.length === 1 ? 'mx-auto max-w-xl' : projects.length === 2 ? 'mx-auto max-w-5xl md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3'} ${styles.communityCards}`}>
            {projects.map((project) => (
              <div key={project.id} className="min-w-0">
                <ProjectCard project={project} />
              </div>
            ))}
          </div></MotionConfig>
        )}
      </Container>
    </section>
  )
}
