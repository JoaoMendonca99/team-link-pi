import { readExternalHeaders, validateExternalApiAccess } from '../_shared/support-auth.ts'
import { listExternalUserTickets } from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

interface ListExternalBody {
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
    return errorResponse(access.message, access.status)
  }

  let body: ListExternalBody
  try {
    body = (await req.json()) as ListExternalBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const externalUserId = body.external_user_id?.trim()
  if (!externalUserId) {
    return errorResponse('external_user_id é obrigatório.', 400)
  }

  const tickets = await listExternalUserTickets(
    admin,
    access.integration.project_id,
    externalUserId,
  )

  return successResponse({
    tickets: tickets.map((ticket) => ({
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      title: ticket.title,
      updated_at: ticket.updated_at,
    })),
  })
})
