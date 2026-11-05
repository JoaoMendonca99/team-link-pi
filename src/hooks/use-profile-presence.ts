'use client'

import { useEffect } from 'react'
import { FRIENDSHIPS_CHANGED, profileRpc, PROFILE_CHANGED } from '@/lib/profile-social'
import { getSupabaseClient } from '@/lib/supabase/client'

export function useProfilePresence(userId?: string) {
  useEffect(() => {
    if (!userId) return
    let enabled = false
    let active = true
    let lastAction = Date.now()
    let lastSent = 0
    const key = 'team-link-presence:' + userId

    const record = () => {
      const now = Date.now()
      if (!enabled || document.hidden || now - lastAction >= 60_000 || now - lastSent < 55_000) return
      try {
        if (now - Number(localStorage.getItem(key)) < 55_000) return
        localStorage.setItem(key, String(now))
      } catch {
        // The server still throttles updates when storage is unavailable.
      }
      lastSent = now
      void profileRpc('record_profile_activity').catch(() => {})
    }
    const activity = () => { lastAction = Date.now() }
    const visibility = () => {
      if (!document.hidden) { activity(); record() }
    }
    const preference = () => {
      void profileRpc<boolean>('get_my_presence_visibility').then((value) => {
        if (!active) return
        enabled = value
        record()
      }).catch(() => { enabled = false })
    }
    preference()
    const client = getSupabaseClient()
    const refreshFriends = () => window.dispatchEvent(new Event(FRIENDSHIPS_CHANGED))
    const channel = client.channel('presence-preferences:' + userId + ':' + crypto.randomUUID())
    for (const event of ['INSERT', 'UPDATE'] as const) {
      channel.on('postgres_changes', { event, schema: 'public', table: 'presence_preference_updates' }, refreshFriends)
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') refreshFriends() })
    const timer = window.setInterval(record, 30_000)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pointerdown', activity)
    window.addEventListener('keydown', activity)
    window.addEventListener('scroll', activity, { passive: true })
    window.addEventListener(PROFILE_CHANGED, preference)
    return () => {
      active = false
      void client.removeChannel(channel)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('keydown', activity)
      window.removeEventListener('scroll', activity)
      window.removeEventListener(PROFILE_CHANGED, preference)
    }
  }, [userId])
}
