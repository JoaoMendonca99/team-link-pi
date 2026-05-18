'use client'

import { useCallback, useEffect, useState } from 'react'
import { Headset, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  getProjectSupportTicket,
  listProjectSupportTickets,
  sendSupportReply,
  updateSupportTicketStatus,
} from '@/lib/support/actions'
import type {
  SupportProjectTicketStats,
  SupportTicketDetail,
  SupportTicketFilter,
  SupportTicketListItem,
  SupportTicketStatus,
} from '@/lib/support/types'

import { SupportTicketChat } from './support-ticket-chat'
import { SupportTicketFilters } from './support-ticket-filters'
import { SupportTicketList } from './support-ticket-list'

const REFRESH_MS = 15_000
const LIST_LIMIT = 50

export interface SupportTicketDrawerProps {
  open: boolean
  onClose: () => void
  projectId: string
  canViewSupport: boolean
  stats: SupportProjectTicketStats | null
  statsLoading: boolean
  onRefreshStats: () => void
}

export function SupportTicketDrawer({
  open,
  onClose,
  projectId,
  canViewSupport,
  stats,
  statsLoading,
  onRefreshStats,
}: SupportTicketDrawerProps) {
  const [filter, setFilter] = useState<SupportTicketFilter>('all')
  const [tickets, setTickets] = useState<SupportTicketListItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const [sending, setSending] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  const loadTickets = useCallback(
    async (silent = false) => {
      if (!canViewSupport || !projectId) return
      if (!silent) {
        setListLoading(true)
        setListError(null)
      }
      const result = await listProjectSupportTickets({
        project_id: projectId,
        status: filter === 'all' ? undefined : filter,
        page: 1,
        limit: LIST_LIMIT,
      })
      if (!silent) setListLoading(false)
      if (!result.ok) {
        if (!silent) setListError(result.message)
        return
      }
      setTickets(result.tickets)
      setListError(null)
    },
    [canViewSupport, filter, projectId],
  )

  const loadDetail = useCallback(
    async (ticketId: string, silent = false) => {
      if (!canViewSupport) return
      if (!silent) {
        setDetailLoading(true)
        setDetailError(null)
      }
      const result = await getProjectSupportTicket(ticketId)
      if (!silent) setDetailLoading(false)
      if (!result.ok) {
        if (!silent) setDetailError(result.message)
        return
      }
      setDetail(result.data)
      setDetailError(null)
    },
    [canViewSupport],
  )

  const refreshAll = useCallback(
    async (silent = true) => {
      if (!open || !canViewSupport) return
      await loadTickets(silent)
      onRefreshStats()
      if (selectedTicketId) {
        await loadDetail(selectedTicketId, silent)
      }
    },
    [canViewSupport, loadDetail, loadTickets, onRefreshStats, open, selectedTicketId],
  )

  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      setSelectedTicketId(null)
      setDetail(null)
      setFilter('all')
      setTickets([])
      setListError(null)
      setDetailError(null)
      return
    }
    if (!canViewSupport) return
    void loadTickets(false)
    onRefreshStats()
  }, [open, canViewSupport, filter, loadTickets, onRefreshStats])

  useEffect(() => {
    if (!open || !selectedTicketId || !canViewSupport) return
    void loadDetail(selectedTicketId, false)
  }, [open, selectedTicketId, canViewSupport, loadDetail])

  useEffect(() => {
    if (!open || !canViewSupport) return
    const id = window.setInterval(() => {
      void refreshAll(true)
    }, REFRESH_MS)
    return () => window.clearInterval(id)
  }, [open, canViewSupport, refreshAll])

  async function handleSendReply(message: string) {
    if (!selectedTicketId) return
    setSending(true)
    const result = await sendSupportReply(selectedTicketId, message)
    setSending(false)
    if (!result.ok) {
      setDetailError(result.message)
      return
    }
    await Promise.all([
      loadDetail(selectedTicketId, true),
      loadTickets(true),
      Promise.resolve(onRefreshStats()),
    ])
  }

  async function handleStatusChange(status: SupportTicketStatus) {
    if (!selectedTicketId) return
    setUpdatingStatus(true)
    const result = await updateSupportTicketStatus(selectedTicketId, status)
    setUpdatingStatus(false)
    if (!result.ok) {
      setDetailError(result.message)
      return
    }
    await Promise.all([
      loadDetail(selectedTicketId, true),
      loadTickets(true),
      Promise.resolve(onRefreshStats()),
    ])
  }

  if (!open) return null

  const showMobileChat = Boolean(selectedTicketId)

  return (
    <>
      <button
        type="button"
        aria-label="Fechar painel de tickets"
        className="fixed inset-0 z-[80] bg-background/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Tickets de suporte"
        className={cn(
          'fixed inset-y-0 right-0 z-[90] flex w-full flex-col border-l border-card-outline bg-card shadow-2xl shadow-primary/10',
          'max-w-none sm:max-w-[min(100vw,650px)]',
        )}
      >
        <header className="shrink-0 border-b border-card-outline/70 bg-gradient-to-b from-primary/5 to-transparent px-4 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Headset className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                Suporte
              </p>
              <h2 className="text-lg font-semibold text-foreground">Tickets</h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-xl"
              aria-label="Fechar"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {canViewSupport ? (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <StatPill
                label="Aguardando"
                value={stats?.waiting_support}
                loading={statsLoading}
              />
              <StatPill label="Em andamento" value={stats?.in_progress} loading={statsLoading} />
              <StatPill
                label="Resolvidos hoje"
                value={stats?.resolved_today}
                loading={statsLoading}
              />
              <StatPill label="Abertos" value={stats?.total_open} loading={statsLoading} />
            </div>
          ) : null}
        </header>

        {!canViewSupport ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-semibold text-foreground">
              Você não possui acesso ao suporte.
            </p>
            <p className="text-xs text-muted-foreground">
              Apenas responsáveis do projeto e membros com permissão de suporte podem
              gerenciar tickets.
            </p>
            <Button type="button" variant="outline" className="mt-4 rounded-2xl" onClick={onClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-card-outline/60 px-4 py-3">
              <SupportTicketFilters
                value={filter}
                onChange={setFilter}
                disabled={listLoading && tickets.length === 0}
              />
            </div>

            <div className="flex min-h-0 flex-1">
              <div
                className={cn(
                  'flex min-h-0 w-full flex-col border-card-outline/60 md:w-[min(280px,38%)] md:border-r',
                  showMobileChat ? 'hidden md:flex' : 'flex',
                )}
              >
                <SupportTicketList
                  tickets={tickets}
                  selectedTicketId={selectedTicketId}
                  loading={listLoading}
                  error={listError}
                  onSelect={setSelectedTicketId}
                  onRetry={() => void loadTickets(false)}
                />
              </div>

              <div
                className={cn(
                  'flex min-h-0 min-w-0 flex-1 flex-col',
                  showMobileChat ? 'flex' : 'hidden md:flex',
                )}
              >
                <SupportTicketChat
                  detail={detail}
                  loading={detailLoading}
                  error={detailError}
                  sending={sending}
                  updatingStatus={updatingStatus}
                  showBackOnMobile={showMobileChat}
                  onBack={() => setSelectedTicketId(null)}
                  onSendReply={handleSendReply}
                  onStatusChange={handleStatusChange}
                  onRetry={() => {
                    if (selectedTicketId) void loadDetail(selectedTicketId, false)
                  }}
                />
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function StatPill({
  label,
  value,
  loading,
}: {
  label: string
  value: number | undefined
  loading: boolean
}) {
  return (
    <div className="rounded-xl border border-card-outline/60 bg-background/50 px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-foreground">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden />
        ) : (
          (value ?? '—')
        )}
      </p>
    </div>
  )
}
