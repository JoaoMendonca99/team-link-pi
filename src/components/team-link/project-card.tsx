"use client"

import Link from 'next/link'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Heart, MessageCircle, Users } from 'lucide-react'
import { CategoryBadge } from './category-badge'
import { ProjectStatusBadge } from './project-status-badge'
import { UserAvatar } from './user-avatar'
import { ProjectLogo, type ProjectImageDraft } from './project-logo'
import { LikeButton } from './project-like-button'
import type { ProjectDisplay } from '@/lib/projects/display'
import { cn } from '@/lib/utils'

export function ProjectCard({ project, className, href, disableLink = false, footer, preview = false, draft }: {
  project: ProjectDisplay
  className?: string
  href?: string
  disableLink?: boolean
  footer?: ReactNode
  preview?: boolean
  draft?: ProjectImageDraft
}) {
  const reducedMotion = useReducedMotion()
  const projectUrl = '/projetos/' + encodeURIComponent(project.slug)
  const target = href ?? projectUrl
  const action = href?.endsWith('/painel') ? 'Abrir painel' : 'Ver projeto'
  const interactive = !preview && !disableLink
  const profile = project.ownerName && (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={project.ownerName} imageUrl={project.ownerAvatarUrl ?? undefined} sizeClassName="size-8 shrink-0" />
      <span className="truncate text-xs font-semibold">{project.ownerName}</span>
    </span>
  )
  const content = <>
    <div className="flex min-w-0 items-start gap-3">
      <ProjectLogo projectId={project.id === 'preview' ? undefined : project.id} title={project.title} draft={draft} />
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {project.category && <CategoryBadge label={project.category} className="max-w-full" />}
          <ProjectStatusBadge status={project.status} />
        </div>
        <h3 className="line-clamp-2 break-words text-base font-semibold leading-snug sm:text-lg">{project.title}</h3>
      </div>
    </div>
    {project.shortDescription && <p className="line-clamp-3 break-words text-sm text-muted-foreground">{project.shortDescription}</p>}
    {project.tags.length > 0 && <ul aria-label="Tags do projeto" className="flex min-w-0 items-center gap-1.5">
      {project.tags.slice(0, 3).map((tag, i) => <li key={tag + i} title={tag} className="min-w-0 truncate rounded-full border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">{tag}</li>)}
      {project.tags.length > 3 && <li className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground" aria-label={String(project.tags.length - 3) + ' tags adicionais'}>+{project.tags.length - 3}</li>}
    </ul>}
  </>
  return <motion.article
    layout={!reducedMotion}
    whileHover={interactive && !reducedMotion ? { translateY: -2 } : undefined}
    transition={{ duration: 0.15, ease: 'easeOut' }}
    className={cn('relative flex h-full min-w-0 flex-col gap-4 rounded-2xl border border-card-outline bg-card p-4 shadow-sm sm:p-5', className)}
  >
    {interactive
      ? <Link href={target} aria-label={action + ' ' + project.title} className="min-w-0 flex-1 space-y-3 rounded-lg after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline-2 focus-visible:after:outline-ring hover:text-link">{content}</Link>
      : <div className="min-w-0 flex-1 space-y-3">{content}</div>}
    <div className="space-y-3 border-t border-border pt-3">
      {interactive && project.ownerId && profile ? (
        <Link href={'/usuarios/' + encodeURIComponent(project.ownerId)} aria-label={'Ver perfil do criador: ' + project.ownerName}
          className="relative z-10 inline-flex min-h-11 max-w-full items-center rounded-lg hover:text-link focus-visible:outline-2 focus-visible:outline-ring sm:min-h-9">{profile}</Link>
      ) : profile}
      <div className="flex min-w-0 flex-wrap items-start gap-2 text-xs text-muted-foreground">
        {preview ? <span className="inline-flex items-center gap-1"><Heart className="size-4" aria-hidden />{project.likesCount}</span>
          : <LikeButton projectId={project.id} initialCount={project.likesCount} href={projectUrl} className="relative z-10" compact
            enabled={interactive && project.visibility === 'public' && project.status !== 'archived'} />}
        <span className="inline-flex min-h-9 items-center gap-1 px-1" aria-label={project.commentsCount + ' comentários'}><MessageCircle className="size-4" aria-hidden />{project.commentsCount}</span>
        <span className="inline-flex min-h-9 items-center gap-1 px-1"><Users className="size-4" aria-hidden />
          {project.openSpots > 0 ? project.openSpots + (project.openSpots === 1 ? ' vaga' : ' vagas') : 'Sem vagas abertas'}
        </span>
      </div>
      {interactive && <span aria-hidden className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-link">{action} <ArrowRight className="size-4" /></span>}
      {footer && <div className="relative z-10 flex flex-wrap gap-2">{footer}</div>}
    </div>
  </motion.article>
}
