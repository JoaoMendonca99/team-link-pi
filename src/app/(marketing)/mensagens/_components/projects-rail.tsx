'use client'

import Link from 'next/link'
import { Compass, Loader2, MessagesSquare, RefreshCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { ChatProjectListItem } from '@/lib/chat/types'

function initialsOf(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

function relativeDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = Date.now()
  const diff = Math.max(0, now - date.getTime())
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} d`
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export function ProjectsRail({
  projects,
  selectedProjectId,
  onSelect,
  loading,
  error,
  onRetry,
  className,
}: {
  projects: ChatProjectListItem[]
  selectedProjectId: string | null
  onSelect: (project: ChatProjectListItem) => void
  loading: boolean
  error: string | null
  onRetry: () => void
  className?: string
}) {
  return (
    <aside
      className={cn(
        'flex min-h-0 w-full flex-col bg-card text-card-foreground lg:w-72 lg:shrink-0 lg:border-r lg:border-card-outline',
        className,
      )}
      aria-label="Lista de projetos"
    >
      <header className="border-b border-border bg-background/60 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">
          Central de mensagens
        </p>
        <h1 className="mt-1 text-lg font-semibold text-foreground">Mensagens</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Conversas dos seus projetos.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center px-6 py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando projetos...
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <p className="text-sm font-medium text-destructive">
              Não foi possível carregar seus projetos.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCcw className="h-4 w-4" aria-hidden />
              Tentar novamente
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <MessagesSquare className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-foreground">
              Você ainda não participa de projetos
            </p>
            <p className="text-xs text-muted-foreground">
              Encontre um projeto que combine com seu perfil e solicite participação para começar a conversar com a equipe.
            </p>
            <Button asChild className="mt-2 rounded-2xl font-semibold">
              <Link href="/explorar">
                <Compass className="h-4 w-4" aria-hidden />
                Explorar projetos
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="p-2">
            {projects.map((project) => {
              const isSelected = project.id === selectedProjectId
              const lastDate = relativeDate(project.lastMessageAt)
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(project)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
                      isSelected && 'bg-primary/10 hover:bg-primary/10',
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-xs font-semibold text-primary">
                      {initialsOf(project.title)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="block min-w-0 truncate text-sm font-semibold text-foreground">
                          {project.title}
                        </span>
                        {lastDate ? (
                          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
                            {lastDate}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="block min-w-0 truncate text-xs text-muted-foreground">
                          {project.lastMessageContent?.trim()
                            ? project.lastMessageContent
                            : 'Conversas do projeto'}
                        </span>
                        {project.unreadCount && project.unreadCount > 0 ? (
                          <span className="ml-auto inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                            {project.unreadCount > 9 ? '9+' : project.unreadCount}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}
