import {
  assertCanUpdateTicketStatus,
  requireAuthenticatedUser,
} from '../_shared/support-auth.ts'
import { getTicketById, updateTicketStatus } from '../_shared/support-db.ts'
import { parseTicketStatus } from '../_shared/support-schema.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface UpdateStatusBody {
  ticket_id?: string
  status?: string
}

Deno.serve(async (req) => {
  const cors = handleSupportCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido.', 405)
  }

  const auth = await requireAuthenticatedUser(req)
  if (!auth.ok) {
    return errorResponse(auth.message, auth.status)
  }

  let body: UpdateStatusBody
  try {
    body = (await req.json()) as UpdateStatusBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const ticketId = body.ticket_id?.trim()
  const nextStatus = parseTicketStatus(body.status)
  if (!ticketId) {
    return errorResponse('ticket_id é obrigatório.', 400)
  }
  if (!nextStatus) {
    return errorResponse(
      'status inválido. Use waiting_support, in_progress, resolved ou closed.',
      400,
    )
  }

  const admin = createAdminClient()
  const ticket = await getTicketById(admin, ticketId)
  if (!ticket) {
    return errorResponse('Ticket não encontrado.', 404)
  }

  const userClient = createUserClientFromRequest(req)
  const canUpdate = await assertCanUpdateTicketStatus(
    admin,
    ticket.project_id,
    auth.user.id,
    userClient,
  )
  if (!canUpdate) {
    return errorResponse('Sem permissão para alterar o status deste ticket.', 403)
  }

  const updated = await updateTicketStatus(admin, ticket.id, nextStatus)
  if (!updated.ok) {
    return errorResponse(updated.message, 500)
  }

  console.info('[support] status updated', {
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    from: ticket.status,
    to: nextStatus,
  })

  return successResponse({
    ticket_id: updated.ticket.id,
    ticket_number: updated.ticket.ticket_number,
    status: updated.ticket.status,
    closed_at: updated.ticket.closed_at,
  })
})
