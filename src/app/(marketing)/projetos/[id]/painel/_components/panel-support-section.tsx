'use client'

import { useState } from 'react'
import { FileText, Headset, KeyRound, Loader2, Ticket } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  disableSupportIntegration,
  generateSupportApiKey,
  regenerateSupportApiKey,
} from '@/lib/support/actions'
import { formatIntegrationUpdatedAt } from '@/lib/support/format'
import {
  buildSupportIntegrationSnapshot,
  isSupportSacActive,
  isSupportSacConfigured,
  type SupportIntegrationInfo,
  type SupportProjectTicketStats,
} from '@/lib/support/types'

import { SupportApiKeyModal } from './support/support-api-key-modal'
import { SupportTicketDrawer } from './support/support-ticket-drawer'

const SAC_API_DOCUMENTATION_HREF = '/docs/documentacao-api-sac-team-link.pdf'

export interface PanelSupportSectionProps {
  projectId: string
  isManager: boolean
  integration: SupportIntegrationInfo | null
  integrationLoading: boolean
  integrationError: string | null
  onIntegrationChange: (snapshot?: SupportIntegrationInfo) => void
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
  integrationError,
  onIntegrationChange,
  stats,
  statsLoading,
  canViewSupport,
  onRefreshStats,
  className,
}: PanelSupportSectionProps) {
  const configured = isSupportSacConfigured(integration)
  const sacActive = isSupportSacActive(integration)

  if (!isManager && !sacActive) {
    return null
  }

  if (!configured) {
    return (
      <SupportSetupCard
        className={className}
        projectId={projectId}
        loading={integrationLoading}
        integrationError={integrationError}
        onIntegrationChange={onIntegrationChange}
      />
    )
  }

  return (
    <SupportIntegratedCard
      className={className}
      projectId={projectId}
      isManager={isManager}
      integration={integration}
      sacActive={sacActive}
      integrationError={integrationError}
      stats={stats}
      statsLoading={statsLoading}
      canViewSupport={canViewSupport}
      onRefreshStats={onRefreshStats}
      onIntegrationChange={onIntegrationChange}
    />
  )
}

function SupportApiDocumentationLink() {
  return (
    <div className="border-t border-card-outline/60 pt-4">
      <Button asChild variant="outline" className="h-10 w-full rounded-2xl font-semibold sm:h-11">
        <a
          href={SAC_API_DOCUMENTATION_HREF}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FileText className="mr-2 h-4 w-4 shrink-0" aria-hidden />
          Ver documentação da API
        </a>
      </Button>
      <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
        Guia de integração para sistemas externos criarem e acompanharem tickets.
      </p>
    </div>
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
        'flex h-fit w-full flex-col space-y-6 self-start rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm shadow-primary/5 sm:p-8',
        className,
      )}
    >
      {children}
    </section>
  )
}

function SupportSetupCard({
  projectId,
  loading,
  integrationError,
  onIntegrationChange,
  className,
}: {
  projectId: string
  loading: boolean
  integrationError: string | null
  onIntegrationChange: (snapshot?: SupportIntegrationInfo) => void
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKeyModal, setApiKeyModal] = useState<{ apiKey: string; last4: string } | null>(null)

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    const result = await generateSupportApiKey(projectId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    const snapshot = buildSupportIntegrationSnapshot({ last4: result.last4 })
    onIntegrationChange(snapshot)
    setApiKeyModal({ apiKey: result.api_key, last4: result.last4 })
  }

  function closeKeyModal() {
    setApiKeyModal(null)
    onIntegrationChange()
  }

  const displayError = error ?? integrationError

  return (
    <>
      <SupportCardShell className={className}>
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Headset className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold tracking-wide">SUPORTE / SAC</h2>
            <p className="text-sm text-muted-foreground">Nenhuma integração SAC configurada.</p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted-foreground">
            Gere uma API para habilitar tickets e atendimento no app externo.
          </p>
          {displayError ? (
            <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
              {displayError}
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
          <SupportApiDocumentationLink />
        </div>
      </SupportCardShell>

      <SupportApiKeyModal
        open={apiKeyModal != null}
        apiKey={apiKeyModal?.apiKey ?? null}
        last4={apiKeyModal?.last4 ?? null}
        title="API SAC gerada"
        onClose={closeKeyModal}
      />
    </>
  )
}

function SupportIntegratedCard({
  projectId,
  isManager,
  integration,
  sacActive,
  integrationError,
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
  sacActive: boolean
  integrationError: string | null
  stats: SupportProjectTicketStats | null
  statsLoading: boolean
  canViewSupport: boolean
  onRefreshStats: () => void
  onIntegrationChange: (snapshot?: SupportIntegrationInfo) => void
  className?: string
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKeyModal, setApiKeyModal] = useState<{ apiKey: string; last4: string } | null>(null)

  const waitingCount = stats?.waiting_support ?? 0
  const showBadge = sacActive && canViewSupport && !statsLoading && waitingCount > 0
  const displayError = error ?? integrationError

  function handleCloseDrawer() {
    setDrawerOpen(false)
    if (canViewSupport && sacActive) onRefreshStats()
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
    const snapshot = buildSupportIntegrationSnapshot({ last4: result.last4 })
    onIntegrationChange(snapshot)
    setApiKeyModal({ apiKey: result.api_key, last4: result.last4 })
  }

  async function handleDisable() {
    const confirmed = window.confirm('A API atual deixará de funcionar.')
    if (!confirmed) return
    setBusy(true)
    setError(null)
    const result = await disableSupportIntegration(projectId)
    setBusy(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    if (integration?.last4) {
      onIntegrationChange(
        buildSupportIntegrationSnapshot({
          last4: integration.last4,
          enabled: false,
          updated_at: new Date().toISOString(),
        }),
      )
    } else {
      onIntegrationChange()
    }
  }

  function closeKeyModal() {
    setApiKeyModal(null)
    if (sacActive) onRefreshStats()
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
            <h2 className="text-lg font-semibold tracking-wide">SUPORTE</h2>
            {isManager ? (
              <div className="mt-2 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  API SAC configurada
                </p>
                {integration?.last4 ? (
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                    Final: ••••{integration.last4}
                  </p>
                ) : null}
                {integration?.updated_at ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Atualizada {formatIntegrationUpdatedAt(integration.updated_at)}
                  </p>
                ) : null}
                {!sacActive ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    SAC desativado — regenere a API para reativar o atendimento.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Atendimento e tickets do projeto.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {sacActive ? (
            <>
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
            </>
          ) : isManager ? (
            <p className="text-center text-sm text-muted-foreground">
              O atendimento está pausado. Use &quot;Regenerar API&quot; para reativar.
            </p>
          ) : null}

          {isManager ? (
            <div className="flex flex-col gap-2 border-t border-card-outline/60 pt-4">
              {displayError ? (
                <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                  {displayError}
                </p>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-2xl font-semibold"
                disabled={busy}
                onClick={() => void handleRegenerate()}
              >
                Regenerar API
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full rounded-2xl font-semibold text-destructive hover:text-destructive"
                disabled={busy || !sacActive}
                onClick={() => void handleDisable()}
              >
                Desativar SAC
              </Button>
            </div>
          ) : null}

          <SupportApiDocumentationLink />
        </div>
      </SupportCardShell>

      {sacActive ? (
        <SupportTicketDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          projectId={projectId}
          canViewSupport={canViewSupport}
          stats={stats}
          statsLoading={statsLoading}
          onRefreshStats={onRefreshStats}
        />
      ) : null}

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
