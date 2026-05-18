'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Send } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatSupportDateTime } from '@/lib/support/format'
import type { SupportTicketDetail, SupportTicketStatus } from '@/lib/support/types'

import { SupportTicketStatusBadge } from './support-ticket-status-badge'

const STATUS_OPTIONS: { value: SupportTicketStatus; label: string }[] = [
  { value: 'waiting_support', label: 'Aguardando' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'closed', label: 'Fechado' },
]

function isSupportMessage(senderRole: string): boolean {
  return senderRole === 'support'
}

export function SupportTicketChat({
  detail,
  loading,
  error,
  sending,
  updatingStatus,
  showBackOnMobile,
  onBack,
  onSendReply,
  onStatusChange,
  onRetry,
}: {
  detail: SupportTicketDetail | null
  loading: boolean
  error: string | null
  sending: boolean
  updatingStatus: boolean
  showBackOnMobile: boolean
  onBack: () => void
  onSendReply: (message: string) => Promise<void>
  onStatusChange: (status: SupportTicketStatus) => Promise<void>
  onRetry: () => void
}) {
  const [reply, setReply] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setReply('')
  }, [detail?.ticket.id])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [detail?.messages.length, detail?.ticket.id, loading])

  if (loading && !detail) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Abrindo ticket…
      </div>
    )
  }

  if (error && !detail) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          className="text-sm font-semibold text-primary hover:underline"
          onClick={onRetry}
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="hidden flex-1 flex-col items-center justify-center p-6 text-center text-sm text-muted-foreground md:flex">
        Selecione um ticket para ver a conversa.
      </div>
    )
  }

  const { ticket, messages } = detail
  const metaItems = [
    ticket.category ? { label: 'Categoria', value: ticket.category } : null,
    ticket.priority ? { label: 'Prioridade', value: ticket.priority } : null,
    ticket.app_version ? { label: 'Versão', value: ticket.app_version } : null,
    ticket.app_platform ? { label: 'Plataforma', value: ticket.app_platform } : null,
    ticket.app_module ? { label: 'Módulo', value: ticket.app_module } : null,
    ticket.filial ? { label: 'Filial', value: ticket.filial } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  async function handleSend() {
    const text = reply.trim()
    if (!text || sending) return
    await onSendReply(text)
    setReply('')
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-card-outline/70 bg-background/60 px-3 py-3 sm:px-4">
        <div className="flex items-start gap-2">
          {showBackOnMobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-xl md:hidden"
              aria-label="Voltar para lista"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">
                #{ticket.ticket_number}
              </span>
              <SupportTicketStatusBadge status={ticket.status} />
            </div>
            <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">
              {ticket.title}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ticket.external_user_name?.trim() || 'Usuário externo'}
              {ticket.external_user_email ? ` · ${ticket.external_user_email}` : ''}
            </p>
          </div>
          <label className="flex shrink-0 flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase text-muted-foreground">
              Status
            </span>
            <select
              className="rounded-xl border border-card-outline bg-background px-2 py-1.5 text-xs font-medium"
              value={ticket.status}
              disabled={updatingStatus || sending}
              onChange={(event) => void onStatusChange(event.target.value as SupportTicketStatus)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {metaItems.length > 0 ? (
          <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            {metaItems.map((item) => (
              <div key={item.label} className="flex gap-1">
                <dt className="font-semibold uppercase">{item.label}:</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-4">
        {messages.map((message) => {
          const fromSupport = isSupportMessage(message.sender_role)
          return (
            <div
              key={message.id}
              className={cn('flex', fromSupport ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl border px-3 py-2.5 shadow-sm',
                  fromSupport
                    ? 'border-primary/30 bg-primary/10 text-foreground'
                    : 'border-card-outline bg-muted/30 text-foreground',
                )}
              >
                <p className="text-[10px] font-semibold text-muted-foreground">
                  {fromSupport ? 'Suporte' : ticket.external_user_name?.trim() || 'Usuário'}
                  <span className="font-normal"> · {formatSupportDateTime(message.created_at)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{message.message}</p>
              </div>
            </div>
          )
        })}
      </div>

      <footer className="shrink-0 border-t border-card-outline/70 bg-background/80 p-3 sm:p-4">
        <label className="sr-only" htmlFor="support-reply">
          Resposta ao ticket
        </label>
        <textarea
          id="support-reply"
          rows={3}
          value={reply}
          disabled={sending || ticket.status === 'closed'}
          onChange={(event) => setReply(event.target.value)}
          placeholder={
            ticket.status === 'closed'
              ? 'Ticket fechado — não é possível responder.'
              : 'Escreva sua resposta…'
          }
          className="w-full resize-none rounded-2xl border border-card-outline bg-background px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
        />
        <Button
          type="button"
          className="mt-2 w-full rounded-2xl font-semibold"
          disabled={sending || !reply.trim() || ticket.status === 'closed'}
          onClick={() => void handleSend()}
        >
          {sending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Send className="mr-2 h-4 w-4" aria-hidden />
          )}
          Responder
        </Button>
      </footer>
    </div>
  )
}
