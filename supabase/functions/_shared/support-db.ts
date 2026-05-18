import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import { generatePlainApiKey, hashApiKey } from './support-api-key.ts'
import type {
  SupportIntegrationRow,
  SupportTicketMessageRow,
  SupportTicketRow,
  SupportTicketStatus,
} from './support-schema.ts'

const TICKET_SELECT =
  'id, project_id, ticket_number, status, external_user_id, external_user_email, external_user_name, title, category, priority, app_version, app_platform, app_module, filial, external_ticket_ref, closed_at, created_at, updated_at'

const MESSAGE_SELECT =
  'id, ticket_id, project_id, sender_role, message, sender_user_id, created_at'

export async function getIntegrationByProjectId(
  admin: SupabaseClient,
  projectId: string,
): Promise<SupportIntegrationRow | null> {
  const { data, error } = await admin
    .from('project_support_integrations')
    .select('project_id, api_key_hash, api_key_last4, enabled, created_at, updated_at')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error || !data) return null
  return data as SupportIntegrationRow
}

export async function saveIntegrationApiKey(
  admin: SupabaseClient,
  projectId: string,
  apiKey: string,
  last4: string,
  options?: { createIfMissing?: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKeyHash = await hashApiKey(admin, apiKey)
  const now = new Date().toISOString()

  const existing = await getIntegrationByProjectId(admin, projectId)
  if (!existing && options?.createIfMissing === false) {
    return { ok: false, message: 'Integração SAC não encontrada para este projeto.' }
  }

  const { error } = await admin.from('project_support_integrations').upsert(
    {
      project_id: projectId,
      api_key_hash: apiKeyHash,
      api_key_last4: last4,
      enabled: true,
      updated_at: now,
      ...(existing?.created_at ? {} : { created_at: now }),
    },
    { onConflict: 'project_id' },
  )

  if (error) {
    return { ok: false, message: 'Não foi possível salvar a API key.' }
  }

  return { ok: true }
}

export function createNewApiKeyMaterial(): { apiKey: string; last4: string } {
  return generatePlainApiKey()
}

export async function getTicketById(
  admin: SupabaseClient,
  ticketId: string,
): Promise<SupportTicketRow | null> {
  const { data, error } = await admin
    .from('support_tickets')
    .select(TICKET_SELECT)
    .eq('id', ticketId)
    .maybeSingle()

  if (error || !data) return null
  return data as SupportTicketRow
}

export async function getTicketForProject(
  admin: SupabaseClient,
  ticketId: string,
  projectId: string,
): Promise<SupportTicketRow | null> {
  const { data, error } = await admin
    .from('support_tickets')
    .select(TICKET_SELECT)
    .eq('id', ticketId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (error || !data) return null
  return data as SupportTicketRow
}

export interface CreateTicketInput {
  project_id: string
  external_user_id: string
  external_user_email?: string | null
  external_user_name?: string | null
  title: string
  message: string
  category?: string | null
  priority?: string | null
  app_version?: string | null
  app_platform?: string | null
  app_module?: string | null
  filial?: string | null
  external_ticket_ref?: string | null
}

export async function createTicketWithInitialMessage(
  admin: SupabaseClient,
  input: CreateTicketInput,
): Promise<
  | { ok: true; ticket: SupportTicketRow; message: SupportTicketMessageRow }
  | { ok: false; message: string }
> {
  const now = new Date().toISOString()

  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .insert({
      project_id: input.project_id,
      status: 'waiting_support',
      external_user_id: input.external_user_id,
      external_user_email: input.external_user_email ?? null,
      external_user_name: input.external_user_name ?? null,
      title: input.title,
      category: input.category ?? null,
      priority: input.priority ?? null,
      app_version: input.app_version ?? null,
      app_platform: input.app_platform ?? null,
      app_module: input.app_module ?? null,
      filial: input.filial ?? null,
      external_ticket_ref: input.external_ticket_ref ?? null,
      created_at: now,
      updated_at: now,
    })
    .select(TICKET_SELECT)
    .single()

  if (ticketError || !ticket) {
    console.error('[support-db] create ticket failed', { code: ticketError?.code })
    return { ok: false, message: 'Não foi possível criar o ticket.' }
  }

  const messageResult = await insertTicketMessage(admin, {
    ticket_id: ticket.id,
    project_id: input.project_id,
    sender_role: 'user',
    message: input.message,
    sender_user_id: null,
  })

  if (!messageResult.ok) {
    return { ok: false, message: messageResult.message }
  }

  return {
    ok: true,
    ticket: ticket as SupportTicketRow,
    message: messageResult.message,
  }
}

export async function insertTicketMessage(
  admin: SupabaseClient,
  input: {
    ticket_id: string
    project_id: string
    sender_role: 'user' | 'support'
    message: string
    sender_user_id?: string | null
  },
): Promise<
  | { ok: true; message: SupportTicketMessageRow }
  | { ok: false; message: string }
> {
  const now = new Date().toISOString()
  const { data, error } = await admin
    .from('support_ticket_messages')
    .insert({
      ticket_id: input.ticket_id,
      project_id: input.project_id,
      sender_role: input.sender_role,
      message: input.message,
      sender_user_id: input.sender_user_id ?? null,
      created_at: now,
    })
    .select(MESSAGE_SELECT)
    .single()

  if (error || !data) {
    console.error('[support-db] insert message failed', { code: error?.code })
    return { ok: false, message: 'Não foi possível enviar a mensagem.' }
  }

  const ticketPatch: Record<string, unknown> = { updated_at: now }
  if (input.sender_role === 'support') {
    const ticket = await getTicketById(admin, input.ticket_id)
    if (ticket?.status === 'waiting_support') {
      ticketPatch.status = 'in_progress'
    }
  }

  await admin.from('support_tickets').update(ticketPatch).eq('id', input.ticket_id)

  return { ok: true, message: data as SupportTicketMessageRow }
}

export async function listProjectTickets(
  admin: SupabaseClient,
  input: {
    project_id: string
    status?: string | null
    priority?: string | null
    search?: string | null
    page?: number
    limit?: number
  },
): Promise<{ tickets: SupportTicketRow[]; total: number }> {
  const page = Math.max(1, input.page ?? 1)
  const limit = Math.min(100, Math.max(1, input.limit ?? 20))
  const from = (page - 1) * limit
  const to = from + limit - 1

  let query = admin
    .from('support_tickets')
    .select(TICKET_SELECT, { count: 'exact' })
    .eq('project_id', input.project_id)
    .order('updated_at', { ascending: false })

  if (input.status) {
    query = query.eq('status', input.status)
  }
  if (input.priority) {
    query = query.eq('priority', input.priority)
  }
  if (input.search?.trim()) {
    const term = input.search.trim()
    query = query.or(
      `title.ilike.%${escapeIlike(term)}%,external_user_name.ilike.%${escapeIlike(term)}%,external_user_email.ilike.%${escapeIlike(term)}%`,
    )
  }

  const { data, error, count } = await query.range(from, to)

  if (error) {
    console.error('[support-db] list tickets failed', { code: error.code })
    return { tickets: [], total: 0 }
  }

  return {
    tickets: (data ?? []) as SupportTicketRow[],
    total: count ?? 0,
  }
}

function escapeIlike(value: string): string {
  return value.replace(/[%_]/g, '\\$&')
}

export async function getLatestMessagesByTicketIds(
  admin: SupabaseClient,
  ticketIds: string[],
): Promise<Map<string, SupportTicketMessageRow>> {
  const map = new Map<string, SupportTicketMessageRow>()
  if (ticketIds.length === 0) return map

  const { data, error } = await admin
    .from('support_ticket_messages')
    .select(MESSAGE_SELECT)
    .in('ticket_id', ticketIds)
    .order('created_at', { ascending: false })

  if (error || !data) return map

  for (const row of data as SupportTicketMessageRow[]) {
    if (!map.has(row.ticket_id)) {
      map.set(row.ticket_id, row)
    }
  }

  return map
}

export async function listTicketMessages(
  admin: SupabaseClient,
  ticketId: string,
): Promise<SupportTicketMessageRow[]> {
  const { data, error } = await admin
    .from('support_ticket_messages')
    .select(MESSAGE_SELECT)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })

  if (error || !data) return []
  return data as SupportTicketMessageRow[]
}

