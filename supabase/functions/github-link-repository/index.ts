import {
  createInstallationAccessToken,
  fetchRepository,
  GitHubApiError,
} from '../_shared/github-app.ts'
import { assertProjectManager, insertSyncLog } from '../_shared/github-db.ts'
import { linkProjectRepositoryCore } from '../_shared/github-link-core.ts'
import type { CommitVisibility } from '../_shared/github-db.ts'
import { parseActivitySource } from '../_shared/github-schema.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

interface LinkRepositoryBody {
  project_id?: string
  installation_id?: number
  owner?: string
  repo?: string
  commit_visibility?: string
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

  let body: LinkRepositoryBody
  try {
    body = (await req.json()) as LinkRepositoryBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectId = body.project_id?.trim()
  const installationId = body.installation_id
  const ownerLogin = body.owner?.trim()
  const repoName = body.repo?.trim()

  if (!projectId || !installationId || !ownerLogin || !repoName) {
    return errorResponse('project_id, installation_id, owner e repo são obrigatórios.', 400)
  }

  const commitVisibility: CommitVisibility =
    body.commit_visibility === 'public' ? 'public' : 'members'

  const activitySource = parseActivitySource(body.activity_source)
  if (body.activity_source != null && body.activity_source !== '' && !activitySource) {
    return errorResponse(
      'activity_source inválido. Use commits, releases ou both.',
      400,
    )
  }
  const resolvedActivitySource = activitySource ?? 'commits'

  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
  if (!canManage) {
    return errorResponse('Sem permissão para vincular repositório neste projeto.', 403)
  }

  try {
    const accessToken = await createInstallationAccessToken(installationId)
    const repository = await fetchRepository(accessToken, ownerLogin, repoName)

    if (repository.owner.login.toLowerCase() !== ownerLogin.toLowerCase()) {
      return errorResponse('O repositório informado não corresponde ao owner.', 400)
    }
    if (repository.name.toLowerCase() !== repoName.toLowerCase()) {
      return errorResponse('O repositório informado não corresponde ao nome do repo.', 400)
    }

    const result = await linkProjectRepositoryCore(admin, user.id, {
      project_id: projectId,
      installation_id: installationId,
      repository,
      commit_visibility: commitVisibility,
      activity_source: resolvedActivitySource,
      linked_via: 'github-link-repository',
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
