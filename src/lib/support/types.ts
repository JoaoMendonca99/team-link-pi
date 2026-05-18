export type SupportIntegrationInfo = {
  configured: boolean
  enabled: boolean
  last4: string | null
  updated_at: string | null
}

export function isSupportSacActive(
  integration: SupportIntegrationInfo | null | undefined,
): boolean {
  return Boolean(integration?.configured && integration.enabled)
}

export type SupportProjectTicketStats = {
  waiting_support: number
  in_progress: number
  resolved_today: number
  total_open: number
}

export type SupportTicketFilter =
  | 'all'
  | 'waiting_support'
  | 'in_progress'
  | 'resolved'
  | 'closed'

export type SupportTicketStatus =
  | 'waiting_support'
  | 'in_progress'
  | 'resolved'
  | 'closed'

export type SupportTicketListItem = {
  ticket_id: string
  ticket_number: number
  status: SupportTicketStatus
  title: string
  external_user_name: string | null
  priority: string | null
  updated_at: string
  last_message: {
    message: string
    sender_role: string
    created_at: string
  } | null
}

export type SupportTicketDetail = {
  ticket: {
    id: string
    project_id: string
    ticket_number: number
    status: SupportTicketStatus
    title: string
    external_user_id: string
    external_user_email: string | null
    external_user_name: string | null
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
  }
  messages: Array<{
    id: string
    sender_role: string
    message: string
    sender_user_id: string | null
    created_at: string
  }>
  message_count: number
}
