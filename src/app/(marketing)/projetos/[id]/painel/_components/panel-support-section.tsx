'use client'

import { useState } from 'react'
import { Headset, Loader2, Ticket } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SupportProjectTicketStats } from '@/lib/support/types'

import { SupportTicketDrawer } from './support/support-ticket-drawer'

export interface PanelSupportSectionProps {
  projectId: string
  stats: SupportProjectTicketStats | null
  statsLoading: boolean
  canViewSupport: boolean
  onRefreshStats: () => void
  className?: string
}

function formatWaitingBadge(count: number): string {
  if (count > 99) return '99+'
  return String(count)
}

export function PanelSupportSection({
  projectId,
  stats,
  statsLoading,
  canViewSupport,
  onRefreshStats,
  className,
}: PanelSupportSectionProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  const waitingCount = stats?.waiting_support ?? 0
  const showBadge = canViewSupport && !statsLoading && waitingCount > 0

  function handleCloseDrawer() {
    setDrawerOpen(false)
    if (canViewSupport) onRefreshStats()
  }

  return (
    <>
      <section
        className={cn(
          'flex h-full flex-col space-y-6 rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm shadow-primary/5 sm:p-8',
          className,
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Headset className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-wide">SUPORTE</h2>
            <p className="text-sm text-muted-foreground">
              Atendimento e tickets do projeto.
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-4">
          <div className="relative">
            <Button
              type="button"
              className="h-14 w-full rounded-2xl text-base font-bold tracking-wide shadow-md shadow-primary/20"
              onClick={() => setDrawerOpen(true)}
            >
              <Ticket className="mr-2 h-5 w-5" aria-hidden />
              TICKETS
            </Button>
            {showBadge ? (
              <span
                className="absolute -right-1 -top-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground ring-2 ring-card"
                aria-label={`${waitingCount} ticket(s) aguardando suporte`}
              >
                {formatWaitingBadge(waitingCount)}
              </span>
            ) : null}
          </div>

          {canViewSupport && statsLoading ? (
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Atualizando fila…
            </p>
          ) : null}

          {canViewSupport && !statsLoading && waitingCount > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              {waitingCount === 1
                ? '1 ticket aguardando resposta da equipe.'
                : `${waitingCount} tickets aguardando resposta da equipe.`}
            </p>
          ) : null}

          {!canViewSupport ? (
            <p className="text-center text-xs text-muted-foreground">
              Tickets e fila de atendimento são visíveis para responsáveis e equipe de
              suporte.
            </p>
          ) : null}
        </div>
      </section>

      <SupportTicketDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        projectId={projectId}
        canViewSupport={canViewSupport}
        stats={stats}
        statsLoading={statsLoading}
        onRefreshStats={onRefreshStats}
      />
    </>
  )
}
