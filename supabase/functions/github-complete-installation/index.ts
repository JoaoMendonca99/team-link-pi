/** Finaliza uma instalação do GitHub após validar sessão, estado e acesso ao projeto. */

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const GITHUB_API = 'https://api.github.com'
const GH_JSON_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

type FailInput = {
  step: string
  code: string
  message: string
  status?: number
  details?: Record<string, unknown>
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function fail(input: FailInput): Response {
  const status = input.status ?? 500
  const details = input.details ?? {}
  console.error('github_complete_failed', {
    step: input.step,
    code: input.code,
    message: input.message,
    status,
    details,
  })
  return json(
    {
      ok: false,
      step: input.step,
      code: input.code,
      message: input.message,
      details,
    },
    status,
  )
}

function logStep(step: string, extra?: Record<string, unknown>): void {
  console.log('github_complete_step', { step, ...extra })
}

function envPresent(name: string): boolean {
  const value = Deno.env.get(name)
  return typeof value === 'string' && value.trim().length > 0
}

function checkEnvs(): { ok: true } | { ok: false; missing: string[] } {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'GITHUB_APP_ID',
    'GITHUB_PRIVATE_KEY',
    'GITHUB_STATE_SECRET',
  ]
  const missing = required.filter((name) => !envPresent(name))
  if (missing.length > 0) return { ok: false, missing }
  return { ok: true }
}

function normalizePrivateKey(): { ok: true; pem: string } | { ok: false; reason: string } {
  const raw = Deno.env.get('GITHUB_PRIVATE_KEY')?.trim()
  if (!raw) return { ok: false, reason: 'GITHUB_PRIVATE_KEY ausente' }

  const pem = raw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()
  if (!pem.includes('-----BEGIN')) {
    return { ok: false, reason: 'PEM sem -----BEGIN' }
  }
  if (!pem.includes('-----END')) {
    return { ok: false, reason: 'PEM sem -----END' }
  }
  return { ok: true, pem }
}

async function callGithubGetApp(
  appJwt: string,
): Promise<
  | { ok: true; http_status: number; app_id: number; slug: string; name: string }
  | {
      ok: false
      http_status: number
      code: string
      message: string
      details: Record<string, unknown>
    }
> {
  const response = await fetch(`${GITHUB_API}/app`, {
    headers: {
      ...GH_JSON_HEADERS,
      Authorization: `Bearer ${appJwt}`,
    },
  })

  const http_status = response.status

  if (!response.ok) {
    let github_message: string | null = null
    try {
      const payload = (await response.json()) as { message?: string }
      const m = payload?.message?.trim()
      github_message = m && m.length > 0 ? m : null
    } catch {
      github_message = null
    }

    let code = 'github_app_request_failed'
    let message = 'Falha ao consultar o GitHub App (GET /app).'
    if (response.status === 401) {
      code = 'github_unauthorized'
      message =
        'GitHub rejeitou o JWT (401). Verifique GITHUB_APP_ID e GITHUB_PRIVATE_KEY (par correspondente ao app).'
    } else if (response.status === 403) {
      code = 'github_forbidden'
      message = 'Sem permissão para acessar GET /app (403).'
    } else if (response.status === 404) {
      code = 'github_not_found'
      message = 'Recurso não encontrado (404).'
    }

    return {
      ok: false,
      http_status,
      code,
      message,
      details: { github_message },
    }
  }

  let data: { id?: number; slug?: string; name?: string }
  try {
    data = (await response.json()) as { id?: number; slug?: string; name?: string }
  } catch {
    return {
      ok: false,
      http_status,
      code: 'github_invalid_response',
      message: 'Resposta JSON inválida do GET /app.',
      details: {},
    }
  }

  const app_id = Number(data.id)
  if (!Number.isFinite(app_id)) {
    return {
      ok: false,
      http_status,
      code: 'github_invalid_response',
      message: 'Resposta do GET /app sem id numérico.',
      details: {},
    }
  }

  return {
    ok: true,
    http_status,
    app_id,
    slug: typeof data.slug === 'string' ? data.slug : '',
    name: typeof data.name === 'string' ? data.name : '',
  }
}

