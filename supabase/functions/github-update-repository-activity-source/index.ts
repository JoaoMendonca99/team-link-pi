import { createInstallationAccessToken, GitHubApiError } from '../_shared/github-app.ts'
import {
  assertProjectManager,
  getProjectRepositoryById,
  insertSyncLog,
  touchRepositorySync,
  updateRepositoryActivitySource,
} from '../_shared/github-db.ts'
import { syncRepositoryByActivitySource } from '../_shared/github-sync-core.ts'
import { parseActivitySource } from '../_shared/github-schema.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

interface UpdateActivitySourceBody {
  project_repository_id?: string
  activity_source?: string
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido.', 405)
  }

  const admin = createAdminClient()
  const user = await getUserFromRequest(req)
  if (!user) {
    return errorResponse('Autenticação obrigatória.', 401)
  }

  let body: UpdateActivitySourceBody
  try {
    body = (await req.json()) as UpdateActivitySourceBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectRepositoryId = body.project_repository_id?.trim()
  const activitySource = parseActivitySource(body.activity_source)

  if (!projectRepositoryId) {
    return errorResponse('project_repository_id é obrigatório.', 400)
  }
  if (!activitySource) {
    return errorResponse(
      'activity_source inválido. Use commits, releases ou both.',
      400,
    )
  }

  const repository = await getProjectRepositoryById(admin, projectRepositoryId)
  if (!repository) {
    return errorResponse('Repositório vinculado não encontrado.', 404)
  }

  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(
    admin,
    repository.project_id,
    user.id,
    userClient,
  )
  if (!canManage) {
    return errorResponse('Sem permissão para alterar este repositório.', 403)
  }

  try {
    const updated = await updateRepositoryActivitySource(
      admin,
      repository.id,
      activitySource,
    )

    const accessToken = await createInstallationAccessToken(updated.installation_id)
    const { commits_synced, releases_synced } = await syncRepositoryByActivitySource(
      admin,
      updated,
      accessToken,
      activitySource,
    )

    await touchRepositorySync(admin, updated.id)

    await insertSyncLog(admin, {
      project_id: updated.project_id,
      project_repository_id: updated.id,
      action: 'update_activity_source',
      status: 'success',
      message: 'Acompanhamento atualizado.',
      commits_synced,
      releases_synced,
      metadata: { activity_source: activitySource },
    })

    return jsonResponse({
      activity_source: activitySource,
      commits_synced,
      releases_synced,
    })
  } catch (error) {
    const message =
      error instanceof GitHubApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o acompanhamento.'

    await insertSyncLog(admin, {
      project_id: repository.project_id,
      project_repository_id: repository.id,
      action: 'update_activity_source',
      status: 'error',
      message,
    }).catch(() => undefined)

    const status = error instanceof GitHubApiError ? error.status : 500
    return errorResponse(message, status >= 400 && status < 600 ? status : 500)
  }
})
