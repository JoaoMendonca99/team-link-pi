'use client'

import { cn } from '@/lib/utils'
import type { SupportTicketFilter } from '@/lib/support/types'

const FILTER_OPTIONS: { value: SupportTicketFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'waiting_support', label: 'Aguardando' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'resolved', label: 'Resolvidos' },
  { value: 'closed', label: 'Fechados' },
]

export function SupportTicketFilters({
  value,
  onChange,
  disabled,
}: {
  value: SupportTicketFilter
  onChange: (next: SupportTicketFilter) => void
  disabled?: boolean
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Filtrar tickets"
    >
      {FILTER_OPTIONS.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              active
                ? 'border-primary/40 bg-primary/15 text-primary shadow-sm shadow-primary/10'
                : 'border-card-outline bg-background/60 text-muted-foreground hover:bg-muted/50',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
