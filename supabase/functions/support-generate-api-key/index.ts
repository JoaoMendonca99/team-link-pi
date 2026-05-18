import { assertProjectAdmin, requireAuthenticatedUser } from '../_shared/support-auth.ts'
import {
  createNewApiKeyMaterial,
  getIntegrationByProjectId,
  saveIntegrationApiKey,
} from '../_shared/support-db.ts'
import { errorResponse, handleSupportCors, successResponse } from '../_shared/support-http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
} from '../_shared/supabase-admin.ts'

interface GenerateBody {
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

  let body: GenerateBody
  try {
    body = (await req.json()) as GenerateBody
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
    return errorResponse('Sem permissão para gerar API key neste projeto.', 403)
  }

  const existing = await getIntegrationByProjectId(admin, projectId)
  if (existing?.api_key_hash) {
    return errorResponse(
      'Este projeto já possui API key. Use a regeneração para criar uma nova chave.',
      409,
    )
  }

  const { apiKey, last4 } = createNewApiKeyMaterial()
  const saved = await saveIntegrationApiKey(admin, projectId, apiKey, last4, {
    createIfMissing: true,
  })
  if (!saved.ok) {
    return errorResponse(saved.message, 500)
  }

  console.info('[support] api key generated', { project_id: projectId, last4 })

  return successResponse({ api_key: apiKey, last4 })
})
