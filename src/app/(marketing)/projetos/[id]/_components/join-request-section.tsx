'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { JoinRequestRow } from '@/types/database'

type MembershipState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'owner' }
  | { kind: 'member' }
  | { kind: 'pending'; request: JoinRequestRow }
  | { kind: 'available'; lastRequest: JoinRequestRow | null }

interface JoinRequestSectionProps {
  projectId: string
  ownerId: string
  /** `inline` omite o card externo — para uso dentro do card de vagas. */
  variant?: 'card' | 'inline'
}

export function JoinRequestSection({
  projectId,
  ownerId,
  variant = 'card',
}: JoinRequestSectionProps) {
  const { user, isAuthenticated, loading: sessionLoading } = useSupabaseSession()
  const [state, setState] = useState<MembershipState>({ kind: 'loading' })
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isInline = variant === 'inline'

  const refresh = useCallback(async () => {
    if (sessionLoading) {
      setState({ kind: 'loading' })
      return
    }
    if (!isAuthenticated || !user) {
      setState({ kind: 'anonymous' })
      return
    }
    if (user.id === ownerId) {
      setState({ kind: 'owner' })
      return
    }

    const client = getSupabaseClient()
    const [memberResult, requestResult] = await Promise.all([
      client
        .from('project_members')
        .select('id, role, status')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle(),
      client
        .from('join_requests')
        .select('id, project_id, user_id, message, status, decided_by, decided_at, created_at')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (memberResult.data) {
      setState({ kind: 'member' })
      return
    }

    const lastRequest = (requestResult.data as JoinRequestRow | null) ?? null
    if (lastRequest && lastRequest.status === 'pending') {
      setState({ kind: 'pending', request: lastRequest })
      return
    }
    setState({ kind: 'available', lastRequest })
  }, [isAuthenticated, ownerId, projectId, sessionLoading, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleRequest = async () => {
    setErrorMessage(null)
    if (!user) return
    setSubmitting(true)
    const trimmed = message.trim()
    const client = getSupabaseClient()
    const { error } = await client.from('join_requests').insert({
      project_id: projectId,
      user_id: user.id,
      message: trimmed.length > 0 ? trimmed : null,
      status: 'pending',
    })
    if (error) {
      const normalized = error.message?.toLowerCase() ?? ''
      if (normalized.includes('duplicate') || normalized.includes('unique')) {
        setErrorMessage('Você já tem uma solicitação pendente para este projeto.')
      } else {
        setErrorMessage('Não foi possível enviar sua solicitação.')
      }
    } else {
      setMessage('')
      await refresh()
    }
    setSubmitting(false)
  }

  const handleCancel = async (requestId: string) => {
    setErrorMessage(null)
    setSubmitting(true)
    const client = getSupabaseClient()
    const { error } = await client
      .from('join_requests')
      .update({ status: 'canceled' })
      .eq('id', requestId)
    if (error) {
      setErrorMessage('Não foi possível cancelar sua solicitação.')
    } else {
      await refresh()
    }
    setSubmitting(false)
  }

  if (isInline && (state.kind === 'anonymous' || state.kind === 'owner' || state.kind === 'member')) {
    return null
  }

  const body = (() => {
    if (state.kind === 'loading') {
      return <div className="h-12 animate-pulse rounded-2xl bg-muted" />
    }

    if (state.kind === 'owner') {
      return (
        <p className="text-sm text-muted-foreground">
          Você é responsável por este projeto. As solicitações chegam direto na sua área de gestão.
        </p>
      )
    }

    if (state.kind === 'member') {
      return (
        <p className="text-sm text-muted-foreground">Você já participa deste projeto.</p>
      )
    }

    if (state.kind === 'anonymous') {
      return (
        <>
          <p className="text-sm text-muted-foreground">
            Entre na sua conta para solicitar participação neste projeto.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button asChild className="w-full rounded-2xl font-semibold sm:w-auto">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild variant="outline" className="w-full rounded-2xl font-semibold sm:w-auto">
              <Link href="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </>
      )
    }

    if (state.kind === 'pending') {
      return (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Solicitação enviada. Aguardando a resposta da equipe.
          </p>
          {state.request.message ? (
            <p className="whitespace-pre-line rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              {state.request.message}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-2xl font-semibold sm:w-auto"
            onClick={() => void handleCancel(state.request.id)}
            disabled={submitting}
          >
            {submitting ? 'Cancelando...' : 'Cancelar solicitação'}
          </Button>
          {errorMessage ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Conte para a equipe por que quer participar. A mensagem é opcional.
        </p>
        {state.lastRequest && state.lastRequest.status === 'rejected' ? (
          <p className="text-xs text-muted-foreground">
            Sua solicitação anterior foi recusada. Você pode tentar novamente com uma nova mensagem.
          </p>
        ) : null}
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Apresente-se, sua disponibilidade ou interesse pelo projeto..."
          disabled={submitting}
          aria-label="Mensagem para a equipe do projeto"
        />
        {errorMessage ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errorMessage}
          </p>
        ) : null}
        <Button
          type="button"
          className="w-full rounded-2xl font-semibold sm:w-auto"
          onClick={() => void handleRequest()}
          disabled={submitting}
        >
          {submitting ? 'Enviando...' : 'Solicitar participação'}
        </Button>
      </div>
    )
  })()

  if (isInline) {
    return (
      <div className="space-y-3 border-t border-card-outline/70 pt-5">{body}</div>
    )
  }

  return (
    <section className="rounded-[1.75rem] border border-card-outline bg-muted/40 p-6 dark:bg-muted/20">
      <h3 className="text-xl font-semibold">Participação</h3>
      <div className="mt-3">{body}</div>
    </section>
  )
}
