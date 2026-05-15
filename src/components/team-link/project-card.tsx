"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Heart, MessageCircle, Users } from "lucide-react"

import { CategoryBadge } from "@/components/team-link/category-badge"
import { ProjectStatusBadge } from "@/components/team-link/project-status-badge"
import { TagList } from "@/components/team-link/tag-list"
import { UserAvatar } from "@/components/team-link/user-avatar"
import type { ProjectDisplay } from "@/lib/projects/display"
import { cn } from "@/lib/utils"

export function ProjectCard({
  project,
  className,
  href,
  disableLink = false,
}: {
  project: ProjectDisplay
  className?: string
  /** Override link target (default: `/projetos/[slug]`). */
  href?: string
  disableLink?: boolean
}) {
  const target = href ?? `/projetos/${project.slug}`

  const interactiveClasses =
    "flex h-full flex-col rounded-[1.65rem] border border-card-outline bg-card p-6 shadow-sm outline-none ring-offset-background transition-shadow duration-200 ease-out hover:shadow-xl focus-visible:ring-[3px] focus-visible:ring-ring/55"

  const createdAtLabel = (() => {
    const date = new Date(project.createdAt)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString("pt-BR")
  })()

  const cardBody = (
    <>
      <div className="flex items-start justify-between gap-4">
        {project.category ? <CategoryBadge label={project.category} className="shrink" /> : <span />}
        <ProjectStatusBadge status={project.status} />
      </div>

      <h3 className="mt-4 text-balance text-xl font-semibold leading-snug text-foreground">{project.title}</h3>

      {project.shortDescription ? (
        <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{project.shortDescription}</p>
      ) : null}

      {project.tags.length > 0 ? (
        <div className="mt-5">
          <TagList tags={project.tags} />
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-4 border-t border-border/70 pt-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={project.ownerName} imageUrl={project.ownerAvatarUrl ?? undefined} sizeClassName="h-9 w-9" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">{project.ownerName}</p>
            {createdAtLabel ? (
              <p className="truncate text-[12px] text-muted-foreground">Publicado em {createdAtLabel}</p>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2 text-xs font-semibold text-muted-foreground sm:justify-end">
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            <Heart className="h-3.5 w-3.5 text-primary" aria-hidden />
            {project.likesCount}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            <MessageCircle className="h-3.5 w-3.5 text-primary" aria-hidden />
            {project.commentsCount}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1">
            <Users className="h-3.5 w-3.5 text-[#14B8A6]" aria-hidden />
            {project.openSpots > 0
              ? `${project.openSpots} ${project.openSpots === 1 ? 'vaga' : 'vagas'}`
              : 'Sem vagas abertas'}
          </span>
        </div>
      </div>
    </>
  )

  return (
    <motion.div
      layout
      whileHover={disableLink ? undefined : { translateY: -4, scale: 1.01 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn("h-full", className)}
    >
      {disableLink ? (
        <div className={interactiveClasses}>{cardBody}</div>
      ) : (
        <Link href={target} className={interactiveClasses}>
          {cardBody}
        </Link>
      )}
    </motion.div>
  )
}
