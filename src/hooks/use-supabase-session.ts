"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Session, User } from "@supabase/supabase-js"

import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import type { ProfileRow } from "@/types/database"

export interface SupabaseSessionState {
  /** True enquanto a sessão inicial e o profile estão sendo carregados. */
  loading: boolean
  /** Usuário autenticado no Supabase Auth (ou null). */
  user: User | null
  /** Sessão Supabase atual (inclui access_token, expires_at, etc.). */
  session: Session | null
  /** Linha de `public.profiles` correspondente ao usuário, carregada após login. */
  profile: ProfileRow | null
  /** Flag derivada: existe um usuário autenticado? */
  isAuthenticated: boolean
  /** Indica se as envs NEXT_PUBLIC_SUPABASE_* estão configuradas. */
  isConfigured: boolean
  /** Faz signOut no Supabase e propaga via onAuthStateChange. */
  signOut: () => Promise<void>
  /** Recarrega a linha de `profiles` (útil após edição de perfil). */
  refreshProfile: () => Promise<void>
}

/**
 * Hook de sessão real apoiada pelo Supabase Auth.
 *
 * - Garante que o client só é instanciado no browser (evita problemas com export estático).
 * - Mantém em memória o usuário autenticado e a linha correspondente em `public.profiles`.
 * - Escuta `onAuthStateChange` para reagir a login/logout em qualquer aba.
 */
export function useSupabaseSession(): SupabaseSessionState {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [isConfigured] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return isSupabaseConfigured()
  })

  const profileRequestRef = useRef(0)

  const loadProfile = useCallback(async (currentUser: User | null) => {
    const requestId = ++profileRequestRef.current

    if (!currentUser) {
      setProfile(null)
      return
    }

    try {
      const client = getSupabaseClient()
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle()

      if (requestId !== profileRequestRef.current) return

      if (error) {
        setProfile(null)
        return
      }

      setProfile((data as ProfileRow | null) ?? null)
    } catch {
      if (requestId === profileRequestRef.current) {
        setProfile(null)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    if (!isSupabaseConfigured()) {
      setLoading(false)
      return
    }

    let active = true
    const client = getSupabaseClient()

    client.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return
        const initialSession = data.session ?? null
        setSession(initialSession)
        setUser(initialSession?.user ?? null)
        await loadProfile(initialSession?.user ?? null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: subscription } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return
        setSession(nextSession)
        setUser(nextSession?.user ?? null)
        void loadProfile(nextSession?.user ?? null)
      },
    )

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured()) return
    const client = getSupabaseClient()
    await client.auth.signOut()
  }, [])

  const refreshProfile = useCallback(async () => {
    await loadProfile(user)
  }, [loadProfile, user])

  return {
    loading,
    user,
    session,
    profile,
    isAuthenticated: Boolean(user),
    isConfigured,
    signOut,
    refreshProfile,
  }
}
