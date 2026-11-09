import { getSupabaseClient } from '@/lib/supabase/client'

export type OnboardingGoal = 'create' | 'participate'
export type OnboardingState = {
  goal: OnboardingGoal; hidden: boolean; completed_at: string | null; first_completion: boolean
  missions: Record<'biography' | 'skills' | 'interests' | 'create' | 'participate' | 'photo' | 'connection', boolean>
}
export function essentialProgress(state: OnboardingState) {
  const m = state.missions
  return [m.biography, m.skills, m.interests, m[state.goal]].filter(Boolean).length
}
export async function loadOnboarding(patch?: { goal?: OnboardingGoal; hidden?: boolean; seen?: boolean }): Promise<OnboardingState> {
  const { data, error } = patch
    ? await getSupabaseClient().rpc('set_my_onboarding', { p_goal: patch.goal ?? null, p_hidden: patch.hidden ?? null, p_seen: patch.seen ?? null })
    : await getSupabaseClient().rpc('get_my_onboarding')
  if (error || !data) throw new Error('Não foi possível carregar seus primeiros passos.')
  return data as OnboardingState
}
