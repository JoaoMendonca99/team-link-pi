import { getSupabaseClient } from '@/lib/supabase/client'

import {
  buildGithubFunctionDebug,
  logGithubFunctionDebug,
  type GithubFunctionDebugInfo,
} from './function-debug'
import type {
  GithubAvailableInstallation,
  GithubAvailableRepository,
  GithubCommitVisibility,
  GithubCompleteInstallationResult,
  GithubInvalidInstallation,
  GithubSelectableRepository,
  ListAvailableGithubRepositoriesResult,
} from './types'

export const GITHUB_START_INSTALLATION_FUNCTION = 'github-start-installation'

export const GITHUB_LIST_AVAILABLE_REPOSITORIES_FUNCTION =
  'github-list-available-repositories'

export const GITHUB_LIST_AVAILABLE_USER_MESSAGE =
  'Não foi possível carregar repositórios do GitHub.'

export const GITHUB_START_USER_MESSAGE =
  'Não foi possível iniciar a conexão com o GitHub. Verifique se a integração foi publicada e configurada.'

const TECHNICAL_ERROR_RE =
  /jwt|pgrst|postgres|edge function|functions_http|fetch failed|non-2xx|network/i

function isTechnicalError(message: string): boolean {
  return TECHNICAL_ERROR_RE.test(message)
}

function friendlyFunctionError(
  message: string | undefined,
  fallback: string,
): string {
  const trimmed = message?.trim()
  if (!trimmed) return fallback
  if (isTechnicalError(trimmed)) return fallback
  return trimmed
}

function readFunctionError(payload: Record<string, unknown> | null): string | null {
  if (payload?.message && typeof payload.message === 'string') {
    return payload.message
  }
  if (payload?.error && typeof payload.error === 'string') {
    return payload.error
  }
  return null
}

function readFunctionCode(payload: Record<string, unknown> | null): string | null {
  if (payload?.code && typeof payload.code === 'string') {
    return payload.code
  }
  return null
}

function readFunctionStep(payload: Record<string, unknown> | null): string | null {
  if (payload?.step && typeof payload.step === 'string') {
    return payload.step
  }
  return null
}

function readFunctionDetails(
  payload: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (
    payload?.details &&
    typeof payload.details === 'object' &&
    !Array.isArray(payload.details)
  ) {
    return payload.details as Record<string, unknown>
  }
  return null
}

function parseFunctionFailure(
  payload: Record<string, unknown> | null,
  invokeError: unknown,
  fallbackMessage: string,
  codeMessages: Record<string, string>,
): { message: string; code: string | null; step: string | null } {
  const fnCode = readFunctionCode(payload)
  const fnError = readFunctionError(payload)
  const fnStep = readFunctionStep(payload)

  if (fnError || fnCode) {
    const message =
      (fnCode && codeMessages[fnCode]) ||
      friendlyFunctionError(fnError ?? undefined, fallbackMessage)
    return { message, code: fnCode, step: fnStep }
  }

  if (invokeError && typeof invokeError === 'object' && 'message' in invokeError) {
    return {
      message: friendlyFunctionError(
        String((invokeError as { message?: string }).message),
        fallbackMessage,
      ),
      code: null,
      step: null,
    }
  }

  return { message: fallbackMessage, code: null, step: null }
}

export const GITHUB_COMPLETE_INSTALLATION_FUNCTION = 'github-complete-installation'

export const GITHUB_COMPLETE_USER_MESSAGE =
  'Não foi possível carregar os repositórios autorizados.'

