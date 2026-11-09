import { getSupabaseClient } from '@/lib/supabase/client'
import type { projectFormPayload } from './form'

export function saveProjectForm(p_form: ReturnType<typeof projectFormPayload>, p_academic: unknown = null) {
  return getSupabaseClient().rpc('save_project_form_with_academics', { p_form, p_academic })
}
export async function checkProjectSlug(slug: string, signal?: AbortSignal) {
  let query = getSupabaseClient().from('projects').select('id').eq('slug', slug).limit(1)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  // Respects RLS. A concurrent or non-visible collision is still rejected by the unique constraint on final creation.
  return !data?.length
}
