'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'

const ProjectViewer = createContext<{ userId: string | null; token: string | null; loading: boolean }>({
  userId: null, token: null, loading: true,
})

export function ProjectViewerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>()
  useEffect(() => {
    if (!isSupabaseConfigured()) { setSession(null); return }
    const { data } = getSupabaseClient().auth.onAuthStateChange((_event, current) => setSession(current))
    return () => data.subscription.unsubscribe()
  }, [])
  return <ProjectViewer.Provider value={{ userId: session?.user.id ?? null, token: session?.access_token ?? null, loading: session === undefined }}>
    {children}
  </ProjectViewer.Provider>
}

export const useProjectViewer = () => useContext(ProjectViewer)
