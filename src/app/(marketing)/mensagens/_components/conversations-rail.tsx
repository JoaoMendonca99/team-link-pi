'use client'

import {
  ArrowLeft,
  Loader2,
  MessagesSquare,
  MoreVertical,
  Plus,
  RefreshCcw,
  Trash2,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import type { ChatConversationListItem } from '@/lib/chat/types'

function initialsOf(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase()
}

export function ConversationsRail({
  projectTitle,
  conversations,
  selectedConversationId,
  onSelect,
  onCreateGroup,
  onRequestDelete,
  onViewMembers,
  loading,
  error,
  onRetry,
  onBack,
  className,
}: {
  projectTitle: string
  conversations: ChatConversationListItem[]
  selectedConversationId: string | null
  onSelect: (conversation: ChatConversationListItem) => void
  onCreateGroup: () => void
  onRequestDelete: (conversation: ChatConversationListItem) => void
  onViewMembers: (conversation: ChatConversationListItem) => void
  loading: boolean
  error: string | null
  onRetry: () => void
  /** No mobile, botão de voltar para a coluna de projetos. */
  onBack?: () => void
  className?: string
}) {
  const general = conversations.find((conversation) => conversation.kind === 'general')
  const groups = conversations.filter((conversation) => conversation.kind === 'group')

  return (
    <aside
      className={cn(
        'flex min-h-0 w-full flex-col bg-card text-card-foreground lg:w-80 lg:shrink-0 lg:border-r lg:border-card-outline',
        className,
      )}
      aria-label="Conversas do projeto"
    >
      <header className="flex flex-wrap items-start gap-2 border-b border-border bg-background/60 px-4 py-3">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 rounded-xl px-2 text-xs font-semibold lg:hidden"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Projetos
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">
            Projeto
          </p>
          <h2 className="mt-0.5 truncate text-base font-semibold text-foreground" title={projectTitle}>
            {projectTitle}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Conversa geral e seus grupos.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 shrink-0 gap-1 rounded-xl px-3 text-xs font-semibold"
          onClick={onCreateGroup}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Novo grupo
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center px-6 py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando conversas...
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <p className="text-sm font-medium text-destructive">
              Não foi possível carregar as conversas.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCcw className="h-4 w-4" aria-hidden />
              Tentar novamente
            </Button>
          </div>
        ) : (
          <ul className="p-2">
            {general ? (
              <li>
                <ConversationItem
                  conversation={general}
                  isSelected={selectedConversationId === general.id}
                  onSelect={onSelect}
                  onViewMembers={onViewMembers}
                  onRequestDelete={onRequestDelete}
                />
              </li>
            ) : (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                A conversa geral deste projeto ainda não está disponível.
              </li>
            )}

            {groups.length > 0 ? (
              <li
                aria-hidden
                className="mb-1 mt-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Grupos
              </li>
            ) : null}

            {groups.map((group) => (
              <li key={group.id}>
                <ConversationItem
                  conversation={group}
                  isSelected={selectedConversationId === group.id}
                  onSelect={onSelect}
                  onViewMembers={onViewMembers}
                  onRequestDelete={onRequestDelete}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onViewMembers,
  onRequestDelete,
}: {
  conversation: ChatConversationListItem
  isSelected: boolean
  onSelect: (conversation: ChatConversationListItem) => void
  onViewMembers: (conversation: ChatConversationListItem) => void
  onRequestDelete: (conversation: ChatConversationListItem) => void
}) {
  const isGeneral = conversation.kind === 'general'
  const title = isGeneral
    ? 'Geral'
    : conversation.title?.trim() || 'Grupo sem nome'
  const membersCount = conversation.members_count
  const subtitle = (() => {
    if (conversation.last_message_content?.trim()) {
      return conversation.last_message_content
    }
    if (isGeneral) return 'Todos os membros do projeto'
    if (typeof membersCount === 'number') {
      return membersCount === 0
        ? 'Sem membros'
        : membersCount === 1
          ? '1 membro'
          : `${membersCount} membros`
    }
    return 'Conversa em grupo'
  })()

  // Por padrão, exibimos o botão de excluir para grupos (a RLS é a fonte
  // de verdade). Se a RPC informar can_delete=false explicitamente,
  // escondemos para evitar promessas falsas na UI.
  const allowDelete =
    !isGeneral && (conversation.can_delete === undefined || conversation.can_delete)

  return (
    <div
      className={cn(
        'group/conv relative flex items-center gap-1 rounded-2xl pr-1 transition-colors',
        isSelected ? 'bg-primary/10' : 'hover:bg-muted',
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation)}
        aria-pressed={isSelected}
        className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left focus-visible:outline-none"
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-xs font-semibold',
            isGeneral ? 'bg-primary/15 text-primary' : 'bg-secondary text-foreground',
          )}
        >
          {isGeneral ? (
            <MessagesSquare className="h-4 w-4" aria-hidden />
          ) : (
            initialsOf(title)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="block min-w-0 truncate text-sm font-semibold text-foreground">
              {title}
            </span>
            {conversation.unread_count && conversation.unread_count > 0 ? (
              <span className="inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block min-w-0 truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </button>

      {!isGeneral ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 opacity-70 hover:opacity-100"
              aria-label="Opções do grupo"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px]">
            <DropdownMenuItem onSelect={() => onViewMembers(conversation)}>
              <Users className="h-4 w-4" aria-hidden /> Ver membros
            </DropdownMenuItem>
            {allowDelete ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onRequestDelete(conversation)}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Excluir grupo
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}
