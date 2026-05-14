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

export function JoinRequestSection({
  projectId,
  ownerId,
}: {
  projectId: string
  ownerId: string
}) {
  const { user, isAuthenticated, loading: sessionLoading } = useSupabaseSession()
  const [state, setState] = useState<MembershipState>({ kind: 'loading' })
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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

  return (
    <section className="rounded-[1.75rem] border border-border bg-muted/40 p-6 dark:bg-muted/20">
      <h3 className="text-xl font-semibold">Participação</h3>

      {state.kind === 'loading' ? (
        <div className="mt-3 h-12 animate-pulse rounded-2xl bg-card" />
      ) : state.kind === 'owner' ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Você é responsável por este projeto. As solicitações chegam direto na sua área de gestão.
        </p>
      ) : state.kind === 'member' ? (
        <p className="mt-2 text-sm text-muted-foreground">Você já participa deste projeto.</p>
      ) : state.kind === 'anonymous' ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre na sua conta para solicitar participação neste projeto.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild className="rounded-2xl font-semibold">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link href="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </>
      ) : state.kind === 'pending' ? (
        <div className="space-y-3">
          <p className="mt-2 text-sm text-muted-foreground">
            Solicitação enviada. Aguardando a resposta da equipe.
          </p>
          {state.request.message ? (
            <p className="whitespace-pre-line rounded-2xl bg-card/70 px-4 py-3 text-sm text-muted-foreground">
              {state.request.message}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl font-semibold"
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
      ) : (
        <div className="space-y-3">
          <p className="mt-2 text-sm text-muted-foreground">
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
            className="w-full rounded-2xl font-semibold"
            onClick={() => void handleRequest()}
            disabled={submitting}
          >
            {submitting ? 'Enviando...' : 'Solicitar participação'}
          </Button>
        </div>
      )}
    </section>
  )
}
