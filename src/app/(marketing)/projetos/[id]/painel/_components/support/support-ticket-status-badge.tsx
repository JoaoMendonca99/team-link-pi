import { cn } from '@/lib/utils'
import { supportStatusLabel } from '@/lib/support/format'
import type { SupportTicketStatus } from '@/lib/support/types'

const statusStyles: Record<SupportTicketStatus, string> = {
  waiting_support:
    'border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  in_progress: 'border-primary/35 bg-primary/15 text-primary',
  resolved: 'border-emerald-500/35 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  closed: 'border-muted-foreground/30 bg-muted/50 text-muted-foreground',
}

export function SupportTicketStatusBadge({
  status,
  className,
}: {
  status: SupportTicketStatus
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        statusStyles[status],
        className,
      )}
    >
      {supportStatusLabel(status)}
    </span>
  )
}