const COMPLETE_CODE_MESSAGES: Record<string, string> = {
  permission_denied: 'Você não tem permissão para conectar repositórios neste projeto.',
  not_project_manager: 'Você não tem permissão para conectar repositórios neste projeto.',
  not_authenticated: 'Autenticação obrigatória. Faça login e tente novamente.',
  unauthenticated: 'Autenticação obrigatória. Faça login e tente novamente.',
  expired_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  invalid_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  missing_state: 'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
  missing_installation_id:
    'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
  missing_body: 'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
  github_private_key_invalid:
    'Integração GitHub indisponível no servidor. O administrador precisa revisar a chave privada do App.',
  github_jwt_failed:
    'Integração GitHub indisponível no servidor. O administrador precisa revisar App ID e chave privada.',
  missing_github_secret:
    'Integração GitHub indisponível no servidor. O administrador precisa configurar os secrets.',
  missing_supabase_secret:
    'Integração GitHub indisponível no servidor. O administrador precisa configurar os secrets.',
  database_upsert_failed:
    'Não foi possível salvar a instalação. Tente novamente ou contate o suporte.',
}

export type StartGithubInstallationResult =
  | { ok: true; install_url: string }
  | { ok: false; message: string; debug: GithubFunctionDebugInfo }

export async function startGithubInstallation(
  projectId: string,
): Promise<StartGithubInstallationResult> {
  const client = getSupabaseClient()
  const requestBody = { project_id: projectId }
  const { data, error } = await client.functions.invoke(GITHUB_START_INSTALLATION_FUNCTION, {
    body: requestBody,
  })

  const fail = (message: string): StartGithubInstallationResult => {
    const debug = buildGithubFunctionDebug(
      GITHUB_START_INSTALLATION_FUNCTION,
      error,
      data,
      requestBody,
    )
    logGithubFunctionDebug(debug)
    return { ok: false, message, debug }
  }

  const payload = data as Record<string, unknown> | null
  const installUrl = typeof payload?.install_url === 'string' ? payload.install_url : null

  if (installUrl) {
    return { ok: true, install_url: installUrl }
  }

  const fnError = readFunctionError(payload)
  const fnCode = readFunctionCode(payload)

  if (error || fnError || fnCode) {
    const message = fnError
      ? friendlyFunctionError(fnError, GITHUB_START_USER_MESSAGE)
      : friendlyFunctionError(
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: string }).message)
            : undefined,
          GITHUB_START_USER_MESSAGE,
        )
    return fail(message)
  }

  return fail(GITHUB_START_USER_MESSAGE)
}

function parseAvailableInstallation(value: unknown): GithubAvailableInstallation | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const installation_id =
    typeof row.installation_id === 'number' && Number.isFinite(row.installation_id)
      ? row.installation_id
      : null
  const account_login = typeof row.account_login === 'string' ? row.account_login : null
  if (!installation_id || !account_login) return null
  return {
    installation_id,
    account_login,
    account_type: typeof row.account_type === 'string' ? row.account_type : 'User',
    status: typeof row.status === 'string' ? row.status : 'active',
  }
}

function parseAvailableRepository(value: unknown): GithubAvailableRepository | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const installation_id =
    typeof row.installation_id === 'number' && Number.isFinite(row.installation_id)
      ? row.installation_id
      : null
  const github_repository_id =
    typeof row.github_repository_id === 'number' &&
    Number.isFinite(row.github_repository_id)
      ? row.github_repository_id
      : null
  const full_name = typeof row.full_name === 'string' ? row.full_name : null
  if (!installation_id || !github_repository_id || !full_name) return null

  return {
    installation_id,
    github_repository_id,
    owner_login: typeof row.owner_login === 'string' ? row.owner_login : '',
    repo_name: typeof row.repo_name === 'string' ? row.repo_name : '',
    full_name,
    private: Boolean(row.private),
    default_branch:
      typeof row.default_branch === 'string' ? row.default_branch : 'main',
    html_url: typeof row.html_url === 'string' ? row.html_url : '',
    linked_to_current_project: Boolean(row.linked_to_current_project),
    current_project_repository_id:
      typeof row.current_project_repository_id === 'string'
        ? row.current_project_repository_id
        : null,
    linked_elsewhere: Boolean(row.linked_elsewhere),
  }
}

