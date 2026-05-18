import { getSupabaseClient } from '@/lib/supabase/client'

import type { SupportTicketDetail, SupportTicketListItem, SupportTicketStatus } from './types'

function readFunctionError(payload: Record<string, unknown> | null): string | null {
  if (typeof payload?.message === 'string') return payload.message
  if (typeof payload?.error === 'string') return payload.error
  return null
}

function friendly(message: string | undefined, fallback: string): string {
  const trimmed = message?.trim()
  return trimmed || fallback
}

export async function generateSupportApiKey(
  projectId: string,
): Promise<{ ok: true; api_key: string; last4: string } | { ok: false; message: string }> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('support-generate-api-key', {
    body: { project_id: projectId },
  })
  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (error && fnError) return { ok: false, message: friendly(fnError, 'Não foi possível gerar a API key.') }
  if (error) return { ok: false, message: friendly(error.message, 'Não foi possível gerar a API key.') }
  if (fnError || payload?.ok === false) {
    return { ok: false, message: friendly(fnError ?? undefined, 'Não foi possível gerar a API key.') }
  }
  const apiKey = typeof payload?.api_key === 'string' ? payload.api_key : null
  if (!apiKey) return { ok: false, message: 'Resposta inválida ao gerar API key.' }
  return {
    ok: true,
    api_key: apiKey,
    last4: typeof payload?.last4 === 'string' ? payload.last4 : apiKey.slice(-4),
  }
}

export async function listProjectSupportTickets(input: {
  project_id: string
  status?: SupportTicketStatus
  priority?: string
  search?: string
  page?: number
  limit?: number
}): Promise<
  | { ok: true; tickets: SupportTicketListItem[]; total: number; page: number; limit: number }
  | { ok: false; message: string }
> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('support-list-project-tickets', {
    body: input,
  })
  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (payload?.ok === false || (error && fnError)) {
    return { ok: false, message: friendly(fnError ?? undefined, 'Não foi possível listar tickets.') }
  }
  if (error) {
    return { ok: false, message: friendly(error.message, 'Não foi possível listar tickets.') }
  }
  const tickets = Array.isArray(payload?.tickets) ? (payload.tickets as SupportTicketListItem[]) : []
  return {
    ok: true,
    tickets,
    total: typeof payload?.total === 'number' ? payload.total : tickets.length,
    page: typeof payload?.page === 'number' ? payload.page : 1,
    limit: typeof payload?.limit === 'number' ? payload.limit : 20,
  }
}

export async function getProjectSupportTicket(
  ticketId: string,
): Promise<{ ok: true; data: SupportTicketDetail } | { ok: false; message: string }> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('support-get-ticket', {
    body: { ticket_id: ticketId },
  })
  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (payload?.ok === false || (error && fnError)) {
    return { ok: false, message: friendly(fnError ?? undefined, 'Não foi possível abrir o ticket.') }
  }
  if (error) {
    return { ok: false, message: friendly(error.message, 'Não foi possível abrir o ticket.') }
  }
  if (!payload?.ticket || !Array.isArray(payload.messages)) {
    return { ok: false, message: 'Resposta inválida ao carregar o ticket.' }
  }
  return {
    ok: true,
    data: {
      ticket: payload.ticket as SupportTicketDetail['ticket'],
      messages: payload.messages as SupportTicketDetail['messages'],
      message_count:
        typeof payload.message_count === 'number'
          ? payload.message_count
          : (payload.messages as unknown[]).length,
    },
  }
}

export async function updateSupportTicketStatus(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<{ ok: true; status: SupportTicketStatus } | { ok: false; message: string }> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('support-update-status', {
    body: { ticket_id: ticketId, status },
  })
  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (payload?.ok === false || (error && fnError)) {
    return { ok: false, message: friendly(fnError ?? undefined, 'Não foi possível atualizar o status.') }
  }
  if (error) {
    return { ok: false, message: friendly(error.message, 'Não foi possível atualizar o status.') }
  }
  const nextStatus = payload?.status
  if (nextStatus !== 'waiting_support' && nextStatus !== 'in_progress' && nextStatus !== 'resolved' && nextStatus !== 'closed') {
    return { ok: false, message: 'Resposta inválida ao atualizar status.' }
  }
  return { ok: true, status: nextStatus }
}

export async function sendSupportReply(
  ticketId: string,
  message: string,
): Promise<{ ok: true; status: SupportTicketStatus } | { ok: false; message: string }> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('support-send-message', {
    body: { ticket_id: ticketId, message },
  })
  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (payload?.ok === false || (error && fnError)) {
    return { ok: false, message: friendly(fnError ?? undefined, 'Não foi possível enviar a resposta.') }
  }
  if (error) {
    return { ok: false, message: friendly(error.message, 'Não foi possível enviar a resposta.') }
  }
  const status = payload?.status
  if (
    status !== 'waiting_support' &&
    status !== 'in_progress' &&
    status !== 'resolved' &&
    status !== 'closed'
  ) {
    return { ok: true, status: 'in_progress' }
  }
  return { ok: true, status }
}
