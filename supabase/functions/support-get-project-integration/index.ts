import {
  assertProjectPanelAccess,
  requireAuthenticatedUser,
} from '../_shared/support-auth.ts'
import { getIntegrationByProjectId } from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface GetIntegrationBody {
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

  let body: GetIntegrationBody
  try {
    body = (await req.json()) as GetIntegrationBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectId = body.project_id?.trim()
  if (!projectId) {
    return errorResponse('project_id é obrigatório.', 400)
  }

  const admin = createAdminClient()
  const userClient = createUserClientFromRequest(req)
  const canAccess = await assertProjectPanelAccess(
    admin,
    projectId,
    auth.user.id,
    userClient,
  )
  if (!canAccess) {
    return errorResponse('Sem permissão para ver a integração deste projeto.', 403)
  }

  const row = await getIntegrationByProjectId(admin, projectId)
  const configured = Boolean(row?.api_key_hash)
  const enabled = configured && row?.enabled === true

  return successResponse({
    configured,
    enabled,
    last4: row?.api_key_last4 ?? null,
    updated_at: row?.updated_at ?? null,
  })
})
