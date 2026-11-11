'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { FRIENDSHIPS_CHANGED, PROFILE_CHANGED } from '@/lib/profile-social'
import { RECOMMENDATIONS_CHANGED, RECOMMENDATION_PRIVACY_CHANGED, RECOMMENDATION_ACCESS_CHANGED } from '@/lib/graph/events'

type Reply<T> = { ok: true; data: T; retainOnError: boolean } | { ok: false; revoked: boolean; message: string }
type State<T> = { scope: string; data?: T; retainOnError?: boolean; busy: boolean; error?: string; revoked?: boolean }

/** A single in-flight request per mounted scope, with at most one queued mutation refresh. */
export function useRecommendationRefresh<T>(uid: string | undefined, scope: string, request: (token: string) => Promise<Reply<T>>) {
  const [state, setState] = useState<State<T>>()
  const run = useRef<() => void>(() => {})
  const invalidateRun = useRef<() => void>(() => {})
  const refresh = useCallback(() => run.current(), [])
  const invalidate = useCallback(() => invalidateRun.current(), [])
  useEffect(() => {
    if (!uid) return
    let active = true, pending = false, queued = false, revision = 0, last = -Infinity
    const update = (patch: Partial<State<T>>) => {
      if (active) setState(previous => ({ scope, busy:false, ...(previous?.scope === scope ? previous : {}), ...patch }))
    }
    const load = async () => {
      if (!active || pending || document.hidden) return
      pending = true; queued = false; last = performance.now()
      const started = revision
      update({ busy:true, error:undefined })
      try {
        const { data:{session}, error } = await getSupabaseClient().auth.getSession()
        if (error && (error.status===401 || error.status===403 || error.code==='session_not_found')) {
          if (started===revision) update({data:undefined,retainOnError:false,revoked:true,error:'Sessão indisponível.'})
          return
        }
        if (error) throw error
        const result = session?.user.id === uid ? await request(session.access_token)
          : { ok:false as const, revoked:true, message:'Sessão indisponível.' }
        if (!active || started !== revision) return
        if (result.ok) update({data:result.data, retainOnError:result.retainOnError, revoked:false})
        else if (result.revoked) update({data:undefined, retainOnError:false, revoked:true, error:result.message})
        else fail(result.message)
      } catch {
        if (active && started === revision) fail('Não foi possível atualizar as sugestões.')
      } finally {
        pending = false
        if (active && queued && !document.hidden) void load()
        else update({busy:false})
      }
    }
    const fail = (message: string) => {
      if (active) setState(previous => ({
        scope, busy:false, revoked:previous?.scope===scope&&previous.revoked, error:message,
        data:previous?.scope===scope&&previous.retainOnError ? previous.data : undefined,
        retainOnError:previous?.scope===scope&&previous.retainOnError
      }))
    }
    const changed = (clear = false) => {
      revision++
      if (clear) update({data:undefined, retainOnError:false, error:undefined})
      if (pending || document.hidden) queued = true
      else void load()
    }
    const attention = () => { if (queued || performance.now()-last > 1000) void load() }
    const ordinary = () => changed()
    const restricted = () => changed(true)
    const storage = (event: StorageEvent) => {
      if (event.key === RECOMMENDATION_PRIVACY_CHANGED || event.key === RECOMMENDATION_ACCESS_CHANGED) restricted()
      if (event.key === RECOMMENDATIONS_CHANGED) ordinary()
    }
    run.current = () => { void load() }
    invalidateRun.current = ordinary
    void load()
    const events = [PROFILE_CHANGED, FRIENDSHIPS_CHANGED, RECOMMENDATIONS_CHANGED]
    events.forEach(event => window.addEventListener(event, ordinary))
    window.addEventListener(RECOMMENDATION_PRIVACY_CHANGED, restricted)
    window.addEventListener(RECOMMENDATION_ACCESS_CHANGED, restricted)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', attention)
    document.addEventListener('visibilitychange', attention)
    return () => {
      active = false
      events.forEach(event => window.removeEventListener(event, ordinary))
      window.removeEventListener(RECOMMENDATION_PRIVACY_CHANGED, restricted)
      window.removeEventListener(RECOMMENDATION_ACCESS_CHANGED, restricted)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', attention)
      document.removeEventListener('visibilitychange', attention)
    }
  }, [uid, scope, request])
  const current = uid && state?.scope === scope ? state : undefined
  return { data:current?.data, busy:current?.busy ?? Boolean(uid), error:current?.error, revoked:current?.revoked, refresh, invalidate }
}
