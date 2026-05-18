'use client'

import { memo } from 'react'
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  formatSupportRelativeTime,
  truncateSupportPreview,
} from '@/lib/support/format'
import type { SupportTicketListItem } from '@/lib/support/types'

import { SupportTicketStatusBadge } from './support-ticket-status-badge'

function TicketListRow({
  ticket,
  selected,
  onSelect,
}: {
  ticket: SupportTicketListItem
  selected: boolean
  onSelect: (ticketId: string) => void
}) {
  const preview = ticket.last_message?.message
    ? truncateSupportPreview(ticket.last_message.message)
    : 'Sem mensagens'
  const lastAt = ticket.last_message?.created_at ?? ticket.updated_at

  return (
    <button
      type="button"
      onClick={() => onSelect(ticket.ticket_id)}
      className={cn(
        'flex w-full flex-col gap-1.5 border-b border-card-outline/60 px-3 py-3 text-left transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-primary">#{ticket.ticket_number}</span>
        <SupportTicketStatusBadge status={ticket.status} />
      </div>
      <p className="line-clamp-1 text-sm font-semibold text-foreground">{ticket.title}</p>
      <p className="line-clamp-1 text-xs text-muted-foreground">
        {ticket.external_user_name?.trim() || 'Usuário externo'}
      </p>
      <p className="line-clamp-2 text-xs text-muted-foreground">{preview}</p>
      <p className="text-[10px] text-muted-foreground/80">{formatSupportRelativeTime(lastAt)}</p>
    </button>
  )
}

const MemoTicketListRow = memo(TicketListRow)

export function SupportTicketList({
  tickets,
  selectedTicketId,
  loading,
  error,
  onSelect,
  onRetry,
}: {
  tickets: SupportTicketListItem[]
  selectedTicketId: string | null
  loading: boolean
  error: string | null
  onSelect: (ticketId: string) => void
  onRetry: () => void
}) {
  if (loading && tickets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Carregando tickets…
      </div>
    )
  }

  if (error && tickets.length === 0) {
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

  if (!loading && tickets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Nenhum ticket neste filtro.
      </div>
    )
  }

  return (
    <ul className="flex-1 overflow-y-auto">
      {tickets.map((ticket) => (
        <li key={ticket.ticket_id}>
          <MemoTicketListRow
            ticket={ticket}
            selected={selectedTicketId === ticket.ticket_id}
            onSelect={onSelect}
          />
        </li>
      ))}
    </ul>
  )
}
