import {
  createInstallationAccessToken,
  fetchRecentCommits,
  GitHubApiError,
  normalizeApiCommits,
} from '../_shared/github-app.ts'
import {
  assertProjectManager,
  getProjectRepositoryById,
  insertSyncLog,
  touchRepositorySync,
  upsertProjectCommits,
} from '../_shared/github-db.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

interface SyncRepositoryBody {
  project_repository_id?: string
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

  let body: SyncRepositoryBody
  try {
    body = (await req.json()) as SyncRepositoryBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectRepositoryId = body.project_repository_id?.trim()
  if (!projectRepositoryId) {
    return errorResponse('project_repository_id é obrigatório.', 400)
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
    return errorResponse('Sem permissão para sincronizar este repositório.', 403)
  }

  try {
    const accessToken = await createInstallationAccessToken(repository.installation_id)
    const branch = repository.default_branch || 'main'
    const commits = normalizeApiCommits(
      await fetchRecentCommits(
        accessToken,
        repository.owner_login,
        repository.repo_name,
        branch,
        30,
      ),
    )
    const commitResult = await upsertProjectCommits(
      admin,
      {
        project_repository_id: repository.id,
        project_id: repository.project_id,
        github_repository_id: repository.github_repository_id,
        branch,
      },
      commits,
    )
    if (!commitResult.ok) {
      const detailMsg =
        commitResult.build_error ??
        commitResult.supabase_error_message ??
        'Falha ao salvar commits.'
      throw new Error(
        `${commitResult.supabase_error_code ?? 'commits'}: ${detailMsg}`,
      )
    }
    const synced = commitResult.count
    await touchRepositorySync(admin, repository.id)

    await insertSyncLog(admin, {
      project_id: repository.project_id,
      project_repository_id: repository.id,
      action: 'sync',
      status: 'success',
      message: 'Sincronização concluída.',
      commits_synced: synced,
    })

    return jsonResponse({ commits_synced: synced })
  } catch (error) {
    const message =
      error instanceof GitHubApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Não foi possível sincronizar o repositório.'

    await insertSyncLog(admin, {
      project_id: repository.project_id,
      project_repository_id: repository.id,
      action: 'sync',
      status: 'error',
      message,
    }).catch(() => undefined)

    const status = error instanceof GitHubApiError ? error.status : 500
    return errorResponse(message, status >= 400 && status < 600 ? status : 500)
  }
})
