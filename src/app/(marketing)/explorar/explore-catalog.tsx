'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/team-link/page-header'
import { ProjectCard } from '@/components/team-link/project-card'
import { EmptyState } from '@/components/team-link/empty-state'
import type { ExploreSort, ExploreStatusFilter } from '@/components/team-link/search-and-filters'
import { SearchAndFilters } from '@/components/team-link/search-and-filters'
import { projectCategories } from '@/data/mock-projects'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { mapPublicCardToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type { ProjectPublicCardRow } from '@/types/database'
import { PlusCircle, Search } from 'lucide-react'

function filterProjects(
  list: ProjectDisplay[],
  searchTerm: string,
  category: string,
  status: ExploreStatusFilter,
  tag: string,
): ProjectDisplay[] {
  const term = searchTerm.trim().toLowerCase()

  return list.filter((project) => {
    const matchesTerm =
      term.length === 0 ||
      project.title.toLowerCase().includes(term) ||
      project.shortDescription.toLowerCase().includes(term) ||
      (project.category?.toLowerCase().includes(term) ?? false) ||
      project.tags.some((item) => item.toLowerCase().includes(term)) ||
      project.requiredSkills.some((item) => item.toLowerCase().includes(term))

    const matchesCategory = category === 'Todas' || project.category === category
    const matchesStatus = status === 'all' || project.status === status
    const matchesTag =
      tag === 'Todas' ||
      project.tags.some((item) => item.toLowerCase() === tag) ||
      project.requiredSkills.some((item) => item.toLowerCase() === tag)

    return matchesTerm && matchesCategory && matchesStatus && matchesTag
  })
}

function sortProjects(list: ProjectDisplay[], sort: ExploreSort): ProjectDisplay[] {
  const next = [...list]
  switch (sort) {
    case 'likes':
      return next.sort((a, b) => b.likesCount - a.likesCount)
    case 'comments':
      return next.sort((a, b) => b.commentsCount - a.commentsCount)
    case 'spots':
      return next.sort((a, b) => b.openSpots - a.openSpots)
    case 'recent':
    default:
      return next.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
  }
}

export function ExploreCatalog() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [projects, setProjects] = useState<ProjectDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [envMissing, setEnvMissing] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [category, setCategory] = useState('Todas')
  const [status, setStatus] = useState<ExploreStatusFilter>('all')
  const [tag, setTag] = useState('Todas')
  const [sort, setSort] = useState<ExploreSort>('recent')

  const loadProjects = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setEnvMissing(true)
      setLoading(false)
      return
    }

    setLoading(true)
    setFetchError(null)
    try {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('project_public_cards')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        setFetchError(error.message)
        setProjects([])
        return
      }

      const rows = (data ?? []) as ProjectPublicCardRow[]
      setProjects(rows.map(mapPublicCardToDisplay))
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Erro desconhecido ao carregar projetos.')
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProjects()
  }, [loadProjects])

  useEffect(() => {
    const categoryQuery = searchParams.get('category')
    if (!categoryQuery) return
    const decoded = decodeURIComponent(categoryQuery)

    if (decoded === 'Todas' || projectCategories.includes(decoded)) {
      setCategory(decoded)
    }
  }, [searchParams])

  const categoryOptions = useMemo(() => {
    const fromProjects = projects
      .map((project) => project.category)
      .filter((value): value is string => Boolean(value))
    const merged = new Set<string>([...projectCategories, ...fromProjects])
    return Array.from(merged).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [projects])

  const tagOptions = useMemo(() => {
    const tagSet = new Set<string>()
    for (const project of projects) {
      for (const item of project.tags) tagSet.add(item.toLowerCase())
      for (const item of project.requiredSkills) tagSet.add(item.toLowerCase())
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [projects])

  const filtered = useMemo(
    () => sortProjects(filterProjects(projects, searchTerm, category, status, tag), sort),
    [projects, searchTerm, category, status, tag, sort],
  )

  const catalogIsEmpty = !loading && !fetchError && projects.length === 0

  const handleClearFilters = () => {
    setSearchTerm('')
    setCategory('Todas')
    setStatus('all')
    setTag('Todas')
    setSort('recent')
    router.replace('/explorar', { scroll: false })
  }

  return (
    <main className="bg-background">
      <div className="border-b border-border bg-gradient-to-b from-muted/70 to-transparent">
        <Container className="space-y-10 py-14 lg:py-16">
          <PageHeader
            eyebrow="Descoberta"
            title="Explore projetos"
            description="Projetos publicados pela comunidade do Team Link."
            className="flex-col gap-8 pb-8 md:flex-row md:items-end md:justify-between md:gap-10"
            actions={
              <Button asChild className="rounded-2xl font-semibold shadow-md shadow-primary/25">
                <Link href="/nova-ideia" className="inline-flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  Nova ideia
                </Link>
              </Button>
            }
          />

          <SearchAndFilters
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            category={category}
            onCategoryChange={setCategory}
            status={status}
            onStatusChange={setStatus}
            tag={tag}
            onTagChange={setTag}
            sort={sort}
            onSortChange={setSort}
            categoryOptions={categoryOptions}
            tagOptions={tagOptions}
            onClear={handleClearFilters}
          />
        </Container>
      </div>

      <Container className="min-w-0 space-y-8 py-12 lg:py-14">
        {envMissing ? (
          <div
            role="status"
            className="rounded-2xl border border-amber-400/40 bg-amber-100/60 px-4 py-3 text-sm font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
          >
            Não foi possível carregar os projetos no momento. Tente novamente em instantes.
          </div>
        ) : null}

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="mx-auto h-64 w-full max-w-md animate-pulse rounded-[1.65rem] bg-muted md:mx-0 md:max-w-none"
              />
            ))}
          </div>
        ) : fetchError ? (
          <div className="mx-auto w-full max-w-md rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-6 text-center md:max-w-none">
            <p className="text-sm font-semibold text-destructive">Não foi possível carregar os projetos.</p>
            <p className="mt-2 text-xs text-destructive/80">{fetchError}</p>
            <Button onClick={() => void loadProjects()} className="mt-4 rounded-2xl font-semibold">
              Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            {!catalogIsEmpty ? (
              <div className="flex flex-col gap-2 text-center text-sm md:flex-row md:items-center md:justify-between md:text-left">
                <p className="font-semibold text-foreground">
                  {filtered.length} resultado{filtered.length === 1 ? '' : 's'}
                </p>
                <p className="mx-auto max-w-xl text-muted-foreground md:mx-0">
                  Use os filtros para refinar por categoria, status ou habilidade.
                </p>
              </div>
            ) : null}

            {filtered.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((project) => (
                  <div key={project.id} className="mx-auto w-full max-w-md md:mx-0 md:max-w-none">
                    <ProjectCard project={project} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={Search}
                title={catalogIsEmpty ? 'Nenhum projeto publicado ainda' : 'Nenhum projeto encontrado'}
                description={
                  catalogIsEmpty
                    ? 'Seja o primeiro a publicar uma ideia. Ela aparecerá aqui imediatamente.'
                    : 'Tente ajustar os filtros ou publicar uma nova ideia.'
                }
                actionLabel={catalogIsEmpty ? 'Publicar projeto' : 'Publicar projeto'}
                href="/nova-ideia"
                className="mx-auto w-full max-w-md md:max-w-none"
              />
            )}
          </>
        )}
      </Container>
    </main>
  )
}
