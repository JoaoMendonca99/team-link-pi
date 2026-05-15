/** Versão autocontida de diagnóstico — sem imports _shared no topo. */

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

const ENV_DIAGNOSTIC_NAMES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'GITHUB_APP_ID',
  'GITHUB_PRIVATE_KEY',
  'GITHUB_STATE_SECRET',
  'GITHUB_APP_SLUG',
  'GITHUB_WEBHOOK_SECRET',
] as const

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

function pemHasValidNewlines(pem: string): boolean {
  const lines = pem.split('\n').filter((l) => l.length > 0)
  if (lines.length < 3) return false
  if (!lines[0].includes('BEGIN')) return false
  if (!lines[lines.length - 1].includes('END')) return false
  return true
}

function privateKeyBeginOk(pem: string): boolean {
  const t = pem.trimStart()
  return (
    t.startsWith('-----BEGIN RSA PRIVATE KEY-----') ||
    t.startsWith('-----BEGIN PRIVATE KEY-----')
  )
}

function privateKeyEndOk(pem: string): boolean {
  const t = pem.trimEnd()
  return (
    t.endsWith('-----END RSA PRIVATE KEY-----') ||
    t.endsWith('-----END PRIVATE KEY-----')
  )
}

/** Mensagem de erro segura para o modo debug private_key (sem segredos). */
function safeJwtDebugErrorMessage(error: unknown, maxLen = 220): string | null {
  if (!(error instanceof Error)) return null
  let m = error.message.trim()
  if (!m) return null
  if (/-----BEGIN|BEGIN[\sA-Z]*PRIVATE|RSA PRIVATE KEY/i.test(m)) {
    return 'erro_redacted_pem'
  }
  m = m.replace(/[A-Za-z0-9+/=]{48,}/g, '[b64]')
  if (m.length > maxLen) m = `${m.slice(0, maxLen)}…`
  return m
}

async function trySignTestJwtWithPem(
  pem: string,
): Promise<
  | { ok: true }
  | { ok: false; error_name: string; error_message?: string | null }
> {
  const appId = Deno.env.get('GITHUB_APP_ID')?.trim()
  if (!appId) {
    return {
      ok: false,
      error_name: 'missing_github_app_id',
      error_message: 'GITHUB_APP_ID ausente.',
    }
  }

  type JoseModule = typeof import('https://esm.sh/jose@5.9.6')
  let jose: JoseModule
  try {
    jose = await import('https://esm.sh/jose@5.9.6')
  } catch (e) {
    return {
      ok: false,
      error_name: e instanceof Error ? e.name : 'jose_import_failed',
      error_message: safeJwtDebugErrorMessage(e),
    }
  }

  let privateKey: CryptoKey
  try {
    const { importGithubAppSigningKeyFromPem } = await import(
      '../_shared/github-rsa-import.ts'
    )
    privateKey = await importGithubAppSigningKeyFromPem(pem)
  } catch (e) {
    return {
      ok: false,
      error_name: e instanceof Error ? e.name : 'import_key_failed',
      error_message: safeJwtDebugErrorMessage(e),
    }
  }

  try {
    const now = Math.floor(Date.now() / 1000)
    await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 600)
      .setIssuer(appId)
      .sign(privateKey)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error_name: e instanceof Error ? e.name : 'sign_failed',
      error_message: safeJwtDebugErrorMessage(e),
    }
  }
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

type GitHubRepoShape = {
  name: string
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
  owner: { login: string }
}

function toInstallationDebugRepo(r: GitHubRepoShape): Record<string, unknown> {
  return {
    owner: r.owner?.login ?? '',
    repo: r.name,
    full_name: r.full_name,
    private: r.private,
    default_branch: r.default_branch || 'main',
    html_url: r.html_url,
  }
}