export async function countTicketMessages(
  admin: SupabaseClient,
  ticketId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('support_ticket_messages')
    .select('id', { count: 'exact', head: true })
    .eq('ticket_id', ticketId)

  if (error) return 0
  return count ?? 0
}

export async function updateTicketStatus(
  admin: SupabaseClient,
  ticketId: string,
  status: SupportTicketStatus,
): Promise<{ ok: true; ticket: SupportTicketRow } | { ok: false; message: string }> {
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = {
    status,
    updated_at: now,
  }
  if (status === 'closed') {
    patch.closed_at = now
  }

  const { data, error } = await admin
    .from('support_tickets')
    .update(patch)
    .eq('id', ticketId)
    .select(TICKET_SELECT)
    .single()

  if (error || !data) {
    return { ok: false, message: 'Não foi possível atualizar o status do ticket.' }
  }

  return { ok: true, ticket: data as SupportTicketRow }
}

export async function listExternalUserTickets(
  admin: SupabaseClient,
  projectId: string,
  externalUserId: string,
): Promise<SupportTicketRow[]> {
  const { data, error } = await admin
    .from('support_tickets')
    .select(TICKET_SELECT)
    .eq('project_id', projectId)
    .eq('external_user_id', externalUserId)
    .order('updated_at', { ascending: false })

  if (error || !data) return []
  return data as SupportTicketRow[]
}

