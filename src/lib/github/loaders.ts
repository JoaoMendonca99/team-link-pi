import { getSupabaseClient } from '@/lib/supabase/client'

import type { GithubCommitItem, GithubRepositoryLink } from './types'

interface SupabaseLikeError {
  code?: string | null
  message?: string | null
}

function isMissingRpc(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist'))
  )
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return false
}

function mapRepository(row: Record<string, unknown>): GithubRepositoryLink | null {
  const id = asString(row.id)
  const projectId = asString(row.project_id)
  if (!id || !projectId) return null

  return {
    id,
    project_id: projectId,
    installation_id: asNumber(row.installation_id) ?? 0,
    github_repository_id: asNumber(row.github_repository_id) ?? 0,
    owner_login: asString(row.owner_login) ?? '',
    repo_name: asString(row.repo_name) ?? '',
    full_name: asString(row.full_name) ?? '',
    default_branch: asString(row.default_branch) ?? 'main',
    private: asBoolean(row.private),
    html_url: asString(row.html_url) ?? '',
    commit_visibility:
      asString(row.commit_visibility) === 'public' ? 'public' : 'members',
    is_active: row.is_active === undefined ? true : asBoolean(row.is_active),
    last_synced_at: asString(row.last_synced_at),
    linked_at: asString(row.linked_at),
  }
}

function mapCommit(row: Record<string, unknown>): GithubCommitItem | null {
  const sha = asString(row.sha)
  if (!sha) return null

  const filesRaw = row.files
  const files =
    filesRaw && typeof filesRaw === 'object' && !Array.isArray(filesRaw)
      ? (filesRaw as Record<string, unknown>)
      : null

  return {
    id: asString(row.id),
    project_repository_id: asString(row.project_repository_id),
    project_id: asString(row.project_id),
    github_repository_id: asNumber(row.github_repository_id),
    sha,
    short_sha: asString(row.short_sha),
    message: asString(row.message) ?? '',
    author_name: asString(row.author_name),
    author_email: asString(row.author_email),
    github_username: asString(row.github_username),
    committed_at: asString(row.committed_at) ?? new Date().toISOString(),
    branch: asString(row.branch) ?? 'main',
    commit_url: asString(row.commit_url),
    additions: asNumber(row.additions),
    deletions: asNumber(row.deletions),
    changed_files: asNumber(row.changed_files),
    files,
  }
}

export async function loadProjectGithubRepository(
  projectId: string,
): Promise<GithubRepositoryLink | null> {
  const client = getSupabaseClient()

  const rpc = await client.rpc('get_project_github_repositories', {
    p_project_id: projectId,
  })

  if (!rpc.error && Array.isArray(rpc.data)) {
    const rows = rpc.data as Record<string, unknown>[]
    const active = rows
      .map(mapRepository)
      .filter((row): row is GithubRepositoryLink => Boolean(row && row.is_active))
    if (active.length > 0) {
      return active.sort((a, b) => {
        const aTime = a.linked_at ? Date.parse(a.linked_at) : 0
        const bTime = b.linked_at ? Date.parse(b.linked_at) : 0
        return bTime - aTime
      })[0]!
    }
    const any = rows.map(mapRepository).find(Boolean)
    if (any) return any
  }

  if (rpc.error && !isMissingRpc(rpc.error)) {
    throw new Error('Não foi possível carregar o repositório GitHub.')
  }

  const direct = await client
    .from('project_github_repositories')
    .select(
      'id, project_id, installation_id, github_repository_id, owner_login, repo_name, full_name, default_branch, private, html_url, commit_visibility, is_active, last_synced_at, linked_at',
    )
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('linked_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (direct.error) {
    if (isMissingRpc(rpc.error)) return null
    throw new Error('Não foi possível carregar o repositório GitHub.')
  }

  if (!direct.data) return null
  return mapRepository(direct.data as Record<string, unknown>)
}

export async function loadProjectGithubCommits(
  projectId: string,
  limit = 5,
): Promise<GithubCommitItem[]> {
  const client = getSupabaseClient()

  const rpc = await client.rpc('get_project_github_commits', {
    p_project_id: projectId,
    p_limit: limit,
  })

  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as Record<string, unknown>[])
      .map(mapCommit)
      .filter((row): row is GithubCommitItem => Boolean(row))
      .slice(0, limit)
  }

  if (rpc.error && !isMissingRpc(rpc.error)) {
    throw new Error('Não foi possível carregar os commits.')
  }

  const direct = await client
    .from('project_github_commits')
    .select(
      'id, project_repository_id, project_id, github_repository_id, sha, short_sha, message, author_name, author_email, github_username, committed_at, branch, commit_url, additions, deletions, changed_files, files',
    )
    .eq('project_id', projectId)
    .order('committed_at', { ascending: false })
    .limit(limit)

  if (direct.error) {
    if (isMissingRpc(rpc.error)) return []
    throw new Error('Não foi possível carregar os commits.')
  }

  return ((direct.data ?? []) as Record<string, unknown>[])
    .map(mapCommit)
    .filter((row): row is GithubCommitItem => Boolean(row))
}