function parseInvalidInstallation(value: unknown): GithubInvalidInstallation | null {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  const installation_id =
    typeof row.installation_id === 'number' && Number.isFinite(row.installation_id)
      ? row.installation_id
      : null
  if (!installation_id) return null
  return {
    installation_id,
    account_login:
      typeof row.account_login === 'string' ? row.account_login : 'GitHub',
    reason:
      typeof row.reason === 'string'
        ? row.reason
        : 'Não foi possível acessar esta instalação no GitHub.',
  }
}

export async function listAvailableGithubRepositories(
  projectId: string,
): Promise<ListAvailableGithubRepositoriesResult> {
  const client = getSupabaseClient()
  const requestBody = { project_id: projectId }
  const { data, error } = await client.functions.invoke(
    GITHUB_LIST_AVAILABLE_REPOSITORIES_FUNCTION,
    { body: requestBody },
  )

  const fail = (message: string): ListAvailableGithubRepositoriesResult => {
    const debug = buildGithubFunctionDebug(
      GITHUB_LIST_AVAILABLE_REPOSITORIES_FUNCTION,
      error,
      data,
      requestBody,
    )
    logGithubFunctionDebug(debug)
    return { ok: false, message }
  }

  const payload = data as Record<string, unknown> | null

  if (payload?.ok === false) {
    const fnError = readFunctionError(payload)
    return fail(
      friendlyFunctionError(fnError ?? undefined, GITHUB_LIST_AVAILABLE_USER_MESSAGE),
    )
  }

  if (error) {
    return fail(
      friendlyFunctionError(
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : undefined,
        GITHUB_LIST_AVAILABLE_USER_MESSAGE,
      ),
    )
  }

  if (payload?.ok !== true) {
    const fnError = readFunctionError(payload)
    return fail(
      friendlyFunctionError(fnError ?? undefined, GITHUB_LIST_AVAILABLE_USER_MESSAGE),
    )
  }

  const installations = Array.isArray(payload.installations)
    ? payload.installations
        .map(parseAvailableInstallation)
        .filter((row): row is GithubAvailableInstallation => row !== null)
    : []

  const repositories = Array.isArray(payload.repositories)
    ? payload.repositories
        .map(parseAvailableRepository)
        .filter((row): row is GithubAvailableRepository => row !== null)
    : []

  const invalid_installations = Array.isArray(payload.invalid_installations)
    ? payload.invalid_installations
        .map(parseInvalidInstallation)
        .filter((row): row is GithubInvalidInstallation => row !== null)
    : []

  return {
    ok: true,
    installations,
    repositories,
    invalid_installations,
  }
}

export type CompleteGithubInstallationResult =
  | { ok: true; data: GithubCompleteInstallationResult }
  | {
      ok: false
      message: string
      /** Mensagem retornada pela Edge Function (quando existir). */
      serverMessage: string | null
      code: string | null
      step: string | null
      details: Record<string, unknown> | null
      debug: GithubFunctionDebugInfo
    }

const RAW_TEXT_DEBUG_MAX = 12000

