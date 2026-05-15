import {
  createInstallationAccessToken,
  fetchRepositoryById,
  GitHubApiError,
  listInstallationRepositories,
} from '../_shared/github-app.ts'
import { assertProjectManager, insertSyncLog } from '../_shared/github-db.ts'
import { linkProjectRepositoryCore } from '../_shared/github-link-core.ts'
import type { CommitVisibility } from '../_shared/github-db.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

interface LinkSelectedBody {
  project_id?: string
  installation_id?: number
  github_repository_id?: number
  commit_visibility?: string
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

  let body: LinkSelectedBody
  try {
    body = (await req.json()) as LinkSelectedBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectId = body.project_id?.trim()
  const installationId = body.installation_id
  const githubRepositoryId = body.github_repository_id

  if (!projectId || !installationId || !githubRepositoryId) {
    return errorResponse(
      'project_id, installation_id e github_repository_id são obrigatórios.',
      400,
    )
  }

  const commitVisibility: CommitVisibility =
    body.commit_visibility === 'public' ? 'public' : 'members'

  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
  if (!canManage) {
    return errorResponse('Você não tem permissão para vincular repositórios neste projeto.', 403)
  }

  try {
    const accessToken = await createInstallationAccessToken(installationId)
    const repository = await fetchRepositoryById(accessToken, githubRepositoryId)

    const allowed = await listInstallationRepositories(accessToken)
    const isAllowed = allowed.some((repo) => repo.id === repository.id)
    if (!isAllowed) {
      return errorResponse('Esse repositório não está disponível para esta instalação.', 400)
    }

    const result = await linkProjectRepositoryCore(admin, user.id, {
      project_id: projectId,
      installation_id: installationId,
      repository,
      commit_visibility: commitVisibility,
      linked_via: 'github-link-selected-repository',
    })

    return jsonResponse(result)
  } catch (error) {
    const message =
      error instanceof GitHubApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Não foi possível vincular o repositório.'

    await insertSyncLog(admin, {
      project_id: projectId,
      action: 'link',
      status: 'error',
      message,
    }).catch(() => undefined)

    const status = error instanceof GitHubApiError ? error.status : 500
    return errorResponse(message, status >= 400 && status < 600 ? status : 500)
  }
})
