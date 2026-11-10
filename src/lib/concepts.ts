export type ConceptChoice = { id: string | null; label: string; raw?: string; domain?: string; status?: string; proposal?: boolean; pending?: string }
export type ConceptHit = { id: string; nome: string; dominio: string; status: string; descricao: string | null; alias: string; confirmacao: boolean }
export type ProjectConcepts = { tags: ConceptChoice[]; vacancies: { id: string; concepts: ConceptChoice[] }[] }
export const conceptDomains = ['Tecnologia','Engenharia','Educação','Saúde','Administração','Comunicação','Ciências','Artes','Design','Negócios','Meio ambiente','Geral'] as const
export const legacyConcepts = (labels: string[]): ConceptChoice[] => labels.map(label => ({ id: null, label, raw: label, status: 'pendente' }))
export const conceptLabels = (choices: ConceptChoice[]) => choices.map(choice => choice.label)
export async function searchConcepts(query: string, signal: AbortSignal): Promise<ConceptHit[]> {
  const { getSupabaseClient } = await import('@/lib/supabase/client')
  const { data, error } = await getSupabaseClient().rpc('search_concepts', { p_query: query, p_limit: 12 }).abortSignal(signal)
  if (error) throw error
  return data ?? []
}
/** Drafts are untrusted: restore only presentation/selection fields; SQL validates every UUID again. */
export function restoreConcepts(value: unknown, labels: string[], limit: number): ConceptChoice[] {
  if (!Array.isArray(value)) return legacyConcepts(labels)
  const choices: ConceptChoice[] = []
  for (const raw of value.slice(0,limit)) {
    if (!raw || typeof raw !== 'object' || typeof raw.label !== 'string' || !raw.label.trim() || raw.label.length>120) continue
    choices.push({ id: typeof raw.id === 'string' && /^[0-9a-f-]{36}$/i.test(raw.id) ? raw.id : null, label: raw.label,
      proposal: raw.proposal === true, domain: conceptDomains.includes(raw.domain) ? raw.domain : 'Geral', status: raw.id ? raw.status : 'provisorio' })
  }
  return choices
}
