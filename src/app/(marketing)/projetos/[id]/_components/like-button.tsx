'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Heart } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { cn } from '@/lib/utils'

export function LikeButton({
  projectId,
  initialCount,
  onCountChange,
  className,
}: {
  projectId: string
  initialCount: number
  onCountChange?: (next: number) => void
  className?: string
}) {
  const { isAuthenticated, user } = useSupabaseSession()
  const [count, setCount] = useState(initialCount)
  const [liked, setLiked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showLoginHint, setShowLoginHint] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setCount(initialCount)
  }, [initialCount])

  // Verifica se o usuário atual já curtiu o projeto.
  useEffect(() => {
    if (!user) {
      setLiked(false)
      return
    }
    let active = true
    void (async () => {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('project_likes')
        .select('id')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!active) return
      if (!error && data) setLiked(true)
      else if (!error) setLiked(false)
    })()
    return () => {
      active = false
    }
  }, [projectId, user])

  const updateCount = useCallback(
    (next: number) => {
      setCount(next)
      onCountChange?.(next)
    },
    [onCountChange],
  )

  const handleClick = useCallback(async () => {
    setErrorMessage(null)
    if (!isAuthenticated || !user) {
      setShowLoginHint(true)
      return
    }
    setLoading(true)
    const client = getSupabaseClient()
    if (liked) {
      const { error } = await client
        .from('project_likes')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', user.id)
      if (error) {
        setErrorMessage('Não foi possível remover sua curtida.')
      } else {
        setLiked(false)
        updateCount(Math.max(0, count - 1))
      }
    } else {
      const { error } = await client
        .from('project_likes')
        .insert({ project_id: projectId, user_id: user.id })
      if (error) {
        const normalized = error.message?.toLowerCase() ?? ''
        if (normalized.includes('duplicate') || normalized.includes('unique')) {
          setLiked(true)
        } else {
          setErrorMessage('Não foi possível registrar sua curtida.')
        }
      } else {
        setLiked(true)
        updateCount(count + 1)
      }
    }
    setLoading(false)
  }, [count, isAuthenticated, liked, projectId, updateCount, user])

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Button
        type="button"
        variant={liked ? 'default' : 'outline'}
        className="rounded-2xl font-semibold"
        onClick={() => void handleClick()}
        disabled={loading}
        aria-pressed={liked}
      >
        <Heart className={cn('h-4 w-4', liked && 'fill-current')} aria-hidden />
        {loading ? 'Processando...' : `Curtir · ${count}`}
      </Button>
      {showLoginHint && !isAuthenticated ? (
        <p className="text-xs text-muted-foreground">
          Entre para curtir.{' '}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Ir para login
          </Link>
        </p>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
