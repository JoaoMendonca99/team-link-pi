'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { ProjectPublicCommentRow } from '@/types/database'

export function CommentsSection({
  projectId,
  initialCount,
  onCountChange,
}: {
  projectId: string
  initialCount: number
  onCountChange?: (next: number) => void
}) {
  const { isAuthenticated, user } = useSupabaseSession()
  const [comments, setComments] = useState<ProjectPublicCommentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const updateCount = useCallback(
    (next: number) => {
      onCountChange?.(next)
    },
    [onCountChange],
  )

  const load = useCallback(async () => {
    setLoading(true)
    const client = getSupabaseClient()
    const { data, error } = await client
      .from('project_public_comments')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) {
      setErrorMessage('Não foi possível carregar comentários.')
      setComments([])
    } else {
      const rows = (data ?? []) as ProjectPublicCommentRow[]
      setComments(rows)
      updateCount(rows.length)
    }
    setLoading(false)
  }, [projectId, updateCount])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async () => {
    setErrorMessage(null)
    if (!user) return
    const content = draft.trim()
    if (!content) {
      setErrorMessage('Escreva algo antes de enviar.')
      return
    }
    setSubmitting(true)
    const client = getSupabaseClient()
    const { error } = await client.from('project_comments').insert({
      project_id: projectId,
      user_id: user.id,
      content,
      status: 'visible',
    })
    if (error) {
      setErrorMessage('Não foi possível publicar seu comentário.')
    } else {
      setDraft('')
      await load()
    }
    setSubmitting(false)
  }

  const handleDelete = async (commentId: string) => {
    setErrorMessage(null)
    setDeletingId(commentId)
    const client = getSupabaseClient()
    const { error } = await client.from('project_comments').delete().eq('id', commentId)
    if (error) {
      setErrorMessage('Não foi possível remover o comentário.')
    } else {
      await load()
    }
    setDeletingId(null)
  }

  const initialLabel = !loading && comments.length === 0 ? initialCount : comments.length

  return (
    <section className="space-y-6 rounded-[1.85rem] border border-dashed border-primary/40 bg-primary/5 p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary">Discussões</p>
        <h3 className="text-2xl font-bold">Comentários ({initialLabel})</h3>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="rounded-2xl border border-border/80 bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum comentário ainda. Seja o primeiro a comentar.
        </p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => {
            const authorName = comment.author_name?.trim() || 'Anônimo'
            const date = new Date(comment.created_at)
            const dateLabel = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR')
            const isMine = user?.id === comment.user_id
            return (
              <article key={comment.id} className="rounded-2xl border border-border bg-card p-5 shadow-inner">
                <header className="flex items-center gap-3">
                  <UserAvatar
                    name={authorName}
                    imageUrl={comment.author_avatar_url ?? undefined}
                    sizeClassName="h-10 w-10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{authorName}</p>
                    {dateLabel ? (
                      <p className="text-xs font-medium text-muted-foreground">{dateLabel}</p>
                    ) : null}
                  </div>
                  {isMine ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="rounded-2xl text-xs font-semibold text-muted-foreground"
                      onClick={() => void handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                    >
                      {deletingId === comment.id ? 'Removendo...' : 'Apagar'}
                    </Button>
                  ) : null}
                </header>
                <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {comment.content}
                </p>
              </article>
            )
          })}
        </div>
      )}

      {isAuthenticated ? (
        <div className="space-y-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Compartilhe feedback, disponibilidade ou perguntas..."
            aria-label="Novo comentário"
            disabled={submitting}
          />
          {errorMessage ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errorMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="rounded-2xl font-semibold"
              onClick={() => void handleSubmit()}
              disabled={submitting || draft.trim().length === 0}
            >
              {submitting ? 'Publicando...' : 'Publicar comentário'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="rounded-2xl font-semibold"
              onClick={() => setDraft('')}
              disabled={submitting}
            >
              Limpar
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm font-medium text-muted-foreground">
          <p className="text-foreground">Entre na sua conta para comentar.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild className="rounded-xl font-semibold">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl font-semibold">
              <Link href="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
