import { createSignedGithubState } from '../_shared/github-state.ts'
import { assertProjectManager } from '../_shared/github-db.ts'
import { requireEnv } from '../_shared/env.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

interface StartInstallationBody {
  project_id?: string
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido.', 405)
  }

  const user = await getUserFromRequest(req)
  if (!user) {
    return errorResponse('Autenticação obrigatória.', 401)
  }

  let body: StartInstallationBody
  try {
    body = (await req.json()) as StartInstallationBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectId = body.project_id?.trim()
  if (!projectId) {
    return errorResponse('project_id é obrigatório.', 400)
  }

  const admin = createAdminClient()
  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
  if (!canManage) {
    return errorResponse('Você não tem permissão para conectar repositórios neste projeto.', 403)
  }

  try {
    const appSlug = requireEnv('GITHUB_APP_SLUG')
    const state = await createSignedGithubState({
      project_id: projectId,
      user_id: user.id,
    })
    const installUrl = `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new?state=${encodeURIComponent(state)}`

    return jsonResponse({ install_url: installUrl })
  } catch {
    return errorResponse('Não foi possível iniciar a conexão com o GitHub.', 500)
  }
})
