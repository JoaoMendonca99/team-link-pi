import { getSupabaseClient } from '@/lib/supabase/client'

import type { GithubCommitVisibility } from './types'

function friendlyFunctionError(message: string | undefined): string {
  const normalized = (message ?? '').toLowerCase()
  if (normalized.includes('not authorized') || normalized.includes('403')) {
    return 'Você não tem permissão para esta ação.'
  }
  if (normalized.includes('jwt') || normalized.includes('autenticação')) {
    return 'Sessão expirada. Entre novamente.'
  }
  return 'Não foi possível concluir a operação agora. Tente novamente em instantes.'
}

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
    return { ok: false, message: friendlyFunctionError(error.message) }
  }

  const payload = data as Record<string, unknown> | null
  if (payload?.error && typeof payload.error === 'string') {
    return { ok: false, message: payload.error }
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
    return { ok: false, message: friendlyFunctionError(error.message) }
  }

  const payload = data as Record<string, unknown> | null
  if (payload?.error && typeof payload.error === 'string') {
    return { ok: false, message: payload.error }
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
