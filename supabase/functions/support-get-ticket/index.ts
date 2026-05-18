import { assertSupportCanAccess, requireAuthenticatedUser } from '../_shared/support-auth.ts'
import { getTicketById, listTicketMessages, mapTicketDetail } from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface GetTicketBody {
  ticket_id?: string
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

  let body: GetTicketBody
  try {
    body = (await req.json()) as GetTicketBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const ticketId = body.ticket_id?.trim()
  if (!ticketId) {
    return errorResponse('ticket_id é obrigatório.', 400)
  }

  const admin = createAdminClient()
  const ticket = await getTicketById(admin, ticketId)
  if (!ticket) {
    return errorResponse('Ticket não encontrado.', 404)
  }

  const userClient = createUserClientFromRequest(req)
  const canAccess = await assertSupportCanAccess(
    admin,
    ticket.project_id,
    auth.user.id,
    userClient,
  )
  if (!canAccess) {
    return errorResponse('Sem permissão para visualizar este ticket.', 403)
  }

  const messages = await listTicketMessages(admin, ticket.id)

  return successResponse(mapTicketDetail(ticket, messages))
})
