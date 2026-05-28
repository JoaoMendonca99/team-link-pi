'use client'

import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { JoinRequestStatus } from '@/types/database'
import { cn } from '@/lib/utils'

/**
 * Shape do join_request com profile aninhado (consulta `profiles:user_id (...)`).
 * Mantemos localmente porque é específico desta consulta com relacionamento.
 */
interface JoinRequestWithProfile {
  id: string
  project_id: string
  user_id: string
  message: string | null
  status: JoinRequestStatus
  decided_by: string | null
  decided_at: string | null
  created_at: string
  profiles: {
    id: string
    full_name: string | null
    email: string | null
    course: string | null
    bio: string | null
    skills: string[] | null
    interests: string[] | null
    avatar_url: string | null
  } | null
}

const STATUS_LABEL: Record<JoinRequestStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  rejected: 'Recusada',
  canceled: 'Cancelada',
}

const STATUS_CLASSNAME: Record<JoinRequestStatus, string> = {
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  approved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300',
  rejected: 'border-destructive/40 bg-destructive/10 text-destructive',
  canceled: 'border-border bg-muted text-muted-foreground',
}

export function OwnerRequestsSection({
  projectId,
  onChange,
}: {
  projectId: string
  onChange?: () => void | Promise<void>
}) {
  const { user } = useSupabaseSession()
  const [requests, setRequests] = useState<JoinRequestWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    const client = getSupabaseClient()
    const { data, error } = await client
      .from('join_requests')
      .select(
        `id, project_id, user_id, message, status, decided_by, decided_at, created_at,
         profiles:user_id (id, full_name, email, course, bio, skills, interests, avatar_url)`,
      )
      .eq('project_id', projectId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    if (error) {
      setErrorMessage('Não foi possível carregar solicitações.')
      setRequests([])
    } else {
      setRequests((data ?? []) as unknown as JoinRequestWithProfile[])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (requestId: string, action: 'approve' | 'reject') => {
    if (!user) return
    setErrorMessage(null)
    setSuccessMessage(null)
    setProcessingId(requestId)
    const client = getSupabaseClient()
    const { error } = await client.rpc('handle_join_request', {
      p_request_id: requestId,
      p_action: action,
    })

    if (error) {
      setErrorMessage(
        action === 'approve'
          ? 'Não foi possível aprovar essa solicitação.'
          : 'Não foi possível recusar essa solicitação.',
      )
    } else {
      setRequests((current) => current.filter((row) => row.id !== requestId))
      setSuccessMessage(
        action === 'approve'
          ? 'Solicitação aprovada. O membro já faz parte da equipe.'
          : 'Solicitação recusada.',
      )
      await onChange?.()
    }
    setProcessingId(null)
  }

  return (
    <section className="space-y-6 rounded-[1.85rem] border border-card-outline bg-card p-8 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Gerenciar pedidos</p>
        <h3 className="text-2xl font-bold">Solicitações de participação</h3>
        <p className="text-sm text-muted-foreground">
          Ao aprovar uma solicitação, a pessoa entra automaticamente na equipe do projeto.
        </p>
      </div>

      {errorMessage ? (
        <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p
          role="status"
          className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-900 dark:text-emerald-200"
        >
          {successMessage}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma solicitação pendente.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              processing={processingId === req.id}
              onApprove={() => void decide(req.id, 'approve')}
              onReject={() => void decide(req.id, 'reject')}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RequestCard({
  request,
  processing,
  onApprove,
  onReject,
}: {
  request: JoinRequestWithProfile
  processing: boolean
  onApprove?: () => void
  onReject?: () => void
}) {
  const profile = request.profiles
  const name = profile?.full_name?.trim() || 'Solicitante'
  const createdAt = new Date(request.created_at)
  const createdLabel = Number.isNaN(createdAt.getTime()) ? '' : createdAt.toLocaleString('pt-BR')
  const isPending = request.status === 'pending'

  return (
    <article className="rounded-2xl border border-card-outline bg-background p-5 shadow-sm">
      <header className="flex flex-wrap items-start gap-3">
        <UserAvatar name={name} imageUrl={profile?.avatar_url ?? undefined} sizeClassName="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{name}</p>
          {profile?.course ? (
            <p className="truncate text-xs text-muted-foreground">{profile.course}</p>
          ) : null}
          {profile?.bio ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{profile.bio}</p>
          ) : null}
          {profile?.email ? (
            <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          ) : null}
          {createdLabel ? (
            <p className="mt-1 text-xs font-medium text-muted-foreground">Enviada em {createdLabel}</p>
          ) : null}
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
            STATUS_CLASSNAME[request.status],
          )}
        >
          {STATUS_LABEL[request.status]}
        </span>
      </header>

      {profile?.skills && profile.skills.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">Habilidades:</span>{' '}
          {profile.skills.join(', ')}
        </p>
      ) : null}

      {request.message ? (
        <p className="mt-3 whitespace-pre-line rounded-2xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {request.message}
        </p>
      ) : (
        <p className="mt-3 text-xs italic text-muted-foreground">Sem mensagem.</p>
      )}

      {isPending && onApprove && onReject ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="button" className="rounded-2xl font-semibold" onClick={onApprove} disabled={processing}>
            {processing ? 'Aprovando...' : 'Aprovar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl font-semibold"
            onClick={onReject}
            disabled={processing}
          >
            {processing ? 'Recusando...' : 'Recusar'}
          </Button>
        </div>
      ) : null}
    </article>
  )
}
