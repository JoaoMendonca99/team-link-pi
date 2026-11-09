'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { FRIENDSHIPS_CHANGED, PROFILE_CHANGED } from '@/lib/profile-social'
import { loadOnboarding, type OnboardingGoal, type OnboardingState } from '@/lib/onboarding'

/** Shared by the Dashboard and the preference control; one aggregate request,
 * existing mutation events, and no additional Realtime subscriptions. */
export function useOnboarding(userId: string) {
  const [snapshot, setSnapshot] = useState<{ user: string; data: OnboardingState }>()
  const [error, setError] = useState(''), [saving, setSaving] = useState(false)
  const request = useRef(0), savingRef = useRef(false)
  const receive = useCallback((data: OnboardingState) => {
    setSnapshot({ user: userId, data }); setError('')
  }, [userId])
  const refresh = useCallback(async () => {
    if (document.hidden || savingRef.current) return
    const sequence = ++request.current
    try { const data = await loadOnboarding(); if (sequence === request.current) receive(data) }
    catch { if (sequence === request.current) setError('Não foi possível atualizar o guia. Tente novamente.') }
  }, [receive])
  useEffect(() => {
    void refresh()
    const reload = () => { void refresh() }, invalidate = () => { request.current += 1 }
    window.addEventListener(PROFILE_CHANGED, reload); window.addEventListener(FRIENDSHIPS_CHANGED, reload)
    window.addEventListener('focus', reload); document.addEventListener('visibilitychange', reload)
    const timer = window.setInterval(reload, 60_000)
    return () => {
      invalidate(); window.clearInterval(timer)
      window.removeEventListener(PROFILE_CHANGED, reload); window.removeEventListener(FRIENDSHIPS_CHANGED, reload)
      window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload)
    }
  }, [refresh])
  async function save(patch: { goal?: OnboardingGoal; hidden?: boolean }) {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true); const sequence = ++request.current
    try { const data = await loadOnboarding(patch); if (sequence === request.current) receive(data) }
    catch { if (sequence === request.current) setError('Não foi possível salvar sua preferência. Tente novamente.') }
    finally { savingRef.current = false; setSaving(false) }
  }
  return { state: snapshot?.user === userId ? snapshot.data : undefined, saving, error, refresh, save }
}
