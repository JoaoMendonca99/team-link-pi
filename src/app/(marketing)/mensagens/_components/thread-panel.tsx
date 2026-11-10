'use client'

import Link from 'next/link'
import { Fragment, useEffect, useRef } from 'react'
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Send,
  Users,
  X,
} from 'lucide-react'

import { formatMessageTime, MessageDay } from '@/components/chat/message-time'
import { Button } from '@/components/ui/button'
import { MessageTextarea } from '@/components/chat/message-textarea'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { cn } from '@/lib/utils'

import type { ChatConversationListItem, ChatThreadMessage } from '@/lib/chat/types'

const MESSAGE_MAX_LENGTH = 2000


export function ThreadPanel({
  readOnly=false,
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
  onCloseConversation,
  onBack,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  className,
}: {
  readOnly?:boolean
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
  /** Fecha só a conversa (painel vazio); projeto permanece selecionado. */
  onCloseConversation?: () => void
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
      ? 'Selecione uma conversa para abrir as mensagens.'
      : 'Selecione um projeto para abrir as conversas.'
    const emptyDescription = hasSelectedProject
      ? 'Escolha o grupo Geral ou um grupo da equipe na coluna de conversas.'
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
            className="h-8 shrink-0 gap-1.5 rounded-xl px-2 text-xs font-semibold @min-[1000px]/chat:hidden"
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
        {onCloseConversation ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onCloseConversation}
            aria-label="Fechar conversa"
            title="Fechar conversa"
          >
            <X className="h-4 w-4 shrink-0" aria-hidden />
          </Button>
        ) : null}
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
            {messages.map((message, index) => {
              const isOwn = currentUserId === message.sender_id
              const authorName = isOwn
                ? currentUserName
                : message.author?.full_name?.trim() || 'Membro do projeto'
              const avatarUrl = isOwn
                ? currentUserAvatar
                : message.author?.avatar_url ?? undefined
              const profileHref = "/usuarios/" + message.sender_id
              return (
                <Fragment key={message.id}>
                  <MessageDay value={message.created_at} previous={messages[index - 1]?.created_at} />
                  <li
                    className={cn(
                      'flex w-full items-end gap-2',
                      isOwn ? 'justify-end' : 'justify-start',
                    )}
                  >
                    <Link href={profileHref} aria-label={"Perfil de " + authorName} className="shrink-0 rounded-full">
                      <UserAvatar
                        name={authorName}
                        imageUrl={avatarUrl}
                        sizeClassName="h-8 w-8"
                        ring={false}
                      />
                    </Link>
                    <div
                      className={cn(
                        'max-w-[min(78%,calc(100vw-5rem))] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm',
                        isOwn
                          ? 'rounded-br-md bg-primary text-primary-foreground'
                          : 'rounded-bl-md bg-card text-card-foreground border border-border/60',
                      )}
                    >
                      <Link href={profileHref} className="mb-0.5 block break-words text-[11px] font-semibold hover:underline">{authorName}</Link>
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
                </Fragment>
              )
            })}
          </ul>
        )}
      </div>

      {readOnly?<p className="border-t p-4 text-sm text-muted-foreground">Conversa histórica · somente leitura.</p>:(<div className="border-t border-border bg-background/70 px-3 py-3 sm:px-4">
        {sendError ? (
          <p role="alert" className="mb-2 text-xs font-medium text-destructive">
            {sendError}
          </p>
        ) : null}
        <div className="flex min-w-0 items-end gap-2">
          <MessageTextarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            sending={sending} canSend={!sendDisabled} onSend={onSend}
            placeholder="Escreva uma mensagem..."
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH + 200}
            aria-label="Mensagem"
            className="min-h-10 min-w-0 max-h-32 flex-1 resize-none rounded-2xl"
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
      </div>)}
    </section>
  )
}

export { MESSAGE_MAX_LENGTH }
