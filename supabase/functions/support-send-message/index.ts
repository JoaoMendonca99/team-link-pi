import {
  assertSupportCanAccess,
  readExternalHeaders,
  requireAuthenticatedUser,
  validateExternalApiAccess,
} from '../_shared/support-auth.ts'
import {
  getTicketById,
  getTicketForProject,
  insertTicketMessage,
} from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface SendMessageBody {
  ticket_id?: string
  message?: string
}

Deno.serve(async (req) => {
  const cors = handleSupportCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido.', 405)
  }

  let body: SendMessageBody
  try {
    body = (await req.json()) as SendMessageBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const ticketId = body.ticket_id?.trim()
  const message = body.message?.trim()
  if (!ticketId) {
    return errorResponse('ticket_id é obrigatório.', 400)
  }
  if (!message) {
    return errorResponse('message é obrigatório.', 400)
  }

  const admin = createAdminClient()
  const { projectId, apiKey } = readExternalHeaders(req)

  if (projectId || apiKey) {
    const access = await validateExternalApiAccess(
      admin,
      projectId ?? '',
      apiKey ?? '',
    )
    if (!access.ok) {
      return errorResponse(access.message, access.status)
    }

    const ticket = await getTicketForProject(admin, ticketId, access.integration.project_id)
    if (!ticket) {
      return errorResponse('Ticket não encontrado neste projeto.', 404)
    }

    const inserted = await insertTicketMessage(admin, {
      ticket_id: ticket.id,
      project_id: ticket.project_id,
      sender_role: 'user',
      message,
      sender_user_id: null,
    })

    if (!inserted.ok) {
      return errorResponse(inserted.message, 500)
    }

    const refreshed = await getTicketById(admin, ticket.id)

    return successResponse({
      message_id: inserted.message.id,
      ticket_id: ticket.id,
      status: refreshed?.status ?? ticket.status,
    })
  }

  const auth = await requireAuthenticatedUser(req)
  if (!auth.ok) {
    return errorResponse(auth.message, auth.status)
  }

  const ticketRow = await getTicketById(admin, ticketId)
  if (!ticketRow) {
    return errorResponse('Ticket não encontrado.', 404)
  }

  const userClient = createUserClientFromRequest(req)
  const canAccess = await assertSupportCanAccess(
    admin,
    ticketRow.project_id,
    auth.user.id,
    userClient,
  )
  if (!canAccess) {
    return errorResponse('Sem permissão para responder neste ticket.', 403)
  }

  const inserted = await insertTicketMessage(admin, {
    ticket_id: ticketRow.id,
    project_id: ticketRow.project_id,
    sender_role: 'support',
    message,
    sender_user_id: auth.user.id,
  })

  if (!inserted.ok) {
    return errorResponse(inserted.message, 500)
  }

  const refreshed = await getTicketById(admin, ticketRow.id)

  return successResponse({
    message_id: inserted.message.id,
    ticket_id: ticketRow.id,
    status: refreshed?.status ?? ticketRow.status,
  })
})
