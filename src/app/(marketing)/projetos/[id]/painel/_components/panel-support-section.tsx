'use client'

import { useState } from 'react'
import { Headset, KeyRound, Loader2, Ticket } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  disableSupportIntegration,
  generateSupportApiKey,
  regenerateSupportApiKey,
} from '@/lib/support/actions'
import { formatIntegrationUpdatedAt } from '@/lib/support/format'
import {
  isSupportSacActive,
  type SupportIntegrationInfo,
  type SupportProjectTicketStats,
} from '@/lib/support/types'

import { SupportApiKeyModal } from './support/support-api-key-modal'
import { SupportTicketDrawer } from './support/support-ticket-drawer'

export interface PanelSupportSectionProps {
  projectId: string
  isManager: boolean
  integration: SupportIntegrationInfo | null
  integrationLoading: boolean
  onIntegrationChange: () => void
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
  isManager,
  integration,
  integrationLoading,
  onIntegrationChange,
  stats,
  statsLoading,
  canViewSupport,
  onRefreshStats,
  className,
}: PanelSupportSectionProps) {
  const sacActive = isSupportSacActive(integration)

  if (!isManager && !sacActive) {
    return null
  }

  if (isManager && !sacActive) {
    return (
      <SupportSetupCard
        className={className}
        projectId={projectId}
        integration={integration}
        loading={integrationLoading}
        onIntegrationChange={onIntegrationChange}
      />
    )
  }

  return (
    <SupportActiveCard
      className={className}
      projectId={projectId}
      isManager={isManager}
      integration={integration}
      stats={stats}
      statsLoading={statsLoading}
      canViewSupport={canViewSupport}
      onRefreshStats={onRefreshStats}
      onIntegrationChange={onIntegrationChange}
    />
  )
}

function SupportCardShell({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'flex h-full flex-col space-y-6 rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm shadow-primary/5 sm:p-8',
        className,
      )}
    >
      {children}
    </section>
  )
}

function SupportSetupCard({
  projectId,
  integration,
  loading,
  onIntegrationChange,
  className,
}: {
  projectId: string
  integration: SupportIntegrationInfo | null
  loading: boolean
  onIntegrationChange: () => void
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKeyModal, setApiKeyModal] = useState<{ apiKey: string; last4: string } | null>(null)

  const wasDisabled = Boolean(integration?.configured && !integration.enabled)

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    const result = wasDisabled
      ? await regenerateSupportApiKey(projectId)
      : await generateSupportApiKey(projectId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setApiKeyModal({ apiKey: result.api_key, last4: result.last4 })
    onIntegrationChange()
  }

  function closeKeyModal() {
    setApiKeyModal(null)
    onIntegrationChange()
  }

  return (
    <>
      <SupportCardShell className={className}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Headset className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-wide">SUPORTE / SAC</h2>
            <p className="text-sm text-muted-foreground">
              {wasDisabled
                ? 'Integração SAC desativada para este projeto.'
                : 'Nenhuma integração SAC configurada.'}
            </p>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Gere uma API para habilitar tickets e atendimento no app externo.
          </p>
          {wasDisabled && integration?.last4 ? (
            <p className="text-center text-xs text-muted-foreground">
              Chave anterior: ••••{integration.last4}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            className="h-12 w-full rounded-2xl text-base font-bold tracking-wide"
            disabled={busy || loading}
            onClick={() => void handleGenerate()}
          >
            {busy || loading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <KeyRound className="mr-2 h-5 w-5" aria-hidden />
            )}
            Gerar API SAC
          </Button>
        </div>
      </SupportCardShell>

      <SupportApiKeyModal
        open={apiKeyModal != null}
        apiKey={apiKeyModal?.apiKey ?? null}
        last4={apiKeyModal?.last4 ?? null}
        title={wasDisabled ? 'Nova API SAC' : 'API SAC gerada'}
        onClose={closeKeyModal}
      />
    </>
  )
}

function SupportActiveCard({
  projectId,
  isManager,
  integration,
  stats,
  statsLoading,
  canViewSupport,
  onRefreshStats,
  onIntegrationChange,
  className,
}: {
  projectId: string
  isManager: boolean
  integration: SupportIntegrationInfo | null
  stats: SupportProjectTicketStats | null
  statsLoading: boolean
  canViewSupport: boolean
  onRefreshStats: () => void
  onIntegrationChange: () => void
  className?: string
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKeyModal, setApiKeyModal] = useState<{ apiKey: string; last4: string } | null>(null)

  const waitingCount = stats?.waiting_support ?? 0
  const showBadge = canViewSupport && !statsLoading && waitingCount > 0

  function handleCloseDrawer() {
    setDrawerOpen(false)
    if (canViewSupport) onRefreshStats()
  }

  async function handleRegenerate() {
    const confirmed = window.confirm(
      'Gerar uma nova API SAC? A chave atual deixará de funcionar imediatamente.',
    )
    if (!confirmed) return
    setBusy(true)
    setError(null)
    const result = await regenerateSupportApiKey(projectId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    setApiKeyModal({ apiKey: result.api_key, last4: result.last4 })
    onIntegrationChange()
  }

  async function handleDisable() {
    const confirmed = window.confirm(
      'Desativar o SAC deste projeto? A equipe deixará de ver tickets até gerar ou reativar a API.',
    )
    if (!confirmed) return
    setBusy(true)
    setError(null)
    const result = await disableSupportIntegration(projectId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    onIntegrationChange()
  }

  function closeKeyModal() {
    setApiKeyModal(null)
    onRefreshStats()
  }

  return (
    <>
      <SupportCardShell className={className}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Headset className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-wide">SUPORTE</h2>
            <p className="text-sm text-muted-foreground">
              Atendimento e tickets do projeto.
            </p>
            {integration?.last4 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Integração ativa · API ••••{integration.last4}
                {integration.updated_at
                  ? ` · ${formatIntegrationUpdatedAt(integration.updated_at)}`
                  : ''}
              </p>
            ) : null}
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

          {isManager ? (
            <div className="flex flex-col gap-2 border-t border-card-outline/60 pt-4">
              {error ? (
                <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl font-semibold"
                disabled={busy}
                onClick={() => void handleRegenerate()}
              >
                Regenerar API
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-2xl font-semibold text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => void handleDisable()}
              >
                Desativar SAC
              </Button>
            </div>
          ) : null}
        </div>
      </SupportCardShell>

      <SupportTicketDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        projectId={projectId}
        canViewSupport={canViewSupport}
        stats={stats}
        statsLoading={statsLoading}
        onRefreshStats={onRefreshStats}
      />

      <SupportApiKeyModal
        open={apiKeyModal != null}
        apiKey={apiKeyModal?.apiKey ?? null}
        last4={apiKeyModal?.last4 ?? null}
        title="Nova API SAC"
        onClose={closeKeyModal}
      />
    </>
  )
}
