import { assertSupportCanAccess, requireAuthenticatedUser } from '../_shared/support-auth.ts'
import {
  getLatestMessagesByTicketIds,
  listProjectTickets,
  mapTicketListItem,
} from '../_shared/support-db.ts'
import { parseTicketStatus } from '../_shared/support-schema.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface ListTicketsBody {
  project_id?: string
  status?: string
  priority?: string
  search?: string
  page?: number
  limit?: number
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

  let body: ListTicketsBody
  try {
    body = (await req.json()) as ListTicketsBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectId = body.project_id?.trim()
  if (!projectId) {
    return errorResponse('project_id é obrigatório.', 400)
  }

  const statusFilter = body.status ? parseTicketStatus(body.status) : null
  if (body.status && !statusFilter) {
    return errorResponse('status inválido.', 400)
  }

  const admin = createAdminClient()
  const userClient = createUserClientFromRequest(req)
  const canAccess = await assertSupportCanAccess(admin, projectId, auth.user.id, userClient)
  if (!canAccess) {
    return errorResponse('Sem permissão para listar tickets deste projeto.', 403)
  }

  const page = typeof body.page === 'number' ? body.page : Number(body.page ?? 1)
  const limit = typeof body.limit === 'number' ? body.limit : Number(body.limit ?? 20)

  const { tickets, total } = await listProjectTickets(admin, {
    project_id: projectId,
    status: statusFilter,
    priority: body.priority?.trim() || null,
    search: body.search?.trim() || null,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 20,
  })

  const lastMessages = await getLatestMessagesByTicketIds(
    admin,
    tickets.map((ticket) => ticket.id),
  )

  return successResponse({
    tickets: tickets.map((ticket) =>
      mapTicketListItem(ticket, lastMessages.get(ticket.id) ?? null),
    ),
    page: Number.isFinite(page) && page > 0 ? page : 1,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(100, limit) : 20,
    total,
  })
})
