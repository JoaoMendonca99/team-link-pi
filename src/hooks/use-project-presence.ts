'use client'

import { useEffect } from 'react'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient } from '@/lib/supabase/client'

const trackers = new Map<string, { users: number; stop: () => void }>()
export function useProjectPresence(target: string | undefined) {
  const { user } = useSupabaseSession()
  const userId = user?.id
  useEffect(() => {
    if (!target || !userId) return
    const key = userId + ':' + target
    const current = trackers.get(key)
    if (current) { current.users++; return () => { if (--current.users === 0) { current.stop(); trackers.delete(key) } } }
    let lastEvent = Date.now(), lastSent = 0, pending = false
    const send = async () => {
      const now = Date.now()
      if (pending || document.hidden || now - lastSent < 60_000 || now - lastEvent > 120_000) return
      pending = true; lastSent = now
      try {
        // Membership, server timestamps and the write throttle remain enforced by the existing RPC.
        await getSupabaseClient().rpc('panel_heartbeat', { p_slug: target, p_active_at: new Date(lastEvent).toISOString() })
      } catch { /* Retry on the next heartbeat; never write an offline event over another tab. */ }
      finally { pending = false }
    }
    const activity = () => { if (!document.hidden) { lastEvent = Date.now(); void send() } }
    const visible = () => { if (!document.hidden) activity() }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    for (const event of events) window.addEventListener(event, activity, { passive: true, capture: true })
    document.addEventListener('visibilitychange', visible); window.addEventListener('focus', activity)
    const timer = window.setInterval(() => void send(), 60_000)
    const tracker = { users: 1, stop: () => {
      window.clearInterval(timer)
      for (const event of events) window.removeEventListener(event, activity, { capture: true })
      document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', activity)
    } }
    trackers.set(key, tracker)
    void send()
    return () => { if (--tracker.users === 0) { tracker.stop(); trackers.delete(key) } }
  }, [target, userId])
}
