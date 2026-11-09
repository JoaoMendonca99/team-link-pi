import { getSupabaseClient } from '@/lib/supabase/client'

export type InstitutionSelection = { id: string | null; name: string }
export type Institution = { id: string; codigo_inep: number; nome: string; sigla: string | null; municipio: string | null; uf: string }
export async function searchInstitutions(query: string, signal: AbortSignal): Promise<Institution[]> {
  const { data, error } = await getSupabaseClient().rpc('search_institutions', { p_query: query, p_limit: 12 }).abortSignal(signal)
  if (error) throw error
  return (data ?? []) as Institution[]
}
