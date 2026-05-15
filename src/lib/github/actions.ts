import { getSupabaseClient } from '@/lib/supabase/client'

import {
  buildGithubFunctionDebug,
  logGithubFunctionDebug,
  type GithubFunctionDebugInfo,
} from './function-debug'
import type {
  GithubCommitVisibility,
  GithubCompleteInstallationResult,
  GithubSelectableRepository,
} from './types'

export const GITHUB_START_INSTALLATION_FUNCTION = 'github-start-installation'

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
  expired_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  invalid_state: 'A conexão expirou. Inicie novamente pelo painel do projeto.',
  missing_state: 'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
  missing_installation_id:
    'Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.',
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

export type CompleteGithubInstallationResult =
  | { ok: true; data: GithubCompleteInstallationResult }
  | {
      ok: false
      message: string
      code: string | null
      step: string | null
      debug: GithubFunctionDebugInfo
    }

export async function completeGithubInstallation(input: {
  installation_id: number
  setup_action?: string | null
  state: string
}): Promise<CompleteGithubInstallationResult> {
  const client = getSupabaseClient()
  const requestBody = {
    installation_id: input.installation_id,
    setup_action: input.setup_action ?? null,
    state: input.state,
  }
  const { data, error } = await client.functions.invoke(GITHUB_COMPLETE_INSTALLATION_FUNCTION, {
    body: requestBody,
  })

  const payload = data as Record<string, unknown> | null

  const fail = (
    message: string,
    code: string | null = null,
    step: string | null = null,
  ): CompleteGithubInstallationResult => {
    const debug = buildGithubFunctionDebug(
      GITHUB_COMPLETE_INSTALLATION_FUNCTION,
      error,
      data,
      requestBody,
    )
    logGithubFunctionDebug(debug, { code, step })
    return { ok: false, message, code, step, debug }
  }

  const failure = parseFunctionFailure(
    payload,
    error,
    GITHUB_COMPLETE_USER_MESSAGE,
    COMPLETE_CODE_MESSAGES,
  )

  if (error || readFunctionError(payload) || readFunctionCode(payload)) {
    return fail(failure.message, failure.code, failure.step)
  }

  const projectId = typeof payload?.project_id === 'string' ? payload.project_id : null
  const installationId =
    typeof payload?.installation_id === 'number' ? payload.installation_id : null
  const repositories = Array.isArray(payload?.repositories)
    ? (payload.repositories as GithubSelectableRepository[]).filter(
        (repo) =>
          typeof repo?.github_repository_id === 'number' &&
          typeof repo?.full_name === 'string',
      )
    : []

  if (!projectId || !installationId) {
    return fail('Resposta inválida ao conectar com o GitHub.', 'unknown_error')
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
