import { assertProjectAdmin, requireAuthenticatedUser } from '../_shared/support-auth.ts'
import {
  getIntegrationByProjectId,
  setIntegrationEnabled,
} from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface DisableBody {
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

  let body: DisableBody
  try {
    body = (await req.json()) as DisableBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectId = body.project_id?.trim()
  if (!projectId) {
    return errorResponse('project_id é obrigatório.', 400)
  }

  const admin = createAdminClient()
  const userClient = createUserClientFromRequest(req)
  const isAdmin = await assertProjectAdmin(admin, projectId, auth.user.id, userClient)
  if (!isAdmin) {
    return errorResponse('Sem permissão para desativar o SAC neste projeto.', 403)
  }

  const existing = await getIntegrationByProjectId(admin, projectId)
  if (!existing?.api_key_hash) {
    return errorResponse('Nenhuma integração SAC configurada para este projeto.', 404)
  }

  const updated = await setIntegrationEnabled(admin, projectId, false)
  if (!updated.ok) {
    return errorResponse(updated.message, 500)
  }

  console.info('[support] integration disabled', { project_id: projectId })

  return successResponse({ enabled: false })
})
