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

  if (error) {
    return fail(
      friendlyFunctionError(error.message, GITHUB_START_USER_MESSAGE),
    )
  }

  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (fnError) {
    return fail(friendlyFunctionError(fnError, GITHUB_START_USER_MESSAGE))
  }

  const installUrl = typeof payload?.install_url === 'string' ? payload.install_url : null
  if (!installUrl) {
    return fail(GITHUB_START_USER_MESSAGE)
  }

  return { ok: true, install_url: installUrl }
}

export async function completeGithubInstallation(input: {
  installation_id: number
  setup_action?: string | null
  state: string
}): Promise<
  { ok: true; data: GithubCompleteInstallationResult } | { ok: false; message: string }
> {
  const client = getSupabaseClient()
  const { data, error } = await client.functions.invoke('github-complete-installation', {
    body: {
      installation_id: input.installation_id,
      setup_action: input.setup_action ?? null,
      state: input.state,
    },
  })

  if (error) {
    return {
      ok: false,
      message: friendlyFunctionError(
        error.message,
        'Não foi possível carregar os repositórios autorizados.',
      ),
    }
  }

  const payload = data as Record<string, unknown> | null
  const fnError = readFunctionError(payload)
  if (fnError) {
    return {
      ok: false,
      message: friendlyFunctionError(
        fnError,
        'Não foi possível carregar os repositórios autorizados.',
      ),
    }
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
    return { ok: false, message: 'Resposta inválida ao conectar com o GitHub.' }
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
