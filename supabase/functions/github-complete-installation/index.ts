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
import {
  getMissingRuntimeSecretCode,
  isMissingEnvError,
  validateGitHubPrivateKeyFromEnv,
} from '../_shared/env.ts'
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
  missing_installation_id:
    'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
  missing_state:
    'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
  invalid_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  expired_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  not_authenticated: 'Autenticação obrigatória.',
  not_project_manager: 'Você não tem permissão para conectar repositórios neste projeto.',
  missing_github_secret: 'Integração GitHub indisponível no servidor.',
  missing_supabase_secret: 'Integração GitHub indisponível no servidor.',
  github_private_key_invalid: 'Integração GitHub indisponível no servidor.',
  github_jwt_failed: 'Integração GitHub indisponível no servidor.',
  github_installation_fetch_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_installation_token_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_repositories_failed: 'Não foi possível carregar os repositórios autorizados.',
  database_upsert_failed: 'Não foi possível salvar a instalação do GitHub.',
  unexpected_error: 'Não foi possível carregar os repositórios autorizados.',
}

type HandlerContext = {
  step: string
  project_id: string | null
  user_id: string | null
  installation_id: number | null
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
      return 400
    case 'expired_state':
      return 408
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
    case 'unexpected_error':
      return 500
    default:
      return 500
  }
}

function logStep(ctx: HandlerContext): void {
  console.info('github_complete_step', {
    step: ctx.step,
    project_id: ctx.project_id,
    user_id: ctx.user_id,
    installation_id: ctx.installation_id,
  })
}

function respondFail(
  code: ErrorCode,
  step: string,
  ctx: HandlerContext,
  details?: Record<string, unknown>,
  githubStatus?: number,
): Response {
  const status = httpStatusForCode(code, githubStatus)
  const message = USER_MESSAGES[code]

  console.error('github_complete_failed', {
    step,
    code,
    message,
    status,
    project_id: ctx.project_id,
    user_id: ctx.user_id,
    installation_id: ctx.installation_id,
    ...(details ?? {}),
  })

  return standardFailResponse({
    code,
    step,
    message,
    status,
    details,
  })
}

function mapThrownError(error: unknown, ctx: HandlerContext): Response {
  if (error instanceof GitHubPrivateKeyError) {
    const code =
      ctx.step === 'create_github_jwt' ? 'github_jwt_failed' : 'github_private_key_invalid'
    return respondFail(code, ctx.step, ctx)
  }

  if (isMissingEnvError(error)) {
    const message = error instanceof Error ? error.message : ''
    const code: ErrorCode = message.includes('SUPABASE_')
      ? 'missing_supabase_secret'
      : message.includes('GITHUB_')
        ? 'missing_github_secret'
        : getMissingRuntimeSecretCode() ?? 'missing_github_secret'
    return respondFail(code, ctx.step, ctx)
  }

  if (error instanceof GitHubApiError) {
    let code: ErrorCode = 'unexpected_error'
    if (ctx.step === 'create_github_jwt') {
      code = 'github_jwt_failed'
    } else if (ctx.step === 'fetch_installation') {
      code = 'github_installation_fetch_failed'
    } else if (ctx.step === 'fetch_installation_token') {
      code = 'github_installation_token_failed'
    } else if (ctx.step === 'list_repositories') {
      code = 'github_repositories_failed'
    }
    return respondFail(
      code,
      ctx.step,
      ctx,
      error.toSanitizedDetails(),
      error.status,
    )
  }

  if (error instanceof Error && error.message.startsWith('database_upsert_failed')) {
    return respondFail('database_upsert_failed', ctx.step, ctx, {
      db_hint: error.message.replace('database_upsert_failed:', ''),
    })
  }

  return respondFail('unexpected_error', ctx.step, ctx, {
    error_name: error instanceof Error ? error.name : 'unknown',
  })
}

