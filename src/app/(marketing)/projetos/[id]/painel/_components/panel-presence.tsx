'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient } from '@/lib/supabase/client'

// All panel routes share this tracker; no offline write can override another tab.
export function PanelPresence({ slug }: { slug: string }) {
  const { user } = useSupabaseSession()
  const userId = user?.id
  const path = usePathname()
  useEffect(() => {
    if (!userId) return
    let lastEvent = Date.now()
    let lastSent = 0
    let pending = false
    let alive = true
    const send = async () => {
      const now = Date.now()
      if (pending || document.hidden || now - lastSent < 60_000 || now - lastEvent > 120_000) return
      pending = true; lastSent = now
      try {
        const { error } = await getSupabaseClient().rpc('panel_heartbeat', { p_slug: slug, p_active_at: new Date(lastEvent).toISOString() })
        if (alive && error && error.code !== 'P0001') console.warn('Não foi possível atualizar a presença no painel.', error.code)
      } catch { /* Retry on the next real interaction/heartbeat. */ }
      finally { pending = false }
    }
    const activity = () => { if (!document.hidden) { lastEvent = Date.now(); void send() } }
    const visible = () => { if (!document.hidden) activity() }
    const events = ['pointerdown','keydown','scroll','touchstart'] as const
    for (const event of events) window.addEventListener(event, activity, { passive: true, capture: true })
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('focus', activity)
    const timer = window.setInterval(() => void send(), 60_000)
    void send()
    return () => {
      alive = false; window.clearInterval(timer)
      for (const event of events) window.removeEventListener(event, activity, { capture: true })
      document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', activity)
    }
  }, [slug, userId, path])
  return null
}
