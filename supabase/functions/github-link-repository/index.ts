import {
  createInstallationAccessToken,
  fetchInstallation,
  fetchRecentCommits,
  fetchRepository,
  GitHubApiError,
  normalizeApiCommits,
} from '../_shared/github-app.ts'
import {
  assertProjectManager,
  insertSyncLog,
  touchRepositorySync,
  upsertGithubInstallation,
  upsertProjectCommits,
  upsertProjectRepository,
  type CommitVisibility,
} from '../_shared/github-db.ts'
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

  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
  if (!canManage) {
    return errorResponse('Sem permissão para vincular repositório neste projeto.', 403)
  }

  try {
    const installationMeta = await fetchInstallation(installationId)
    const accessToken = await createInstallationAccessToken(installationId)
    const repository = await fetchRepository(accessToken, ownerLogin, repoName)

    if (repository.owner.login.toLowerCase() !== ownerLogin.toLowerCase()) {
      return errorResponse('O repositório informado não corresponde ao owner.', 400)
    }
    if (repository.name.toLowerCase() !== repoName.toLowerCase()) {
      return errorResponse('O repositório informado não corresponde ao nome do repo.', 400)
    }

    await upsertGithubInstallation(admin, installationMeta, user.id)

    const linkedRepository = await upsertProjectRepository(admin, {
      project_id: projectId,
      installation_id: installationId,
      github_repository_id: repository.id,
      owner_login: repository.owner.login,
      repo_name: repository.name,
      full_name: repository.full_name,
      default_branch: repository.default_branch,
      private: repository.private,
      html_url: repository.html_url,
      commit_visibility: commitVisibility,
      linked_by: user.id,
      metadata: {
        linked_via: 'github-link-repository',
      },
    })

    const branch = repository.default_branch || 'main'
    const commits = normalizeApiCommits(
      await fetchRecentCommits(accessToken, ownerLogin, repoName, branch, 30),
    )
    const imported = await upsertProjectCommits(
      admin,
      {
        project_repository_id: linkedRepository.id,
        project_id: projectId,
        github_repository_id: repository.id,
        branch,
      },
      commits,
    )
    await touchRepositorySync(admin, linkedRepository.id)

    await insertSyncLog(admin, {
      project_id: projectId,
      project_repository_id: linkedRepository.id,
      action: 'link',
      status: 'success',
      message: 'Repositório vinculado com sucesso.',
      commits_synced: imported,
    })

    return jsonResponse({
      repository_id: linkedRepository.id,
      full_name: linkedRepository.full_name,
      private: linkedRepository.private,
      default_branch: linkedRepository.default_branch,
      total_commits_imported: imported,
    })
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
