'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectViewer } from '@/components/providers/project-viewer'
import { publishProjectCardState, useProjectCardState } from '@/hooks/use-project-card-state'
import { getSupabaseClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const writes = new Set<string>()

export function LikeButton({ projectId, initialCount, href, enabled = true, compact, className }: {
  projectId: string; initialCount: number; href: string; enabled?: boolean; compact?: boolean; className?: string
}) {
  const { userId, loading } = useProjectViewer()
  const { row, ready, key, reload } = useProjectCardState(projectId)
  const [pending, setPending] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [error, setError] = useState('')
  const count = row?.likes_count ?? initialCount
  const liked = row?.liked ?? false

  async function toggle() {
    if (loading || !key || writes.has(key)) return
    if (!userId) { setShowLogin(true); return }
    writes.add(key)
    setError('')
    setPending(true)
    try {
      const state = row ?? await reload()
      if (!state) throw Error('Likes unavailable')
      const client = getSupabaseClient()
      const { error } = state.liked
        ? await client.from('project_likes').delete().eq('project_id', projectId).eq('user_id', userId)
        : await client.from('project_likes').insert({ project_id: projectId, user_id: userId })
      if (error && error.code !== '23505') throw error
      const latest = await reload()
      if (latest) publishProjectCardState(key, latest)
      else publishProjectCardState(key, {
        ...state, liked: !state.liked,
        likes_count: Math.max(0, Number(state.likes_count ?? initialCount) + (state.liked ? -1 : error ? 0 : 1)),
      })
    } catch {
      setError('Não foi possível atualizar a curtida. Tente novamente.')
    } finally {
      writes.delete(key)
      setPending(false)
    }
  }

  const metric = <><Heart className={cn('size-4', liked && 'fill-current')} aria-hidden />{count}</>
  if (!enabled) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{metric}</span>
  return <div className={cn('min-w-0 space-y-1', className)}>
    <Button type="button" size={compact ? 'sm' : 'default'} variant={liked ? 'default' : 'outline'}
      className={cn(compact && 'gap-1 px-2.5', !compact && 'rounded-xl')}
      aria-label={liked ? 'Remover curtida do projeto' : 'Curtir projeto'}
      aria-pressed={liked} aria-busy={pending || Boolean(userId && !ready)} disabled={pending || loading || Boolean(userId && !ready)} onClick={() => void toggle()}>
      {metric}{!compact && <span>{liked ? 'Curtido' : 'Curtir'}</span>}
    </Button>
    {showLogin && !userId && <p className="text-xs"><Link className="text-link underline" href={'/login?next=' + encodeURIComponent(href)}>Entre para curtir</Link></p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>
}