function truncateForDebug(text: string, max = RAW_TEXT_DEBUG_MAX): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export async function completeGithubInstallation(input: {
  installation_id: number
  setup_action?: string | null
  state: string
}): Promise<CompleteGithubInstallationResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  const requestBody = {
    installation_id: input.installation_id,
    setup_action: input.setup_action ?? null,
    state: input.state,
  }

  const baseDebug = (partial: Partial<GithubFunctionDebugInfo>): GithubFunctionDebugInfo => ({
    functionName: GITHUB_COMPLETE_INSTALLATION_FUNCTION,
    requestBody,
    responseBody: null,
    ...partial,
  })

  if (!supabaseUrl || !anonKey) {
    const debug = baseDebug({})
    logGithubFunctionDebug(debug, { code: null, step: null })
    return {
      ok: false,
      message: 'Configuração do Supabase ausente no cliente.',
      serverMessage: null,
      code: null,
      step: null,
      details: null,
      debug,
    }
  }

  const client = getSupabaseClient()
  const {
    data: { session },
  } = await client.auth.getSession()
  const accessToken = session?.access_token

  if (!accessToken) {
    const debug = baseDebug({ status: 401 })
    logGithubFunctionDebug(debug, { code: 'not_authenticated', step: 'validate_user' })
    return {
      ok: false,
      message: COMPLETE_CODE_MESSAGES.not_authenticated,
      serverMessage: 'Sessão sem access_token.',
      code: 'not_authenticated',
      step: 'validate_user',
      details: null,
      debug,
    }
  }

  const functionUrl = `${supabaseUrl}/functions/v1/${GITHUB_COMPLETE_INSTALLATION_FUNCTION}`

  let response: Response
  try {
    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: anonKey,
      },
      body: JSON.stringify(requestBody),
    })
  } catch (e) {
    const name = e instanceof Error ? e.name : 'network_error'
    const msg = e instanceof Error ? e.message : 'fetch failed'
    const debug = baseDebug({
      errorMessage: msg,
    })
    logGithubFunctionDebug(debug, { code: null, step: null })
    return {
      ok: false,
      message: GITHUB_COMPLETE_USER_MESSAGE,
      serverMessage: `${name}: ${msg}`,
      code: null,
      step: null,
      details: null,
      debug,
    }
  }

  const rawText = await response.text()
  let body: Record<string, unknown> | null = null
  try {
    body = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null
  } catch {
    body = null
  }

  const payload = body
  const details = readFunctionDetails(payload)

  const rawTextForDebug =
    body === null && rawText.length > 0 ? truncateForDebug(rawText) : null

  const edgeMessageFromPayload = (): string | null => {
    if (payload && typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim()
    }
    return readFunctionError(payload)
  }

  const buildFail = (
    message: string,
    serverMessage: string | null,
    code: string | null,
    step: string | null,
    failDetails: Record<string, unknown> | null,
    status: number,
  ): CompleteGithubInstallationResult => {
    const debug: GithubFunctionDebugInfo = {
      functionName: GITHUB_COMPLETE_INSTALLATION_FUNCTION,
      status,
      responseBody: body,
      requestBody,
      rawText: rawTextForDebug,
    }
    logGithubFunctionDebug(debug, { code, step, details: failDetails })
    return {
      ok: false,
      message,
      serverMessage,
      code,
      step,
      details: failDetails,
      debug,
    }
  }

  if (!response.ok) {
    const step = readFunctionStep(payload)
    const code = readFunctionCode(payload)
    const serverMsg =
      edgeMessageFromPayload() ??
      (response.status === 500 && body === null
        ? 'Function retornou 500 sem corpo. Verificar Supabase Edge Logs.'
        : 'Edge Function retornou erro sem mensagem.')
    const failure = parseFunctionFailure(payload, null, serverMsg, COMPLETE_CODE_MESSAGES)
    const friendly =
      (code && COMPLETE_CODE_MESSAGES[code]) ||
      failure.message ||
      friendlyFunctionError(serverMsg, GITHUB_COMPLETE_USER_MESSAGE)
    return buildFail(
      friendly,
      serverMsg,
      code ?? failure.code,
      step ?? failure.step,
      details,
      response.status,
    )
  }

  if (body?.ok === false) {
    const step = readFunctionStep(payload)
    const code = readFunctionCode(payload)
    const serverMsg =
      edgeMessageFromPayload() ?? 'Edge Function retornou ok: false sem mensagem.'
    const failure = parseFunctionFailure(payload, null, serverMsg, COMPLETE_CODE_MESSAGES)
    const friendly =
      (code && COMPLETE_CODE_MESSAGES[code]) ||
      failure.message ||
      friendlyFunctionError(serverMsg, GITHUB_COMPLETE_USER_MESSAGE)
    return buildFail(
      friendly,
      serverMsg,
      code ?? failure.code,
      step ?? failure.step,
      details,
      response.status,
    )
  }

  if (body?.ok !== true) {
    const serverMsg =
      edgeMessageFromPayload() ?? 'Resposta inválida ao conectar com o GitHub.'
    return buildFail(
      friendlyFunctionError(serverMsg, GITHUB_COMPLETE_USER_MESSAGE),
      serverMsg,
      readFunctionCode(payload),
      readFunctionStep(payload),
      details,
      response.status,
    )
  }

  const projectId = typeof payload?.project_id === 'string' ? payload.project_id : null
  const installationId =
    typeof payload?.installation_id === 'number' ? payload.installation_id : null
  const repositories = Array.isArray(payload?.repositories)
    ? (payload.repositories as Record<string, unknown>[])
        .map((repo): GithubSelectableRepository | null => {
          const githubId =
            typeof repo.github_repository_id === 'number'
              ? repo.github_repository_id
              : typeof repo.id === 'number'
                ? repo.id
                : null
          const fullName = typeof repo.full_name === 'string' ? repo.full_name : null
          if (!githubId || !fullName) return null

          const ownerLogin =
            typeof repo.owner_login === 'string'
              ? repo.owner_login
              : fullName.includes('/')
                ? fullName.split('/')[0]!
                : ''
          const repoName =
            typeof repo.repo_name === 'string'
              ? repo.repo_name
              : typeof repo.name === 'string'
                ? repo.name
                : fullName.includes('/')
                  ? fullName.split('/')[1]!
                  : fullName

          return {
            github_repository_id: githubId,
            owner_login: ownerLogin,
            repo_name: repoName,
            full_name: fullName,
            default_branch:
              typeof repo.default_branch === 'string' ? repo.default_branch : 'main',
            private: Boolean(repo.private),
            html_url: typeof repo.html_url === 'string' ? repo.html_url : '',
          }
        })
        .filter((repo): repo is GithubSelectableRepository => repo !== null)
    : []

  if (!projectId || !installationId) {
    return buildFail(
      'Resposta inválida ao conectar com o GitHub.',
      edgeMessageFromPayload(),
      'unknown_error',
      null,
      details,
      response.status,
    )
  }

  return {
    ok: true,
    data: {
      project_id: projectId,
      project_slug:
        typeof payload?.project_slug === 'string' ? payload.project_slug : null,
      installation_id: installationId,
      setup_action:
        typeof payload?.setup_action === 'string' ? payload.setup_action : null,
      repositories,
    },
  }
}

