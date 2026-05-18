import { assertSupportCanAccess, requireAuthenticatedUser } from '../_shared/support-auth.ts'
import { getProjectTicketStats } from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface StatsBody {
  project_id?: string
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

  let body: StatsBody
  try {
    body = (await req.json()) as StatsBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectId = body.project_id?.trim()
  if (!projectId) {
    return errorResponse('project_id é obrigatório.', 400)
  }

  const admin = createAdminClient()
  const userClient = createUserClientFromRequest(req)
  const canAccess = await assertSupportCanAccess(admin, projectId, auth.user.id, userClient)
  if (!canAccess) {
    return errorResponse('Sem permissão para ver estatísticas deste projeto.', 403)
  }

  const stats = await getProjectTicketStats(admin, projectId)

  return successResponse(stats)
})