async function listInstallationReposWithToken(
  accessToken: string,
): Promise<GitHubRepoShape[]> {
  const collected: GitHubRepoShape[] = []
  let page = 1
  while (page <= 20) {
    const response = await fetch(
      `${GITHUB_API}/installation/repositories?per_page=100&page=${page}`,
      {
        headers: {
          ...GH_JSON_HEADERS,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )
    if (!response.ok) {
      let github_message: string | null = null
      try {
        const payload = (await response.json()) as { message?: string }
        const m = payload?.message?.trim()
        github_message = m && m.length > 0 ? m : null
      } catch {
        github_message = null
      }
      throw new Error(
        JSON.stringify({
          http_status: response.status,
          github_message,
        }),
      )
    }
    const payload = (await response.json()) as {
      repositories?: GitHubRepoShape[]
      total_count?: number
    }
    const batch = payload.repositories ?? []
    collected.push(...batch)
    const total = payload.total_count ?? collected.length
    if (batch.length === 0 || collected.length >= total) break
    page += 1
  }
  return collected
}

async function createInstallationAccessTokenRaw(
  appJwt: string,
  installationId: number,
): Promise<
  | { ok: true; token: string }
  | { ok: false; http_status: number; github_message: string | null }
> {
  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        ...GH_JSON_HEADERS,
        Authorization: `Bearer ${appJwt}`,
      },
    },
  )
  if (!response.ok) {
    let github_message: string | null = null
    try {
      const payload = (await response.json()) as { message?: string }
      const m = payload?.message?.trim()
      github_message = m && m.length > 0 ? m : null
    } catch {
      github_message = null
    }
    return { ok: false, http_status: response.status, github_message }
  }
  const payload = (await response.json()) as { token?: string }
  if (!payload.token) {
    return { ok: false, http_status: 502, github_message: 'missing_token_in_response' }
  }
  return { ok: true, token: payload.token }
}