function parseInstallationId(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw)
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw.trim())
    if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed)
  }
  return null
}

async function handleRequest(req: Request): Promise<Response> {
  console.log('github_complete_invoked', { method: req.method })

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return fail({
      step: 'parse_body',
      code: 'method_not_allowed',
      message: 'Use POST.',
      status: 405,
      details: { method: req.method },
    })
  }

  let body: Record<string, unknown> = {}
  try {
    logStep('parse_body')
    const text = await req.text()
    if (!text.trim()) {
      body = {}
    } else {
      body = JSON.parse(text) as Record<string, unknown>
    }
  } catch (error) {
    return fail({
      step: 'parse_body',
      code: 'invalid_json',
      message: 'Corpo JSON inválido.',
      status: 400,
      details: { error_name: error instanceof Error ? error.name : 'unknown' },
    })
  }

  const authHeader = req.headers.get('Authorization')
  const userHeaderPresent = Boolean(authHeader?.startsWith('Bearer '))

  logStep('validate_user')
  if (!userHeaderPresent) {
    return fail({
      step: 'validate_user',
      code: 'not_authenticated',
      message: 'Autenticação obrigatória.',
      status: 401,
    })
  }

  logStep('check_envs')
  const envCheck = checkEnvs()
  if (!envCheck.ok) {
    return fail({
      step: 'check_envs',
      code: 'missing_env',
      message: 'A integração GitHub está indisponível.',
      status: 500,
    })
  }

  const installationId = parseInstallationId(body.installation_id)
  const stateRaw = typeof body.state === 'string' ? body.state.trim() : ''

  if (!installationId) {
    return fail({
      step: 'parse_body',
      code: 'missing_installation_id',
      message: 'installation_id é obrigatório.',
      status: 400,
      details: {},
    })
  }

  if (!stateRaw) {
    return fail({
      step: 'parse_body',
      code: 'missing_state',
      message: 'state é obrigatório.',
      status: 400,
      details: {},
    })
  }

  logStep('validate_state', { installation_id: installationId })

  let statePayload: { project_id: string; user_id: string; nonce: string; exp: number }
  try {
    const githubState = await import('../_shared/github-state.ts')
    const stateResult = await githubState.verifySignedGithubStateDetailed(stateRaw)
    if (!stateResult.ok) {
      const code = stateResult.code === 'expired_state' ? 'expired_state' : 'invalid_state'
      return fail({
        step: 'validate_state',
        code,
        message:
          code === 'expired_state'
            ? 'A conexão expirou. Inicie novamente pelo painel.'
            : 'State inválido.',
        status: code === 'expired_state' ? 408 : 400,
        details: {},
      })
    }
    statePayload = stateResult.payload
  } catch (error) {
    console.error('github_validate_state_failed', {
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    return fail({
      step: 'validate_state',
      code: 'state_module_error',
      message: 'Falha ao validar state.',
      status: 500,
      details: { error_name: error instanceof Error ? error.name : 'unknown' },
    })
  }

  logStep('validate_user', { project_id: statePayload.project_id })

  let userId: string
  try {
    const { createGithubAdminAuthClient } = await import('../_shared/github-edge-supabase.ts')
    const adminAuth = createGithubAdminAuthClient()
    const token = authHeader.slice('Bearer '.length).trim()
    const { data, error } = await adminAuth.auth.getUser(token)
    if (error || !data.user) {
      return fail({
        step: 'validate_user',
        code: 'not_authenticated',
        message: 'Sessão inválida ou expirada.',
        status: 401,
        details: { auth_error: error?.message ?? 'no_user' },
      })
    }
    if (data.user.id !== statePayload.user_id) {
      return fail({
        step: 'validate_state',
        code: 'invalid_state',
        message: 'State não corresponde ao usuário logado.',
        status: 403,
        details: {},
      })
    }
    userId = data.user.id
  } catch (error) {
    console.error('github_validate_user_failed', {
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    return fail({
      step: 'validate_user',
      code: 'auth_module_error',
      message: 'Falha ao validar usuário.',
      status: 500,
      details: { error_name: error instanceof Error ? error.name : 'unknown' },
    })
  }

  logStep('validate_project_manager', { project_id: statePayload.project_id, user_id: userId })

  try {
    const githubDb = await import('../_shared/github-db.ts')
    const {
      createGithubAdminRestClient,
      createGithubUserClient,
    } = await import('../_shared/github-edge-supabase.ts')
    const adminRest = createGithubAdminRestClient()
    const userClient = createGithubUserClient(authHeader)
    const canManage = await githubDb.assertProjectManager(
      adminRest,
      statePayload.project_id,
      userId,
      userClient,
    )
    if (!canManage) {
      return fail({
        step: 'validate_project_manager',
        code: 'not_project_manager',
        message: 'Sem permissão neste projeto.',
        status: 403,
        details: {},
      })
    }
  } catch (error) {
    console.error('github_validate_project_manager_failed', {
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    return fail({
      step: 'validate_project_manager',
      code: 'permission_module_error',
      message: 'Falha ao verificar permissão.',
      status: 500,
      details: { error_name: error instanceof Error ? error.name : 'unknown' },
    })
  }

  logStep('normalize_private_key')
  const keyCheck = normalizePrivateKey()
  if (!keyCheck.ok) {
    return fail({
      step: 'normalize_private_key',
      code: 'github_private_key_invalid',
      message: 'Chave privada do GitHub App inválida.',
      status: 500,
      details: { reason: keyCheck.reason },
    })
  }

  logStep('create_github_jwt', { installation_id: installationId })

  let githubApp: typeof import('../_shared/github-app.ts')
  let appJwt: string
  try {
    githubApp = await import('../_shared/github-app.ts')
    appJwt = await githubApp.createGitHubAppJwt()
  } catch (error) {
    const isPrivateKey =
      error instanceof Error && error.name === 'GitHubPrivateKeyError'
    console.error('github_create_jwt_failed', {
      error_name: error instanceof Error ? error.name : 'unknown',
      is_private_key_error: isPrivateKey,
    })
    return fail({
      step: 'create_github_jwt',
      code: isPrivateKey ? 'github_private_key_invalid' : 'github_jwt_failed',
      message: 'Falha ao gerar JWT do GitHub App.',
      status: 500,
      details: {
        error_name: error instanceof Error ? error.name : 'unknown',
      },
    })
  }

  logStep('github_get_app', { installation_id: installationId })
  const appMeta = await callGithubGetApp(appJwt)
  if (!appMeta.ok) {
    console.error('github_get_app_failed', {
      http_status: appMeta.http_status,
      code: appMeta.code,
    })
    return fail({
      step: 'github_get_app',
      code: appMeta.code,
      message: appMeta.message,
      status: 502,
      details: { ...appMeta.details, http_status: appMeta.http_status },
    })
  }

  logStep('github_get_installation', { installation_id: installationId })

  let installationMeta: import('../_shared/github-app.ts').GitHubInstallationMeta
  try {
    installationMeta = await githubApp.fetchInstallation(installationId)
  } catch (error) {
    const details =
      error instanceof githubApp.GitHubApiError
        ? error.toSanitizedDetails()
        : { error_name: error instanceof Error ? error.name : 'unknown' }
    console.error('github_get_installation_failed', {
      details,
    })
    return fail({
      step: 'github_get_installation',
      code: 'github_installation_fetch_failed',
      message: 'Falha ao buscar instalação no GitHub.',
      status: 502,
      details,
    })
  }

  logStep('github_create_installation_token', { installation_id: installationId })

  let accessToken: string
  try {
    accessToken = await githubApp.createInstallationAccessToken(installationId)
  } catch (error) {
    const details =
      error instanceof githubApp.GitHubApiError
        ? error.toSanitizedDetails()
        : { error_name: error instanceof Error ? error.name : 'unknown' }
    console.error('github_create_installation_token_failed', { details })
    return fail({
      step: 'github_create_installation_token',
      code: 'github_installation_token_failed',
      message: 'Falha ao obter token da instalação.',
      status: 502,
      details,
    })
  }

  logStep('github_list_repositories', { installation_id: installationId })

  let repositories: import('../_shared/github-app.ts').PublicGithubRepository[]
  try {
    const repos = await githubApp.listInstallationRepositories(accessToken)
    repositories = repos.map(githubApp.mapRepoToPublic)
  } catch (error) {
    const details =
      error instanceof githubApp.GitHubApiError
        ? error.toSanitizedDetails()
        : { error_name: error instanceof Error ? error.name : 'unknown' }
    console.error('github_list_repositories_failed', { details })
    return fail({
      step: 'github_list_repositories',
      code: 'github_repositories_failed',
      message: 'Falha ao listar repositórios.',
      status: 502,
      details,
    })
  }

  logStep('upsert_installation', { installation_id: installationId })

  try {
    const githubDb = await import('../_shared/github-db.ts')
    const { createGithubAdminRestClient } = await import('../_shared/github-edge-supabase.ts')
    const adminRest = createGithubAdminRestClient()
    const upsertResult = await githubDb.upsertGithubInstallation(
      adminRest,
      installationMeta,
      userId,
    )
    if (!upsertResult.ok) {
      console.error('github_upsert_installation_failed', {
        code: upsertResult.supabase_error_code,
        installation_id: installationId,
      })
      return fail({
        step: 'upsert_installation',
        code: 'database_upsert_failed',
        message: 'Falha ao salvar instalação.',
        status: 500,
        details: {
          supabase_error_code: upsertResult.supabase_error_code,
          supabase_error_message: upsertResult.supabase_error_message,
          supabase_error_details: upsertResult.supabase_error_details,
          supabase_error_hint: upsertResult.supabase_error_hint,
          using_service_role: true,
          payload_preview: upsertResult.payload_preview,
          payload_keys: upsertResult.payload_keys,
        },
      })
    }
  } catch (error) {
    console.error('github_upsert_installation_failed', {
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    return fail({
      step: 'upsert_installation',
      code: 'database_upsert_failed',
      message: 'Falha ao salvar instalação.',
      status: 500,
      details: {
        supabase_error_code: null,
        supabase_error_message: error instanceof Error ? error.message : 'unknown',
        supabase_error_details: null,
        supabase_error_hint: null,
        using_service_role: true,
        caught_exception: true,
        error_name: error instanceof Error ? error.name : 'unknown',
        payload_preview: {
          installation_id: installationMeta.installation_id,
          app_id: installationMeta.app_id,
          account_id: installationMeta.account_id,
          account_login: installationMeta.account_login,
          account_type: installationMeta.account_type,
          target_type: installationMeta.target_type,
          status: installationMeta.status,
          created_by: userId,
          metadata_keys: [] as string[],
        },
        payload_keys: [] as string[],
      },
    })
  }

  logStep('return_repositories', {
    installation_id: installationId,
    repository_count: repositories.length,
  })

  let projectSlug: string | null = null
  try {
    const { createGithubAdminRestClient } = await import('../_shared/github-edge-supabase.ts')
    const adminRest = createGithubAdminRestClient()
    const { data: project } = await adminRest
      .from('projects')
      .select('slug')
      .eq('id', statePayload.project_id)
      .maybeSingle()
    projectSlug = typeof project?.slug === 'string' ? project.slug : null
  } catch {
    projectSlug = null
  }

  console.log('github_complete_success', {
    project_id: statePayload.project_id,
    installation_id: installationId,
    repository_count: repositories.length,
  })

  return json({
    ok: true,
    project_id: statePayload.project_id,
    project_slug: projectSlug,
    installation_id: installationId,
    setup_action:
      typeof body.setup_action === 'string' ? body.setup_action : null,
    installation: {
      installation_id: installationMeta.installation_id,
      account_login: installationMeta.account_login,
      account_type: installationMeta.account_type,
    },
    repositories,
  })
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (error) {
    console.error('github_complete_unhandled', {
      step: 'unhandled',
      code: 'unexpected_error',
      message: error instanceof Error ? error.message : 'unknown',
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    return json(
      {
        ok: false,
        step: 'unhandled',
        code: 'unexpected_error',
        message: 'Erro interno inesperado na Edge Function.',
        details: { error_name: error instanceof Error ? error.name : 'unknown' },
      },
      500,
    )
  }
})
