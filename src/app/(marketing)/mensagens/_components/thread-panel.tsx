'use client'

import { useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Send,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { cn } from '@/lib/utils'

import type { ChatConversationListItem, ChatThreadMessage } from '@/lib/chat/types'

const MESSAGE_MAX_LENGTH = 2000

function formatMessageTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function ThreadPanel({
  projectTitle,
  conversation,
  hasSelectedProject,
  messages,
  loading,
  error,
  onRetry,
  draft,
  onDraftChange,
  onSend,
  sending,
  sendError,
  onOpenMembers,
  onBack,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  className,
}: {
  projectTitle: string
  conversation: ChatConversationListItem | null
  hasSelectedProject: boolean
  messages: ChatThreadMessage[]
  loading: boolean
  error: string | null
  onRetry: () => void
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  sending: boolean
  sendError: string | null
  onOpenMembers: () => void
  onBack?: () => void
  currentUserId: string | null
  currentUserName: string
  currentUserAvatar?: string
  className?: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    // Rola para a última mensagem ao abrir a conversa ou receber novas mensagens.
    node.scrollTop = node.scrollHeight
  }, [messages, conversation?.id])

  if (!conversation) {
    const emptyTitle = hasSelectedProject
      ? 'Escolha uma conversa para começar'
      : 'Selecione um projeto para abrir as conversas.'
    const emptyDescription = hasSelectedProject
      ? 'Abra a conversa geral ou um grupo para acompanhar as mensagens em tempo real.'
      : 'Escolha um projeto na primeira coluna para ver a conversa geral e os grupos da equipe.'

    return (
      <section
        className={cn(
          'flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background/40 px-6 py-12 text-center',
          className,
        )}
        aria-label="Nenhuma conversa selecionada"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <MessageCircle className="h-7 w-7" aria-hidden />
        </span>
        <p className="text-base font-semibold text-foreground">{emptyTitle}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{emptyDescription}</p>
      </section>
    )
  }

  const title =
    conversation.kind === 'general'
      ? 'Geral'
      : conversation.title?.trim() || 'Grupo'
  const remaining = MESSAGE_MAX_LENGTH - draft.length
  const trimmed = draft.trim()
  const sendDisabled =
    sending || trimmed.length === 0 || draft.length > MESSAGE_MAX_LENGTH

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!sendDisabled) onSend()
    }
  }

  return (
    <section
      className={cn(
        'flex min-h-0 flex-1 flex-col bg-background/40',
        className,
      )}
      aria-label="Mensagens"
    >
      <header className="flex items-center gap-2 border-b border-border bg-background/70 px-4 py-3">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1.5 rounded-xl px-2 text-xs font-semibold lg:hidden"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Conversas
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground" title={title}>
            {title}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={projectTitle}>
            {projectTitle}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-2 rounded-xl text-xs font-semibold"
          onClick={onOpenMembers}
        >
          <Users className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Membros</span>
        </Button>
      </header>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5"
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando mensagens...
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium text-destructive">
              Não foi possível carregar as mensagens.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCcw className="h-4 w-4" aria-hidden />
              Tentar novamente
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <MessageCircle className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Nenhuma mensagem ainda</p>
            <p className="text-xs text-muted-foreground">
              Comece a conversa enviando a primeira mensagem.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => {
              const isOwn = currentUserId === message.sender_id
              const authorName = isOwn
                ? currentUserName
                : message.author?.full_name?.trim() || 'Membro do projeto'
              const avatarUrl = isOwn
                ? currentUserAvatar
                : message.author?.avatar_url ?? undefined
              return (
                <li
                  key={message.id}
                  className={cn(
                    'flex w-full items-end gap-2',
                    isOwn ? 'justify-end' : 'justify-start',
                  )}
                >
                  {!isOwn ? (
                    <UserAvatar
                      name={authorName}
                      imageUrl={avatarUrl}
                      sizeClassName="h-8 w-8"
                      ring={false}
                    />
                  ) : null}
                  <div
                    className={cn(
                      'max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
                      isOwn
                        ? 'rounded-br-md bg-primary text-primary-foreground'
                        : 'rounded-bl-md bg-card text-card-foreground border border-border/60',
                    )}
                  >
                    {!isOwn ? (
                      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {authorName}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {message.content}
                    </p>
                    <p
                      className={cn(
                        'mt-1 text-[10px] tabular-nums',
                        isOwn
                          ? 'text-primary-foreground/75'
                          : 'text-muted-foreground',
                      )}
                    >
                      {formatMessageTime(message.created_at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border bg-background/70 px-3 py-3 sm:px-4">
        {sendError ? (
          <p role="alert" className="mb-2 text-xs font-medium text-destructive">
            {sendError}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem..."
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH + 200}
            aria-label="Mensagem"
            className="max-h-32 min-h-10 resize-none rounded-2xl"
          />
          <Button
            type="button"
            onClick={onSend}
            disabled={sendDisabled}
            className="h-10 shrink-0 rounded-2xl px-3 font-semibold"
            aria-label="Enviar mensagem"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
        {remaining <= 200 ? (
          <p
            className={cn(
              'mt-1 text-right text-[10px] tabular-nums',
              remaining < 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {remaining} caracteres restantes
          </p>
        ) : null}
      </div>
    </section>
  )
}

export { MESSAGE_MAX_LENGTH }
