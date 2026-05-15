import {
  createGitHubAppJwt,
  createInstallationAccessToken,
  fetchInstallation,
  GitHubApiError,
  GitHubPrivateKeyError,
  listInstallationRepositories,
  mapRepoToPublic,
  type GitHubInstallationMeta,
} from '../_shared/github-app.ts'
import { assertProjectManager, upsertGithubInstallation } from '../_shared/github-db.ts'
import { verifySignedGithubStateDetailed } from '../_shared/github-state.ts'
import { getMissingRuntimeSecretCode, isMissingEnvError } from '../_shared/env.ts'
import { handleCors, jsonResponse, standardFailResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

interface CompleteInstallationBody {
  project_id?: string
  installation_id?: number | string
  setup_action?: string | null
  state?: string
}

type ErrorCode =
  | 'missing_body'
  | 'missing_project_id'
  | 'missing_installation_id'
  | 'missing_state'
  | 'invalid_state'
  | 'expired_state'
  | 'not_authenticated'
  | 'not_project_manager'
  | 'missing_github_secret'
  | 'missing_supabase_secret'
  | 'github_private_key_invalid'
  | 'github_jwt_failed'
  | 'github_installation_fetch_failed'
  | 'github_installation_token_failed'
  | 'github_repositories_failed'
  | 'database_upsert_failed'
  | 'unexpected_error'

const USER_MESSAGES: Record<ErrorCode, string> = {
  missing_body: 'Não foi possível carregar os repositórios autorizados.',
  missing_project_id: 'Não foi possível carregar os repositórios autorizados.',
  missing_installation_id: 'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
  missing_state: 'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
  invalid_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  expired_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  not_authenticated: 'Autenticação obrigatória.',
  not_project_manager: 'Você não tem permissão para conectar repositórios neste projeto.',
  missing_github_secret: 'Não foi possível carregar os repositórios autorizados.',
  missing_supabase_secret: 'Não foi possível carregar os repositórios autorizados.',
  github_private_key_invalid: 'Não foi possível carregar os repositórios autorizados.',
  github_jwt_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_installation_fetch_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_installation_token_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_repositories_failed: 'Não foi possível carregar os repositórios autorizados.',
  database_upsert_failed: 'Não foi possível carregar os repositórios autorizados.',
  unexpected_error: 'Não foi possível carregar os repositórios autorizados.',
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

function httpStatusForCode(code: ErrorCode, githubStatus?: number): number {
  switch (code) {
    case 'missing_body':
    case 'missing_installation_id':
    case 'missing_state':
    case 'invalid_state':
    case 'expired_state':
      return 400
    case 'not_authenticated':
      return 401
    case 'not_project_manager':
      return 403
    case 'github_installation_fetch_failed':
    case 'github_installation_token_failed':
    case 'github_repositories_failed':
      if (githubStatus && githubStatus >= 400 && githubStatus < 600) {
        return githubStatus === 401 || githubStatus === 403 ? githubStatus : 502
      }
      return 502
    case 'missing_github_secret':
    case 'missing_supabase_secret':
    case 'github_private_key_invalid':
    case 'github_jwt_failed':
    case 'database_upsert_failed':
      return 500
    default:
      return 500
  }
}

function fail(
  code: ErrorCode,
  step: string,
  context: Record<string, unknown> = {},
  githubStatus?: number,
): Response {
  const status = httpStatusForCode(code, githubStatus)
  console.error('[github-complete-installation]', {
    event: 'complete_failed',
    code,
    step,
    status,
    ...context,
  })
  return standardFailResponse({
    code,
    step,
    message: USER_MESSAGES[code],
    status,
  })
}

function mapThrownError(
  error: unknown,
  step: string,
  context: Record<string, unknown> = {},
): Response {
  if (error instanceof GitHubPrivateKeyError) {
    return fail('github_private_key_invalid', step, context)
  }

  if (isMissingEnvError(error)) {
    const message = error instanceof Error ? error.message : ''
    const code: ErrorCode = message.includes('GITHUB_')
      ? 'missing_github_secret'
      : message.includes('SUPABASE_')
        ? 'missing_supabase_secret'
        : getMissingRuntimeSecretCode() ?? 'missing_github_secret'
    return fail(code, step, context)
  }

  if (error instanceof GitHubApiError) {
    let code: ErrorCode = 'unexpected_error'
    if (step === 'github_jwt_created') {
      code = 'github_jwt_failed'
    } else if (step === 'installation_loaded') {
      code = 'github_installation_fetch_failed'
    } else if (step === 'installation_token_created') {
      code = 'github_installation_token_failed'
    } else if (step === 'repositories_loaded') {
      code = 'github_repositories_failed'
    }

    return fail(code, step, { ...context, github_status: error.status }, error.status)
  }

  if (error instanceof Error && error.message.startsWith('database_upsert_failed')) {
    return fail('database_upsert_failed', step, context)
  }

  return fail(
    'unexpected_error',
    step,
    {
      ...context,
      error_name: error instanceof Error ? error.name : 'unknown',
    },
  )
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return standardFailResponse({
      code: 'unexpected_error',
      step: 'complete_started',
      message: 'Método não permitido.',
      status: 405,
    })
  }

  let projectIdForLog: string | null = null
  let userIdForLog: string | null = null
  let installationIdForLog: number | null = null

  try {
    console.info('[github-complete-installation]', { event: 'complete_started' })

    const missingSecret = getMissingRuntimeSecretCode()
    if (missingSecret) {
      return fail(missingSecret, 'complete_started')
    }

    let user
    try {
      user = await getUserFromRequest(req)
    } catch (error) {
      return mapThrownError(error, 'auth_validated')
    }

    if (!user) {
      return fail('not_authenticated', 'auth_validated')
    }

    userIdForLog = user.id
    console.info('[github-complete-installation]', {
      event: 'auth_validated',
      user_id: user.id,
    })

    let body: CompleteInstallationBody
    try {
      body = (await req.json()) as CompleteInstallationBody
    } catch {
      return fail('missing_body', 'parse_body')
    }

    const installationId = parseInstallationId(body.installation_id)
    const stateRaw = body.state?.trim()
    const setupAction = normalizeSetupAction(body.setup_action)
    const bodyProjectId = body.project_id?.trim() || null

    installationIdForLog = installationId

    if (!installationId) {
      return fail('missing_installation_id', 'validate_input', {
        user_id: user.id,
        setup_action: setupAction,
      })
    }

    if (!stateRaw) {
      return fail('missing_state', 'validate_input', {
        user_id: user.id,
        installation_id: installationId,
        setup_action: setupAction,
      })
    }

    let statePayload
    try {
      const stateResult = await verifySignedGithubStateDetailed(stateRaw)
      if (!stateResult.ok) {
        const code =
          stateResult.code === 'expired_state' ? 'expired_state' : 'invalid_state'
        return fail(code, 'state_validated', {
          user_id: user.id,
          installation_id: installationId,
        })
      }
      statePayload = stateResult.payload
    } catch (error) {
      return mapThrownError(error, 'state_validated', {
        user_id: user.id,
        installation_id: installationId,
      })
    }

    const projectId = statePayload.project_id
    projectIdForLog = projectId

    if (bodyProjectId && bodyProjectId !== projectId) {
      return fail('invalid_state', 'state_validated', {
        user_id: user.id,
        installation_id: installationId,
        project_id: projectId,
      })
    }

    if (statePayload.user_id !== user.id) {
      return fail('invalid_state', 'state_validated', {
        user_id: user.id,
        installation_id: installationId,
        project_id: projectId,
      })
    }

    console.info('[github-complete-installation]', {
      event: 'state_validated',
      project_id: projectId,
      user_id: user.id,
      installation_id: installationId,
      setup_action: setupAction,
    })

    let admin
    try {
      admin = createAdminClient()
    } catch (error) {
      return mapThrownError(error, 'permission_validated', {
        project_id: projectId,
        user_id: user.id,
        installation_id: installationId,
      })
    }

    const userClient = createUserClientFromRequest(req)
    const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
    if (!canManage) {
      return fail('not_project_manager', 'permission_validated', {
        project_id: projectId,
        user_id: user.id,
        installation_id: installationId,
      })
    }

    console.info('[github-complete-installation]', {
      event: 'permission_validated',
      project_id: projectId,
      user_id: user.id,
      installation_id: installationId,
    })

    let installationMeta: GitHubInstallationMeta
    try {
      await createGitHubAppJwt()
      console.info('[github-complete-installation]', {
        event: 'github_jwt_created',
        installation_id: installationId,
      })
    } catch (error) {
      return mapThrownError(error, 'github_jwt_created', {
        project_id: projectId,
        user_id: user.id,
        installation_id: installationId,
      })
    }

    try {
      installationMeta = await fetchInstallation(installationId)
      console.info('[github-complete-installation]', {
        event: 'installation_loaded',
        installation_id: installationId,
        account_login: installationMeta.account_login,
      })
    } catch (error) {
      return mapThrownError(error, 'installation_loaded', {
        project_id: projectId,
        user_id: user.id,
        installation_id: installationId,
      })
    }

    if (installationMeta.installation_id !== installationId) {
      return fail('github_installation_fetch_failed', 'installation_loaded', {
        project_id: projectId,
        installation_id: installationId,
      })
    }

    let accessToken: string
    try {
      accessToken = await createInstallationAccessToken(installationId)
      console.info('[github-complete-installation]', {
        event: 'installation_token_created',
        installation_id: installationId,
      })
    } catch (error) {
      return mapThrownError(error, 'installation_token_created', {
        project_id: projectId,
        user_id: user.id,
        installation_id: installationId,
      })
    }

    let repositories
    try {
      repositories = (await listInstallationRepositories(accessToken)).map(mapRepoToPublic)
      console.info('[github-complete-installation]', {
        event: 'repositories_loaded',
        installation_id: installationId,
        count: repositories.length,
      })
    } catch (error) {
      return mapThrownError(error, 'repositories_loaded', {
        project_id: projectId,
        user_id: user.id,
        installation_id: installationId,
      })
    }

    try {
      await upsertGithubInstallation(admin, installationMeta, user.id)
      console.info('[github-complete-installation]', {
        event: 'installation_saved',
        installation_id: installationId,
        project_id: projectId,
      })
    } catch (error) {
      return mapThrownError(error, 'installation_saved', {
        project_id: projectId,
        user_id: user.id,
        installation_id: installationId,
      })
    }

    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('slug')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError) {
      return fail('unexpected_error', 'load_project_slug', {
        project_id: projectId,
        installation_id: installationId,
      })
    }

    console.info('[github-complete-installation]', {
      event: 'complete_success',
      project_id: projectId,
      user_id: user.id,
      installation_id: installationId,
      setup_action: setupAction,
      repository_count: repositories.length,
    })

    return jsonResponse({
      ok: true,
      project_id: projectId,
      project_slug: typeof project?.slug === 'string' ? project.slug : null,
      installation_id: installationId,
      setup_action: setupAction,
      installation: {
        installation_id: installationMeta.installation_id,
        account_login: installationMeta.account_login,
        account_type: installationMeta.account_type,
      },
      repositories,
    })
  } catch (error) {
    return mapThrownError(error, 'unhandled', {
      project_id: projectIdForLog,
      user_id: userIdForLog,
      installation_id: installationIdForLog,
    })
  }
})