async function handleCompleteInstallation(req: Request): Promise<Response> {
  const ctx: HandlerContext = {
    step: 'parse_request',
    project_id: null,
    user_id: null,
    installation_id: null,
  }

  if (req.method !== 'POST') {
    return standardFailResponse({
      code: 'unexpected_error',
      step: 'parse_request',
      message: 'Método não permitido.',
      status: 405,
      details: { reason: 'method_not_allowed' },
    })
  }

  ctx.step = 'load_env'
  logStep(ctx)
  const missingSecret = getMissingRuntimeSecretCode()
  if (missingSecret) {
    return respondFail(missingSecret, 'load_env', ctx)
  }

  ctx.step = 'validate_auth'
  logStep(ctx)
  let user
  try {
    user = await getUserFromRequest(req)
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  if (!user) {
    return respondFail('not_authenticated', 'validate_auth', ctx)
  }

  ctx.user_id = user.id

  ctx.step = 'parse_request'
  logStep(ctx)

  let body: CompleteInstallationBody
  try {
    body = (await req.json()) as CompleteInstallationBody
  } catch {
    return respondFail('missing_body', 'parse_request', ctx)
  }

  const installationId = parseInstallationId(body.installation_id)
  const stateRaw = body.state?.trim()
  const setupAction = normalizeSetupAction(body.setup_action)
  const bodyProjectId = body.project_id?.trim() || null

  ctx.installation_id = installationId

  if (!installationId) {
    return respondFail('missing_installation_id', 'parse_request', ctx)
  }

  if (!stateRaw) {
    return respondFail('missing_state', 'parse_request', ctx)
  }

  ctx.step = 'validate_state'
  logStep(ctx)

  let statePayload
  try {
    const stateResult = await verifySignedGithubStateDetailed(stateRaw)
    if (!stateResult.ok) {
      const code = stateResult.code === 'expired_state' ? 'expired_state' : 'invalid_state'
      return respondFail(code, 'validate_state', ctx)
    }
    statePayload = stateResult.payload
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  ctx.project_id = statePayload.project_id

  if (bodyProjectId && bodyProjectId !== statePayload.project_id) {
    return respondFail('invalid_state', 'validate_state', ctx)
  }

  if (statePayload.user_id !== user.id) {
    return respondFail('invalid_state', 'validate_state', ctx)
  }

  ctx.step = 'permission_check'
  logStep(ctx)

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  try {
    const userClient = createUserClientFromRequest(req)
    const canManage = await assertProjectManager(
      admin,
      statePayload.project_id,
      user.id,
      userClient,
    )
    if (!canManage) {
      return respondFail('not_project_manager', 'permission_check', ctx)
    }
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  ctx.step = 'normalize_private_key'
  logStep(ctx)
  const privateKeyCheck = validateGitHubPrivateKeyFromEnv()
  if (!privateKeyCheck.ok) {
    return respondFail('github_private_key_invalid', 'normalize_private_key', ctx, {
      reason: privateKeyCheck.message,
    })
  }

  ctx.step = 'create_github_jwt'
  logStep(ctx)
  try {
    await createGitHubAppJwt()
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  ctx.step = 'fetch_installation'
  logStep(ctx)
  let installationMeta: GitHubInstallationMeta
  try {
    installationMeta = await fetchInstallation(installationId)
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  if (installationMeta.installation_id !== installationId) {
    return respondFail('github_installation_fetch_failed', 'fetch_installation', ctx)
  }

  ctx.step = 'fetch_installation_token'
  logStep(ctx)
  let accessToken: string
  try {
    accessToken = await createInstallationAccessToken(installationId)
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  ctx.step = 'list_repositories'
  logStep(ctx)
  let repositories
  try {
    repositories = (await listInstallationRepositories(accessToken)).map(mapRepoToPublic)
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  ctx.step = 'save_installation'
  logStep(ctx)
  try {
    await upsertGithubInstallation(admin, installationMeta, user.id)
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  ctx.step = 'return_response'
  logStep(ctx)

  let projectSlug: string | null = null
  try {
    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('slug')
      .eq('id', statePayload.project_id)
      .maybeSingle()

    if (projectError) {
      return respondFail('unexpected_error', 'return_response', ctx, {
        reason: 'project_slug_lookup_failed',
      })
    }

    projectSlug = typeof project?.slug === 'string' ? project.slug : null
  } catch (error) {
    return mapThrownError(error, ctx)
  }

  console.info('github_complete_success', {
    project_id: statePayload.project_id,
    user_id: user.id,
    installation_id: installationId,
    repository_count: repositories.length,
  })

  return jsonResponse({
    ok: true,
    project_id: statePayload.project_id,
    project_slug: projectSlug,
    installation_id: installationId,
    setup_action: setupAction,
    installation: {
      installation_id: installationMeta.installation_id,
      account_login: installationMeta.account_login,
      account_type: installationMeta.account_type,
    },
    repositories,
    ...(repositories.length === 0
      ? {
          message:
            'Nenhum repositório autorizado nesta instalação. No GitHub, conceda acesso aos repositórios e tente novamente.',
        }
      : {}),
  })
}

Deno.serve(async (req) => {
  try {
    const cors = handleCors(req)
    if (cors) return cors

    return await handleCompleteInstallation(req)
  } catch (error) {
    console.error('github_complete_failed', {
      step: 'unhandled',
      code: 'unexpected_error',
      message: error instanceof Error ? error.message : 'unknown',
      error_name: error instanceof Error ? error.name : 'unknown',
    })

    return standardFailResponse({
      code: 'unexpected_error',
      step: 'unhandled',
      message: USER_MESSAGES.unexpected_error,
      status: 500,
      details: {
        error_name: error instanceof Error ? error.name : 'unknown',
      },
    })
  }
})
