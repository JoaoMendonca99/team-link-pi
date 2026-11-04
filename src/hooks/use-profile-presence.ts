'use client'

import { useEffect } from 'react'
import { profileRpc, PROFILE_CHANGED } from '@/lib/profile-social'

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
    const timer = window.setInterval(record, 30_000)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pointerdown', activity)
    window.addEventListener('keydown', activity)
    window.addEventListener('scroll', activity, { passive: true })
    window.addEventListener(PROFILE_CHANGED, preference)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pointerdown', activity)
      window.removeEventListener('keydown', activity)
      window.removeEventListener('scroll', activity)
      window.removeEventListener(PROFILE_CHANGED, preference)
    }
  }, [userId])
}
