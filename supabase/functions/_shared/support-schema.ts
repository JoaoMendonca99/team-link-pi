export const SUPPORT_TICKET_STATUSES = [
  'waiting_support',
  'in_progress',
  'resolved',
  'closed',
] as const

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number]

export const SUPPORT_SENDER_ROLES = ['user', 'support'] as const

export type SupportSenderRole = (typeof SUPPORT_SENDER_ROLES)[number]

export const SUPPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number]

export const SUPPORT_CATEGORIES = [
  'bug',
  'duvida',
  'erro_sistema',
  'solicitacao',
  'melhoria',
  'outro',
] as const

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number]

export function parseTicketStatus(value: unknown): SupportTicketStatus | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim() as SupportTicketStatus
  return SUPPORT_TICKET_STATUSES.includes(normalized) ? normalized : null
}

export function parsePriority(value: unknown): SupportPriority | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase() as SupportPriority
  return SUPPORT_PRIORITIES.includes(normalized) ? normalized : null
}

export function parseCategory(value: unknown): SupportCategory | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase() as SupportCategory
  return SUPPORT_CATEGORIES.includes(normalized) ? normalized : null
}

export function parseSenderRole(value: unknown): SupportSenderRole | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim() as SupportSenderRole
  return SUPPORT_SENDER_ROLES.includes(normalized) ? normalized : null
}

export interface SupportIntegrationRow {
  id: string
  project_id: string
  api_key_hash: string | null
  api_key_last4: string | null
  enabled: boolean
  created_at?: string | null
  updated_at?: string | null
}

export interface SupportTicketRow {
  id: string
  project_id: string
  ticket_number: number
  status: SupportTicketStatus
  external_user_id: string
  external_user_email: string | null
  external_user_name: string | null
  title: string
  category: string | null
  priority: string | null
  app_version: string | null
  app_platform: string | null
  app_module: string | null
  filial: string | null
  external_ticket_ref: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  last_message_at?: string | null
  last_message_preview?: string | null
}

export type SupportDbFailure = {
  ok: false
  message: string
  detail: string
  code: string
}

export interface SupportTicketMessageRow {
  id: string
  ticket_id: string
  project_id: string
  sender_role: SupportSenderRole
  message: string
  sender_user_id: string | null
  created_at: string
}
