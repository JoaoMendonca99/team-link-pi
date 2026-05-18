import { readExternalHeaders, validateExternalApiAccess } from '../_shared/support-auth.ts'
import { createTicketWithInitialMessage } from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

interface CreateTicketBody {
  external_user_id?: string
  external_user_email?: string | null
  external_user_name?: string | null
  title?: string
  message?: string
  category?: string | null
  priority?: string | null
  app_version?: string | null
  app_platform?: string | null
  app_module?: string | null
  filial?: string | null
  external_ticket_ref?: string | null
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

  let body: CreateTicketBody
  try {
    body = (await req.json()) as CreateTicketBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const externalUserId = body.external_user_id?.trim()
  const title = body.title?.trim()
  const message = body.message?.trim()

  if (!externalUserId) {
    return errorResponse('external_user_id é obrigatório.', 400)
  }
  if (!title) {
    return errorResponse('title é obrigatório.', 400)
  }
  if (!message) {
    return errorResponse('message é obrigatório.', 400)
  }

  const created = await createTicketWithInitialMessage(admin, {
    project_id: access.integration.project_id,
    external_user_id: externalUserId,
    external_user_email: body.external_user_email ?? null,
    external_user_name: body.external_user_name ?? null,
    title,
    message,
    category: body.category ?? null,
    priority: body.priority ?? null,
    app_version: body.app_version ?? null,
    app_platform: body.app_platform ?? null,
    app_module: body.app_module ?? null,
    filial: body.filial ?? null,
    external_ticket_ref: body.external_ticket_ref ?? null,
  })

  if (!created.ok) {
    return errorResponse(created.message, 500)
  }

  console.info('[support] ticket created', {
    project_id: access.integration.project_id,
    ticket_id: created.ticket.id,
    ticket_number: created.ticket.ticket_number,
  })

  return successResponse({
    ticket_id: created.ticket.id,
    ticket_number: created.ticket.ticket_number,
    status: created.ticket.status,
  })
})
