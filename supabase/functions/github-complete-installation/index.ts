import {
  createInstallationAccessToken,
  fetchInstallation,
  GitHubApiError,
  listInstallationRepositories,
  mapRepoToSafe,
} from '../_shared/github-app.ts'
import { assertProjectManager, upsertGithubInstallation } from '../_shared/github-db.ts'
import { verifySignedGithubStateDetailed } from '../_shared/github-state.ts'
import { getMissingRuntimeSecretCode, isMissingEnvError } from '../_shared/env.ts'
import { codedErrorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
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

type CompleteErrorCode =
  | 'missing_installation_id'
  | 'missing_state'
  | 'invalid_state'
  | 'expired_state'
  | 'permission_denied'
  | 'missing_github_secret'
  | 'missing_supabase_secret'
  | 'github_jwt_failed'
  | 'github_installation_token_failed'
  | 'github_list_repositories_failed'
  | 'database_error'
  | 'unknown_error'

const USER_MESSAGES: Record<CompleteErrorCode, string> = {
  missing_installation_id: 'Não foi possível carregar os repositórios autorizados.',
  missing_state: 'Não foi possível carregar os repositórios autorizados.',
  invalid_state: 'Não foi possível carregar os repositórios autorizados.',
  expired_state: 'Não foi possível carregar os repositórios autorizados.',
  permission_denied: 'Você não tem permissão para conectar repositórios neste projeto.',
  missing_github_secret: 'Não foi possível carregar os repositórios autorizados.',
  missing_supabase_secret: 'Não foi possível carregar os repositórios autorizados.',
  github_jwt_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_installation_token_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_list_repositories_failed: 'Não foi possível carregar os repositórios autorizados.',
  database_error: 'Não foi possível carregar os repositórios autorizados.',
  unknown_error: 'Não foi possível carregar os repositórios autorizados.',
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

function normalizeSetupAction(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  const action = value.trim().toLowerCase()
  if (action === 'install' || action === 'update') return action
  return value.trim()
}

function fail(code: CompleteErrorCode, status: number, detail?: string): Response {
  if (detail) {
    console.error('[github-complete-installation]', { code, detail })
  } else {
    console.error('[github-complete-installation]', { code })
  }
  return codedErrorResponse(USER_MESSAGES[code], code, status)
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return codedErrorResponse('Método não permitido.', 'unknown_error', 405)
  }

  const missingSecret = getMissingRuntimeSecretCode()
  if (missingSecret) {
    return fail(missingSecret, 500)
  }

  const user = await getUserFromRequest(req)
  if (!user) {
    return codedErrorResponse('Autenticação obrigatória.', 'permission_denied', 401)
  }

  let body: CompleteInstallationBody
  try {
    body = (await req.json()) as CompleteInstallationBody
  } catch {
    return fail('unknown_error', 400, 'JSON inválido')
  }

  const installationId = parseInstallationId(body.installation_id)
  const stateRaw = body.state?.trim()
  const setupAction = normalizeSetupAction(body.setup_action)

  if (!installationId) {
    return fail('missing_installation_id', 400)
  }

  if (!stateRaw) {
    return fail('missing_state', 400, `setup_action=${setupAction ?? 'null'}`)
  }

  let statePayload
  try {
    const stateResult = await verifySignedGithubStateDetailed(stateRaw)
    if (!stateResult.ok) {
      return fail(stateResult.code, 400)
    }
    statePayload = stateResult.payload
  } catch (error) {
    if (isMissingEnvError(error)) {
      const code = getMissingRuntimeSecretCode() ?? 'missing_github_secret'
      return fail(code, 500, error.message)
    }
    return fail('invalid_state', 400, error instanceof Error ? error.message : 'state verify failed')
  }

  if (statePayload.user_id !== user.id) {
    return fail('permission_denied', 403, 'state user mismatch')
  }

  const projectId = statePayload.project_id

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    if (isMissingEnvError(error)) {
      return fail('missing_supabase_secret', 500, error.message)
    }
    return fail('unknown_error', 500)
  }

  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
  if (!canManage) {
    return fail('permission_denied', 403)
  }

  try {
    let installationMeta
    try {
      installationMeta = await fetchInstallation(installationId)
    } catch (error) {
      if (isMissingEnvError(error)) {
        const code = getMissingRuntimeSecretCode() ?? 'missing_github_secret'
        return fail(code, 500, error.message)
      }
      if (error instanceof GitHubApiError) {
        return fail('github_jwt_failed', error.status >= 400 ? error.status : 502, error.message)
      }
      return fail('github_jwt_failed', 502, error instanceof Error ? error.message : undefined)
    }

    if (installationMeta.installation_id !== installationId) {
      return fail('github_installation_token_failed', 400, 'installation id mismatch')
    }

    try {
      await upsertGithubInstallation(admin, installationMeta, user.id)
    } catch (error) {
      return fail(
        'database_error',
        500,
        error instanceof Error ? error.message : 'upsert installation failed',
      )
    }

    let accessToken: string
    try {
      accessToken = await createInstallationAccessToken(installationId)
    } catch (error) {
      if (isMissingEnvError(error)) {
        const code = getMissingRuntimeSecretCode() ?? 'missing_github_secret'
        return fail(code, 500, error.message)
      }
      if (error instanceof GitHubApiError) {
        return fail(
          'github_installation_token_failed',
          error.status >= 400 ? error.status : 502,
          error.message,
        )
      }
      return fail(
        'github_installation_token_failed',
        502,
        error instanceof Error ? error.message : undefined,
      )
    }

    let repositories
    try {
      repositories = (await listInstallationRepositories(accessToken)).map(mapRepoToSafe)
    } catch (error) {
      if (error instanceof GitHubApiError) {
        return fail(
          'github_list_repositories_failed',
          error.status >= 400 ? error.status : 502,
          error.message,
        )
      }
      return fail(
        'github_list_repositories_failed',
        502,
        error instanceof Error ? error.message : undefined,
      )
    }

    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('slug')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError) {
      return fail('database_error', 500, projectError.message)
    }

    console.info('[github-complete-installation] success', {
      project_id: projectId,
      installation_id: installationId,
      setup_action: setupAction,
      repository_count: repositories.length,
    })

    return jsonResponse({
      project_id: projectId,
      project_slug: typeof project?.slug === 'string' ? project.slug : null,
      installation_id: installationId,
      setup_action: setupAction,
      repositories,
    })
  } catch (error) {
    if (isMissingEnvError(error)) {
      const code = getMissingRuntimeSecretCode() ?? 'unknown_error'
      return fail(code, 500, error.message)
    }
    return fail(
      'unknown_error',
      500,
      error instanceof Error ? error.message : 'unexpected error',
    )
  }
})
