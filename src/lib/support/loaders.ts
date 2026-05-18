import { getProjectSupportTicketStats } from './actions'
import type { SupportProjectTicketStats } from './types'

export async function loadProjectSupportTicketStats(
  projectId: string,
): Promise<{ ok: true; stats: SupportProjectTicketStats } | { ok: false }> {
  const result = await getProjectSupportTicketStats(projectId)
  if (!result.ok) return { ok: false }
  return { ok: true, stats: result.stats }
}

/** Contagem aguardando suporte — derivada das estatísticas do projeto. */
export async function loadWaitingSupportTicketCount(
  projectId: string,
): Promise<{ ok: true; total: number } | { ok: false }> {
  const result = await loadProjectSupportTicketStats(projectId)
  if (!result.ok) return { ok: false }
  return { ok: true, total: result.stats.waiting_support }
}
