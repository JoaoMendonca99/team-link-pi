'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ProjectCard } from '@/components/team-link/project-card'
import type { ProjectDisplay } from '@/lib/projects/display'
import type { ProfileProjects as ProfileProjectsData } from '@/lib/profile-projects'

export function ProfileProjects({ data, renderProject, action }: {
  data: ProfileProjectsData
  renderProject?: (project: ProjectDisplay) => ReactNode
  action?: ReactNode
}) {
  const [category, setCategory] = useState<'created' | 'participating'>('created')
  const cards = category === 'created' ? data.created.map(project => ({ project, displayRole: null })) : data.participating
  return <section className="min-w-0 space-y-3" aria-label="Projetos do perfil">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Vínculo com projetos">
        <Button type="button" size="sm" variant={category === 'created' ? 'default' : 'ghost'} aria-pressed={category === 'created'} onClick={() => setCategory('created')}>Criados ({data.created.length})</Button>
        <Button type="button" size="sm" variant={category === 'participating' ? 'default' : 'ghost'} aria-pressed={category === 'participating'} onClick={() => setCategory('participating')}>Participa ({data.participating.length})</Button>
      </div>
      {action}
    </div>
    {cards.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map(({ project, displayRole }) => <div key={project.id} className="flex min-w-0 flex-col gap-2">
        {displayRole && <p className="break-words text-sm text-muted-foreground">Cargo: <span className="font-medium text-foreground">{displayRole}</span></p>}
        {renderProject ? renderProject(project) : <ProjectCard project={project} className="h-auto min-w-0 flex-1" />}
      </div>)}
    </div> : <p className="text-sm text-muted-foreground">{category === 'created' ? 'Nenhum projeto criado disponível.' : 'Nenhuma participação ativa disponível.'}</p>}
  </section>
}
