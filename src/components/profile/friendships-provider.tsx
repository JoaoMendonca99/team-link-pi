'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { FRIENDSHIPS_CHANGED, profileRpc, type Friend } from '@/lib/profile-social'

type FriendshipsState = { rows?: Friend[]; error: boolean; reload: () => void; auth: { loading: boolean; isAuthenticated: boolean } }
const FriendshipsContext = createContext<FriendshipsState | null>(null)

export function FriendshipsProvider({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated } = useSupabaseSession()
  const userId = user?.id
  const [result, setResult] = useState<{ userId: string; rows?: Friend[]; error: boolean }>()
  const request = useRef(0)
  const reload = useCallback(() => {
    if (!userId || document.hidden) return
    const id = ++request.current
    void profileRpc<Friend[]>('get_my_friendships').then(rows => {
      if (id === request.current) setResult({ userId, rows, error: false })
    }).catch(() => {
      if (id === request.current) setResult({ userId, error: true })
    })
  }, [userId])
  useEffect(() => {
    reload()
    if (!userId) return
    // Reuse the friendship list's existing polling and mutation events, once per session.
    const timer = window.setInterval(reload, 60_000)
    window.addEventListener(FRIENDSHIPS_CHANGED, reload)
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', reload)
    return () => {
      request.current += 1
      window.clearInterval(timer)
      window.removeEventListener(FRIENDSHIPS_CHANGED, reload)
      window.removeEventListener('focus', reload)
      document.removeEventListener('visibilitychange', reload)
    }
  }, [reload, userId])
  const current = result?.userId === userId ? result : undefined
  return <FriendshipsContext.Provider value={{ rows: current?.rows, error: current?.error ?? false, reload, auth: { loading, isAuthenticated } }}>{children}</FriendshipsContext.Provider>
}

export function useFriendships() {
  const value = useContext(FriendshipsContext)
  if (!value) throw new Error('FriendshipsProvider ausente.')
  return value
}

export function usePendingFriendships() {
  return useFriendships().rows?.filter(row => row.relationship === 'received').length ?? 0
}

/** Reuse this provider's session for navigation without another Auth/profile request. */
export function useNavigationSession() {
  return useFriendships().auth
}