export async function linkSelectedGithubRepository(input: {
  project_id: string
  installation_id: number
  github_repository_id: number
  commit_visibility?: GithubCommitVisibility
}): Promise<
  | {
      ok: true
      repository_id: string
      full_name: string
      private: boolean
      default_branch: string
      total_commits_imported: number
    }
  | { ok: false; message: string }
> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('github-link-selected-repository', {
    body: {
      project_id: input.project_id,
      installation_id: input.installation_id,
      github_repository_id: input.github_repository_id,
      commit_visibility: input.commit_visibility ?? 'members',
    },
  })

  if (error) {
    return {
      ok: false,
      message: friendlyFunctionError(
        error.message,
        'Não foi possível vincular o repositório.',
      ),
    }
  }

  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (fnError) {
    return {
      ok: false,
      message: friendlyFunctionError(fnError, 'Não foi possível vincular o repositório.'),
    }
  }

  const repositoryId = typeof payload?.repository_id === 'string' ? payload.repository_id : null
  if (!repositoryId) {
    return { ok: false, message: 'Resposta inválida ao vincular o repositório.' }
  }

  return {
    ok: true,
    repository_id: repositoryId,
    full_name: typeof payload?.full_name === 'string' ? payload.full_name : '',
    private: Boolean(payload?.private),
    default_branch:
      typeof payload?.default_branch === 'string' ? payload.default_branch : 'main',
    total_commits_imported:
      typeof payload?.total_commits_imported === 'number'
        ? payload.total_commits_imported
        : 0,
  }
}