async function handleDebugModes(
  body: Record<string, unknown>,
  req: Request,
): Promise<Response | null> {
  const debugVal = body.debug
  const authHeader = req.headers.get('Authorization')
  const userHeaderPresent = Boolean(authHeader?.startsWith('Bearer '))

  if (debugVal === true) {
    logStep('debug_mode', { mode: 'legacy_true' })
    const envs_present: Record<string, boolean> = {}
    for (const name of ENV_DIAGNOSTIC_NAMES) {
      envs_present[name] = envPresent(name)
    }
    return json({
      ok: true,
      received: true,
      envs_present,
      user_header_present: userHeaderPresent,
    })
  }

  if (debugVal === 'env') {
    logStep('debug_mode', { mode: 'env' })
    const present = ENV_DIAGNOSTIC_NAMES.filter((name) => envPresent(name))
    return json({
      ok: true,
      debug: 'env',
      present,
    })
  }

  if (debugVal === 'private_key') {
    logStep('debug_mode', { mode: 'private_key' })
    const key_present = envPresent('GITHUB_PRIVATE_KEY')
    const normalized = normalizePrivateKey()
    const pem = normalized.ok ? normalized.pem : ''
    const key_begin_ok = normalized.ok ? privateKeyBeginOk(pem) : false
    const key_end_ok = normalized.ok ? privateKeyEndOk(pem) : false
    const newlines_ok = normalized.ok ? pemHasValidNewlines(pem) : false

    let jwt_created = false
    let jwt_error_name: string | null = null
    let jwt_error_message: string | null = null
    if (normalized.ok) {
      const sign = await trySignTestJwtWithPem(pem)
      jwt_created = sign.ok
      if (!sign.ok) {
        jwt_error_name = sign.error_name
        jwt_error_message = sign.error_message ?? null
      }
    }

    return json({
      ok: true,
      debug: 'private_key',
      key_present,
      key_begin_ok,
      key_end_ok,
      newlines_ok,
      jwt_created,
      ...(jwt_error_name ? { jwt_error_name } : {}),
      ...(jwt_created ? {} : jwt_error_message ? { jwt_error_message } : {}),
    })
  }

  if (debugVal === 'github_app') {
    logStep('debug_mode', { mode: 'github_app' })
    const envCheck = checkEnvs()
    if (!envCheck.ok) {
      return json({
        ok: false,
        debug: 'github_app',
        step: 'check_envs',
        code: 'missing_env',
        message: 'Secrets obrigatórios ausentes para este teste.',
        details: { missing: envCheck.missing },
      })
    }
    let githubApp: typeof import('../_shared/github-app.ts')
    try {
      githubApp = await import('../_shared/github-app.ts')
    } catch (e) {
      console.error('github_debug_github_app_import_failed', {
        error_name: e instanceof Error ? e.name : 'unknown',
      })
      return json({
        ok: false,
        debug: 'github_app',
        step: 'create_github_jwt',
        code: 'module_import_failed',
        message: 'Falha ao carregar módulo github-app.',
        details: { error_name: e instanceof Error ? e.name : 'unknown' },
      })
    }
    let appJwt: string
    try {
      appJwt = await githubApp.createGitHubAppJwt()
    } catch (e) {
      const isPk =
        e instanceof Error && e.name === 'GitHubPrivateKeyError'
      console.error('github_debug_jwt_failed', {
        error_name: e instanceof Error ? e.name : 'unknown',
        is_private_key_error: isPk,
      })
      return json({
        ok: false,
        debug: 'github_app',
        step: 'create_github_jwt',
        code: isPk ? 'github_private_key_invalid' : 'github_jwt_failed',
        message: 'Falha ao gerar JWT do GitHub App.',
        details: { error_name: e instanceof Error ? e.name : 'unknown' },
      })
    }

    const appResult = await callGithubGetApp(appJwt)
    if (!appResult.ok) {
      console.error('github_debug_get_app_failed', {
        http_status: appResult.http_status,
        code: appResult.code,
      })
      return json({
        ok: false,
        debug: 'github_app',
        step: 'github_get_app',
        code: appResult.code,
        message: appResult.message,
        http_status: appResult.http_status,
        details: appResult.details,
      })
    }

    return json({
      ok: true,
      debug: 'github_app',
      http_status: appResult.http_status,
      app_id: appResult.app_id,
      slug: appResult.slug,
      name: appResult.name,
    })
  }

  if (debugVal === 'installation') {
    logStep('debug_mode', { mode: 'installation' })
    const installationId = parseInstallationId(body.installation_id)
    if (!installationId) {
      return json({
        ok: false,
        debug: 'installation',
        step: 'parse_body',
        code: 'missing_installation_id',
        message: 'installation_id é obrigatório para este teste.',
        details: {},
      })
    }

    const envCheck = checkEnvs()
    if (!envCheck.ok) {
      return json({
        ok: false,
        debug: 'installation',
        step: 'check_envs',
        code: 'missing_env',
        message: 'Secrets obrigatórios ausentes para este teste.',
        details: { missing: envCheck.missing },
      })
    }

    let githubApp: typeof import('../_shared/github-app.ts')
    try {
      githubApp = await import('../_shared/github-app.ts')
    } catch (e) {
      console.error('github_debug_install_import_failed', {
        error_name: e instanceof Error ? e.name : 'unknown',
      })
      return json({
        ok: false,
        debug: 'installation',
        step: 'create_github_jwt',
        code: 'module_import_failed',
        message: 'Falha ao carregar módulo github-app.',
        details: { error_name: e instanceof Error ? e.name : 'unknown' },
      })
    }

    let appJwt: string
    try {
      appJwt = await githubApp.createGitHubAppJwt()
    } catch (e) {
      const isPk =
        e instanceof Error && e.name === 'GitHubPrivateKeyError'
      return json({
        ok: false,
        debug: 'installation',
        step: 'create_github_jwt',
        code: isPk ? 'github_private_key_invalid' : 'github_jwt_failed',
        message: 'Falha ao gerar JWT do GitHub App.',
        details: { error_name: e instanceof Error ? e.name : 'unknown' },
      })
    }

    const appProbe = await callGithubGetApp(appJwt)
    if (!appProbe.ok) {
      return json({
        ok: false,
        debug: 'installation',
        step: 'github_get_app',
        code: appProbe.code,
        message: appProbe.message,
        http_status: appProbe.http_status,
        details: appProbe.details,
      })
    }

    const tokenResult = await createInstallationAccessTokenRaw(appJwt, installationId)
    if (!tokenResult.ok) {
      let code = 'github_installation_token_failed'
      if (tokenResult.http_status === 401) code = 'github_unauthorized'
      if (tokenResult.http_status === 404) code = 'github_installation_not_found'
      console.error('github_debug_install_token_failed', {
        http_status: tokenResult.http_status,
        code,
      })
      return json({
        ok: false,
        debug: 'installation',
        step: 'github_create_installation_token',
        code,
        message: 'Falha ao criar token da instalação.',
        http_status: tokenResult.http_status,
        details: { github_message: tokenResult.github_message },
      })
    }

    let repos: GitHubRepoShape[]
    try {
      repos = await listInstallationReposWithToken(tokenResult.token)
    } catch (e) {
      let http_status = 502
      let github_message: string | null = null
      if (e instanceof Error) {
        try {
          const parsed = JSON.parse(e.message) as {
            http_status?: number
            github_message?: string | null
          }
          if (typeof parsed.http_status === 'number') http_status = parsed.http_status
          github_message = parsed.github_message ?? null
          if (github_message === undefined) github_message = null
        } catch {
          http_status = 502
        }
      }
      console.error('github_debug_list_repos_failed', { http_status })
      return json({
        ok: false,
        debug: 'installation',
        step: 'github_list_repositories',
        code: 'github_repositories_failed',
        message: 'Falha ao listar repositórios da instalação.',
        http_status,
        details: { github_message },
      })
    }

    const repositories = repos.map(toInstallationDebugRepo)
    return json({
      ok: true,
      debug: 'installation',
      installation_id: installationId,
      repository_count: repositories.length,
      repositories,
    })
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

  const debugResponse = await handleDebugModes(body, req)
  if (debugResponse) return debugResponse

  const authHeader = req.headers.get('Authorization')
  const userHeaderPresent = Boolean(authHeader?.startsWith('Bearer '))

  logStep('check_envs')
  const envCheck = checkEnvs()
  if (!envCheck.ok) {
    return fail({
      step: 'check_envs',
      code: 'missing_env',
      message: 'Secrets obrigatórios ausentes no Supabase.',
      status: 500,
      details: { missing: envCheck.missing },
    })
  }

  logStep('validate_user')
  if (!userHeaderPresent) {
    return fail({
      step: 'validate_user',
      code: 'not_authenticated',
      message: 'Autenticação obrigatória.',
      status: 401,
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
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!.trim()
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.trim()
    const token = authHeader.slice('Bearer '.length).trim()
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await admin.auth.getUser(token)
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
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!.trim()
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.trim()
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
    let userClient = null
    if (anonKey) {
      userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    }
    const canManage = await githubDb.assertProjectManager(
      admin,
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
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1')
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!.trim(),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.trim(),
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    await githubDb.upsertGithubInstallation(admin, installationMeta, userId)
  } catch (error) {
    console.error('github_upsert_installation_failed', {
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    return fail({
      step: 'upsert_installation',
      code: 'database_upsert_failed',
      message: 'Falha ao salvar instalação.',
      status: 500,
      details: { error_name: error instanceof Error ? error.name : 'unknown' },
    })
  }

  logStep('return_repositories', {
    installation_id: installationId,
    repository_count: repositories.length,
  })

  let projectSlug: string | null = null
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1')
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!.trim(),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.trim(),
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: project } = await admin
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
