import {
  createInstallationAccessToken,
  fetchInstallation,
  listInstallationRepositories,
  mapRepoToSafe,
  GitHubApiError,
} from '../_shared/github-app.ts'
import { assertProjectManager, upsertGithubInstallation } from '../_shared/github-db.ts'
import { verifySignedGithubState } from '../_shared/github-state.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

interface CompleteInstallationBody {
  installation_id?: number | string
  setup_action?: string | null
  state?: string
}

function parseInstallationId(value: number | string | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
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

  let body: CompleteInstallationBody
  try {
    body = (await req.json()) as CompleteInstallationBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const installationId = parseInstallationId(body.installation_id)
  const stateRaw = body.state?.trim()
  if (!installationId || !stateRaw) {
    return errorResponse('installation_id e state são obrigatórios.', 400)
  }

  const statePayload = await verifySignedGithubState(stateRaw)
  if (!statePayload) {
    return errorResponse('A conexão expirou. Tente novamente.', 400)
  }

  if (statePayload.user_id !== user.id) {
    return errorResponse('A conexão não corresponde à sua conta. Tente novamente.', 403)
  }

  const projectId = statePayload.project_id
  const admin = createAdminClient()
  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
  if (!canManage) {
    return errorResponse('Você não tem permissão para conectar repositórios neste projeto.', 403)
  }

  try {
    const installationMeta = await fetchInstallation(installationId)
    if (installationMeta.installation_id !== installationId) {
      return errorResponse('Não foi possível validar a instalação do GitHub.', 400)
    }

    await upsertGithubInstallation(admin, installationMeta, user.id)

    const accessToken = await createInstallationAccessToken(installationId)
    const repositories = (await listInstallationRepositories(accessToken)).map(mapRepoToSafe)

    const { data: project } = await admin
      .from('projects')
      .select('slug')
      .eq('id', projectId)
      .maybeSingle()

    return jsonResponse({
      project_id: projectId,
      project_slug: typeof project?.slug === 'string' ? project.slug : null,
      installation_id: installationId,
      setup_action: body.setup_action ?? null,
      repositories,
    })
  } catch (error) {
    const message =
      error instanceof GitHubApiError
        ? error.message
        : 'Não foi possível carregar os repositórios autorizados.'

    const status = error instanceof GitHubApiError ? error.status : 500
    return errorResponse(message, status >= 400 && status < 600 ? status : 500)
  }
})
