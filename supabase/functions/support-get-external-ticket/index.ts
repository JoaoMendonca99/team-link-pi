import { readExternalHeaders, validateExternalApiAccess } from '../_shared/support-auth.ts'
import {
  getTicketById,
  listTicketMessages,
  mapExternalTicketDetail,
} from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

interface GetExternalTicketBody {
  ticket_id?: string
  external_user_id?: string
}

Deno.serve(async (req) => {
  const cors = handleSupportCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido.', 405)
  }

  const { projectId, apiKey } = readExternalHeaders(req)
  const admin = createAdminClient()
  const access = await validateExternalApiAccess(admin, projectId ?? '', apiKey ?? '')
  if (!access.ok) {
    console.warn('[support-get-external-ticket] access denied', {
      project_id: projectId ?? null,
      status: access.status,
    })
    return errorResponse(access.message, access.status)
  }

  let body: GetExternalTicketBody
  try {
    body = (await req.json()) as GetExternalTicketBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const ticketId = body.ticket_id?.trim()
  const externalUserId = body.external_user_id?.trim()

  if (!ticketId) {
    return errorResponse('ticket_id é obrigatório.', 400)
  }
  if (!externalUserId) {
    return errorResponse('external_user_id é obrigatório.', 400)
  }

  const ticket = await getTicketById(admin, ticketId)
  if (!ticket) {
    console.info('[support-get-external-ticket] ticket not found', { ticket_id: ticketId })
    return errorResponse('Ticket não encontrado.', 404)
  }

  if (ticket.project_id !== access.integration.project_id) {
    console.warn('[support-get-external-ticket] project mismatch', {
      ticket_id: ticketId,
      expected_project_id: access.integration.project_id,
    })
    return errorResponse('Ticket não encontrado neste projeto.', 404)
  }

  if (ticket.external_user_id !== externalUserId) {
    console.warn('[support-get-external-ticket] external user mismatch', {
      ticket_id: ticketId,
      external_user_id: externalUserId,
    })
    return errorResponse('Sem permissão para acessar este ticket.', 403)
  }

  const messages = await listTicketMessages(admin, ticket.id)

  console.info('[support-get-external-ticket] ok', {
    project_id: access.integration.project_id,
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    external_user_id: externalUserId,
    message_count: messages.length,
  })

  return successResponse(mapExternalTicketDetail(ticket, messages))
})
