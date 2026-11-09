import { getSupabaseClient } from '@/lib/supabase/client'

export const PROFILE_FIELDS = 'id, full_name, course, university, institution_id, bio, avatar_url, skills, interests, created_at, updated_at'
export const PROFILE_CHANGED = 'team-link-profile-changed'
export const FRIENDSHIPS_CHANGED = 'team-link-friendships-changed'
export const ONLINE_WINDOW = 5 * 60 * 1000

export type Relationship = 'none' | 'sent' | 'received' | 'accepted'
export type FriendshipAction = 'send' | 'cancel' | 'accept' | 'decline' | 'unfriend'
export type SocialSummary = { count: number; relationship: Relationship; last_activity: string | null }
export type Friend = {
  user_id: string; full_name: string | null; avatar_url: string | null; course: string | null
  university: string | null; relationship: Exclude<Relationship, 'none'>; last_activity: string | null
}

export async function profileRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabaseClient().rpc(name, args)
  if (error) throw new Error(error.code === 'P0001' ? error.message : 'Não foi possível concluir a operação.')
  return data as T
}

export function normalizeProfileTags(values: string[]): string[] {
  const unique = new Map<string, string>()
  for (const raw of values) {
    const value = raw.normalize('NFC').trim().replace(/\s+/g, ' ')
    const key = value.toLocaleLowerCase('pt-BR')
    if (value && !unique.has(key)) unique.set(key, value)
  }
  return [...unique.values()]
}