/** Modo legado (owner + repo manual). Mantido para compatibilidade. */
export async function linkProjectGithubRepository(input: {
  project_id: string
  installation_id: number
  owner: string
  repo: string
  commit_visibility?: GithubCommitVisibility
}): Promise<
  | {
      ok: true
      repository_id: string
      full_name: string
      private: boolean
      default_branch: string
      total_commits_imported: number
    }
  | { ok: false; message: string }
> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('github-link-repository', {
    body: {
      project_id: input.project_id,
      installation_id: input.installation_id,
      owner: input.owner.trim(),
      repo: input.repo.trim(),
      commit_visibility: input.commit_visibility ?? 'members',
    },
  })

  if (error) {
    return {
      ok: false,
      message: friendlyFunctionError(
        error.message,
        'Não foi possível vincular o repositório.',
      ),
    }
  }

  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (fnError) {
    return {
      ok: false,
      message: friendlyFunctionError(fnError, 'Não foi possível vincular o repositório.'),
    }
  }

  const repositoryId = typeof payload?.repository_id === 'string' ? payload.repository_id : null
  if (!repositoryId) {
    return { ok: false, message: 'Resposta inválida ao vincular o repositório.' }
  }

  return {
    ok: true,
    repository_id: repositoryId,
    full_name: typeof payload?.full_name === 'string' ? payload.full_name : '',
    private: Boolean(payload?.private),
    default_branch:
      typeof payload?.default_branch === 'string' ? payload.default_branch : 'main',
    total_commits_imported:
      typeof payload?.total_commits_imported === 'number'
        ? payload.total_commits_imported
        : 0,
  }
}

export async function syncProjectGithubRepository(
  projectRepositoryId: string,
): Promise<{ ok: true; commits_synced: number } | { ok: false; message: string }> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('github-sync-repository', {
    body: { project_repository_id: projectRepositoryId },
  })

  if (error) {
    return { ok: false, message: friendlyFunctionError(error.message, 'Não foi possível sincronizar.') }
  }

  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (fnError) {
    return { ok: false, message: friendlyFunctionError(fnError, 'Não foi possível sincronizar.') }
  }

  return {
    ok: true,
    commits_synced:
      typeof payload?.commits_synced === 'number' ? payload.commits_synced : 0,
  }
}

export async function unlinkProjectGithubRepository(
  projectRepositoryId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = getSupabaseClient()

  const rpc = await client.rpc('unlink_project_github_repository', {
    p_project_repository_id: projectRepositoryId,
  })

  if (!rpc.error) {
    return { ok: true }
  }

  const alt = await client.rpc('unlink_project_github_repository', {
    project_repository_id: projectRepositoryId,
  })

  if (!alt.error) {
    return { ok: true }
  }

  return {
    ok: false,
    message: 'Não foi possível desconectar o repositório.',
  }
}

export async function updateGithubCommitVisibility(
  projectRepositoryId: string,
  commitVisibility: GithubCommitVisibility,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = getSupabaseClient()

  const rpc = await client.rpc('update_project_github_repository_visibility', {
    p_project_repository_id: projectRepositoryId,
    p_commit_visibility: commitVisibility,
  })

  if (!rpc.error) {
    return { ok: true }
  }

  const alt = await client.rpc('update_project_github_repository_visibility', {
    project_repository_id: projectRepositoryId,
    commit_visibility: commitVisibility,
  })

  if (!alt.error) {
    return { ok: true }
  }

  return {
    ok: false,
    message: 'Não foi possível atualizar a visibilidade dos commits.',
  }
}