export async function getProjectTicketStats(
  admin: SupabaseClient,
  projectId: string,
): Promise<{
  waiting_support: number
  in_progress: number
  resolved_today: number
  total_open: number
}> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const [waitingRes, inProgressRes, resolvedTodayRes] = await Promise.all([
    admin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'waiting_support'),
    admin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'in_progress'),
    admin
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'resolved')
      .gte('updated_at', todayIso),
  ])

  const waiting_support = waitingRes.count ?? 0
  const in_progress = inProgressRes.count ?? 0
  const resolved_today = resolvedTodayRes.count ?? 0

  return {
    waiting_support,
    in_progress,
    resolved_today,
    total_open: waiting_support + in_progress,
  }
}

export function mapTicketListItem(
  ticket: SupportTicketRow,
  lastMessage: SupportTicketMessageRow | null,
) {
  return {
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    status: ticket.status,
    title: ticket.title,
    external_user_name: ticket.external_user_name,
    priority: ticket.priority,
    updated_at: ticket.updated_at,
    last_message: lastMessage
      ? {
          message: lastMessage.message,
          sender_role: lastMessage.sender_role,
          created_at: lastMessage.created_at,
        }
      : null,
  }
}

export function mapTicketDetail(ticket: SupportTicketRow, messages: SupportTicketMessageRow[]) {
  return {
    ticket: {
      id: ticket.id,
      project_id: ticket.project_id,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      title: ticket.title,
      external_user_id: ticket.external_user_id,
      external_user_email: ticket.external_user_email,
      external_user_name: ticket.external_user_name,
      category: ticket.category,
      priority: ticket.priority,
      app_version: ticket.app_version,
      app_platform: ticket.app_platform,
      app_module: ticket.app_module,
      filial: ticket.filial,
      external_ticket_ref: ticket.external_ticket_ref,
      closed_at: ticket.closed_at,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
    },
    messages: messages.map((message) => ({
      id: message.id,
      sender_role: message.sender_role,
      message: message.message,
      sender_user_id: message.sender_user_id,
      created_at: message.created_at,
    })),
    message_count: messages.length,
  }
}
