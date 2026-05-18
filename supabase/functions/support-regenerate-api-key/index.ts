import { assertProjectAdmin, requireAuthenticatedUser } from '../_shared/support-auth.ts'
import { createNewApiKeyMaterial, saveIntegrationApiKey } from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface RegenerateBody {
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

  let body: RegenerateBody
  try {
    body = (await req.json()) as RegenerateBody
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
    return errorResponse('Sem permissão para regenerar API key neste projeto.', 403)
  }

  const { apiKey, last4 } = createNewApiKeyMaterial()
  const saved = await saveIntegrationApiKey(admin, projectId, apiKey, last4, {
    createIfMissing: true,
  })
  if (!saved.ok) {
    return errorResponse(saved.message, 500)
  }

  console.info('[support] api key regenerated', { project_id: projectId, last4 })

  return successResponse({ api_key: apiKey, last4 })
})
