import {
  createInstallationAccessToken,
  GitHubApiError,
  GitHubPrivateKeyError,
  listInstallationRepositories,
  mapRepoToPublic,
} from '../_shared/github-app.ts'
import { assertProjectManager } from '../_shared/github-db.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

const INSTALLATION_UNAVAILABLE_MESSAGE =
  'Não foi possível acessar esta instalação no GitHub.'

interface ListBody {
  project_id?: string
}

interface InstallationRow {
  installation_id: number
  account_login: string
  account_type: string
  status: string
  updated_at?: string | null
  created_at?: string | null
}

interface ProjectLinkRow {
  id: string
  project_id: string
  github_repository_id: number
  is_active: boolean | null
}

interface AvailableInstallation {
  installation_id: number
  account_login: string
  account_type: string
  status: string
}

interface AvailableRepository {
  installation_id: number
  github_repository_id: number
  owner_login: string
  repo_name: string
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
  linked_to_current_project: boolean
  current_project_repository_id: string | null
  linked_elsewhere: boolean
}

interface InvalidInstallation {
  installation_id: number
  account_login: string
  reason: string
}

function sortInstallations(rows: InstallationRow[]): InstallationRow[] {
  return [...rows].sort((a, b) => {
    const aTime = Date.parse(a.updated_at ?? a.created_at ?? '') || 0
    const bTime = Date.parse(b.updated_at ?? b.created_at ?? '') || 0
    if (bTime !== aTime) return bTime - aTime
    return b.installation_id - a.installation_id
  })
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

  let body: ListBody
  try {
    body = (await req.json()) as ListBody
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

  const { data: installationRows, error: installError } = await admin
    .from('github_installations')
    .select('installation_id, account_login, account_type, status, updated_at, created_at')
    .eq('status', 'active')
    .eq('created_by', user.id)
    .not('account_id', 'is', null)
    .order('updated_at', { ascending: false })

  if (installError) {
    console.error('[github-list-available-repositories] installations query failed', {
      code: installError.code,
    })
    return errorResponse('Não foi possível carregar conexões GitHub.', 500)
  }

  const sortedInstallations = sortInstallations(
    (installationRows ?? []) as InstallationRow[],
  )

  const { data: projectLinks, error: linksError } = await admin
    .from('project_github_repositories')
    .select('id, project_id, github_repository_id, is_active')
    .eq('is_active', true)

  if (linksError) {
    console.error('[github-list-available-repositories] project links query failed', {
      code: linksError.code,
    })
    return errorResponse('Não foi possível carregar vínculos de repositório.', 500)
  }

  const links = (projectLinks ?? []) as ProjectLinkRow[]
  const currentProjectLinks = new Map<number, string>()
  const elsewhereRepoIds = new Set<number>()

  for (const link of links) {
    if (link.is_active === false) continue
    if (link.project_id === projectId) {
      currentProjectLinks.set(link.github_repository_id, link.id)
    } else {
      elsewhereRepoIds.add(link.github_repository_id)
    }
  }

  const validInstallations: AvailableInstallation[] = []
  const invalidInstallations: InvalidInstallation[] = []
  const repositoriesByGithubId = new Map<number, AvailableRepository>()

  for (const inst of sortedInstallations) {
    const installationId = inst.installation_id
    const accountLogin = inst.account_login?.trim() || 'GitHub'

    try {
      const accessToken = await createInstallationAccessToken(installationId)
      const repos = await listInstallationRepositories(accessToken)

      validInstallations.push({
        installation_id: installationId,
        account_login: accountLogin,
        account_type: inst.account_type ?? 'User',
        status: inst.status,
      })

      for (const repo of repos) {
        const publicRepo = mapRepoToPublic(repo)
        const githubId = publicRepo.github_repository_id
        const linkedToCurrent = currentProjectLinks.has(githubId)
        const currentRepoId = linkedToCurrent
          ? (currentProjectLinks.get(githubId) ?? null)
          : null
        const linkedElsewhere =
          !linkedToCurrent && elsewhereRepoIds.has(githubId)

        const candidate: AvailableRepository = {
          installation_id: installationId,
          github_repository_id: githubId,
          owner_login: publicRepo.owner_login,
          repo_name: publicRepo.repo_name,
          full_name: publicRepo.full_name,
          private: publicRepo.private,
          default_branch: publicRepo.default_branch,
          html_url: publicRepo.html_url,
          linked_to_current_project: linkedToCurrent,
          current_project_repository_id: currentRepoId,
          linked_elsewhere: linkedElsewhere,
        }

        const existing = repositoriesByGithubId.get(githubId)
        if (!existing) {
          repositoriesByGithubId.set(githubId, candidate)
          continue
        }

        // Prefer the installation from the newer successful pass (sorted first).
        const existingInstIndex = sortedInstallations.findIndex(
          (row) => row.installation_id === existing.installation_id,
        )
        const candidateInstIndex = sortedInstallations.findIndex(
          (row) => row.installation_id === installationId,
        )
        if (candidateInstIndex < existingInstIndex) {
          repositoriesByGithubId.set(githubId, candidate)
        }
      }
    } catch (error) {
      const reason =
        error instanceof GitHubApiError || error instanceof GitHubPrivateKeyError
          ? INSTALLATION_UNAVAILABLE_MESSAGE
          : INSTALLATION_UNAVAILABLE_MESSAGE

      invalidInstallations.push({
        installation_id: installationId,
        account_login: accountLogin,
        reason,
      })

      console.error('[github-list-available-repositories] installation skipped', {
        installation_id: installationId,
        error_name: error instanceof Error ? error.name : 'unknown',
      })
    }
  }

  const repositories = Array.from(repositoriesByGithubId.values()).sort((a, b) =>
    a.full_name.localeCompare(b.full_name, 'pt-BR', { sensitivity: 'base' }),
  )

  const uniqueValidInstallations = Array.from(
    new Map(validInstallations.map((item) => [item.installation_id, item])).values(),
  )

  return jsonResponse({
    ok: true,
    installations: uniqueValidInstallations,
    repositories,
    invalid_installations: invalidInstallations,
  })
})
