import {
  createInstallationAccessToken,
  fetchInstallation,
  GitHubApiError,
  GitHubPrivateKeyError,
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

type ErrorCode =
  | 'missing_installation_id'
  | 'missing_state'
  | 'invalid_state'
  | 'expired_state'
  | 'unauthenticated'
  | 'not_project_manager'
  | 'missing_github_secret'
  | 'missing_supabase_secret'
  | 'github_private_key_invalid'
  | 'github_jwt_failed'
  | 'github_installation_token_failed'
  | 'github_repositories_failed'
  | 'supabase_insert_installation_failed'
  | 'unexpected_error'

const USER_MESSAGES: Record<ErrorCode, string> = {
  missing_installation_id: 'Não foi possível carregar os repositórios autorizados.',
  missing_state: 'Não foi possível carregar os repositórios autorizados.',
  invalid_state: 'Não foi possível carregar os repositórios autorizados.',
  expired_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  unauthenticated: 'Autenticação obrigatória.',
  not_project_manager: 'Você não tem permissão para conectar repositórios neste projeto.',
  missing_github_secret: 'Não foi possível carregar os repositórios autorizados.',
  missing_supabase_secret: 'Não foi possível carregar os repositórios autorizados.',
  github_private_key_invalid: 'Não foi possível carregar os repositórios autorizados.',
  github_jwt_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_installation_token_failed: 'Não foi possível carregar os repositórios autorizados.',
  github_repositories_failed: 'Não foi possível carregar os repositórios autorizados.',
  supabase_insert_installation_failed: 'Não foi possível carregar os repositórios autorizados.',
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

function fail(
  code: ErrorCode,
  step: string,
  status: number,
  detail?: string,
): Response {
  console.error('[github-complete-installation]', {
    event: 'complete_failed',
    code,
    step,
    ...(detail ? { detail } : {}),
  })
  return codedErrorResponse(USER_MESSAGES[code], code, status, step)
}

function mapGithubError(
  error: unknown,
  step: string,
  fallbackCode: ErrorCode,
): Response {
  if (error instanceof GitHubPrivateKeyError) {
    return fail('github_private_key_invalid', step, 500)
  }
  if (isMissingEnvError(error)) {
    const code = getMissingRuntimeSecretCode() ?? 'missing_github_secret'
    return fail(code, step, 500, error.message)
  }
  if (error instanceof GitHubApiError) {
    const code =
      step === 'github_jwt_created' || step === 'fetch_installation'
        ? 'github_jwt_failed'
        : step === 'installation_token_created'
          ? 'github_installation_token_failed'
          : 'github_repositories_failed'
    return fail(code, step, error.status >= 400 && error.status < 600 ? error.status : 502, error.message)
  }
  return fail(
    fallbackCode,
    step,
    500,
    error instanceof Error ? error.message : undefined,
  )
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return fail('unexpected_error', 'setup_started', 405, 'method not allowed')
  }

  console.info('[github-complete-installation]', { event: 'setup_started' })

  const missingSecret = getMissingRuntimeSecretCode()
  if (missingSecret) {
    return fail(missingSecret, 'check_secrets', 500)
  }

  const user = await getUserFromRequest(req)
  if (!user) {
    return fail('unauthenticated', 'user_loaded', 401)
  }
  console.info('[github-complete-installation]', { event: 'user_loaded', user_id: user.id })

  let body: CompleteInstallationBody
  try {
    body = (await req.json()) as CompleteInstallationBody
  } catch {
    return fail('unexpected_error', 'parse_body', 400, 'invalid json')
  }

  const installationId = parseInstallationId(body.installation_id)
  const stateRaw = body.state?.trim()
  const setupAction = normalizeSetupAction(body.setup_action)

  if (!installationId) {
    return fail('missing_installation_id', 'validate_input', 400)
  }

  if (!stateRaw) {
    return fail(
      'missing_state',
      'validate_input',
      400,
      `setup_action=${setupAction ?? 'null'}`,
    )
  }

  let statePayload
  try {
    const stateResult = await verifySignedGithubStateDetailed(stateRaw)
    if (!stateResult.ok) {
      const code =
        stateResult.code === 'expired_state' ? 'expired_state' : 'invalid_state'
      return fail(code, 'state_validated', 400, stateResult.code)
    }
    statePayload = stateResult.payload
  } catch (error) {
    return mapGithubError(error, 'state_validated', 'invalid_state')
  }

  console.info('[github-complete-installation]', {
    event: 'state_validated',
    project_id: statePayload.project_id,
    setup_action: setupAction,
    installation_id: installationId,
  })

  if (statePayload.user_id !== user.id) {
    return fail('invalid_state', 'state_validated', 403, 'state user mismatch')
  }

  const projectId = statePayload.project_id

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    if (isMissingEnvError(error)) {
      return fail('missing_supabase_secret', 'create_admin_client', 500, error.message)
    }
    return fail('unexpected_error', 'create_admin_client', 500)
  }

  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
  if (!canManage) {
    return fail('not_project_manager', 'project_permission_checked', 403)
  }

  console.info('[github-complete-installation]', {
    event: 'project_permission_checked',
    project_id: projectId,
  })

  try {
    let installationMeta
    try {
      installationMeta = await fetchInstallation(installationId)
      console.info('[github-complete-installation]', { event: 'github_jwt_created' })
    } catch (error) {
      return mapGithubError(error, 'fetch_installation', 'github_jwt_failed')
    }

    if (installationMeta.installation_id !== installationId) {
      return fail(
        'github_installation_token_failed',
        'fetch_installation',
        400,
        'installation id mismatch',
      )
    }

    try {
      await upsertGithubInstallation(admin, installationMeta, user.id)
      console.info('[github-complete-installation]', { event: 'installation_saved' })
    } catch (error) {
      return fail(
        'supabase_insert_installation_failed',
        'save_installation',
        500,
        error instanceof Error ? error.message : undefined,
      )
    }

    let accessToken: string
    try {
      accessToken = await createInstallationAccessToken(installationId)
      console.info('[github-complete-installation]', { event: 'installation_token_created' })
    } catch (error) {
      return mapGithubError(error, 'installation_token_created', 'github_installation_token_failed')
    }

    let repositories
    try {
      repositories = (await listInstallationRepositories(accessToken)).map(mapRepoToSafe)
      console.info('[github-complete-installation]', {
        event: 'repositories_loaded',
        count: repositories.length,
      })
    } catch (error) {
      return mapGithubError(error, 'list_repositories', 'github_repositories_failed')
    }

    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('slug')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError) {
      return fail(
        'unexpected_error',
        'load_project_slug',
        500,
        projectError.message,
      )
    }

    console.info('[github-complete-installation]', {
      event: 'complete_success',
      project_id: projectId,
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
      repositories,
    })
  } catch (error) {
    return mapGithubError(error, 'unexpected', 'unexpected_error')
  }
})
