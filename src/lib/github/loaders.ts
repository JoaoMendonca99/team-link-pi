import { getSupabaseClient } from '@/lib/supabase/client'

import type {
  GithubActivitySource,
  GithubCommitItem,
  GithubReleaseAsset,
  GithubReleaseItem,
  GithubRepositoryLink,
} from './types'

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

function parseActivitySource(value: unknown): GithubActivitySource {
  if (value === 'releases' || value === 'both') return value
  return 'commits'
}

function parseReleaseAssets(value: unknown): GithubReleaseAsset[] {
  if (!Array.isArray(value)) return []
  const assets: GithubReleaseAsset[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const name = asString(row.name)
    if (!name) continue
    assets.push({
      id: asNumber(row.id) ?? undefined,
      name,
      size: asNumber(row.size) ?? undefined,
      browser_download_url: asString(row.browser_download_url),
      download_count: asNumber(row.download_count) ?? undefined,
      content_type: asString(row.content_type),
    })
  }
  return assets
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
    activity_source: parseActivitySource(row.activity_source),
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
      'id, project_id, installation_id, github_repository_id, owner_login, repo_name, full_name, default_branch, private, html_url, commit_visibility, activity_source, is_active, last_synced_at, linked_at',
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

function mapRelease(row: Record<string, unknown>): GithubReleaseItem | null {
  const githubReleaseId = asNumber(row.github_release_id)
  const tagName = asString(row.tag_name)
  if (!githubReleaseId || !tagName) return null

  return {
    id: asString(row.id),
    project_repository_id: asString(row.project_repository_id),
    project_id: asString(row.project_id),
    repository_full_name: asString(row.repository_full_name),
    github_release_id: githubReleaseId,
    tag_name: tagName,
    name: asString(row.name),
    body: asString(row.body),
    html_url: asString(row.html_url),
    draft: asBoolean(row.draft),
    prerelease: asBoolean(row.prerelease),
    author_login: asString(row.author_login),
    published_at: asString(row.published_at),
    assets: parseReleaseAssets(row.assets),
  }
}

export async function loadProjectGithubReleases(
  projectId: string,
  limit = 5,
): Promise<GithubReleaseItem[]> {
  const client = getSupabaseClient()

  const rpc = await client.rpc('get_project_github_releases', {
    p_project_id: projectId,
    p_limit: limit,
    p_offset: 0,
  })

  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as Record<string, unknown>[])
      .map(mapRelease)
      .filter((row): row is GithubReleaseItem => Boolean(row))
      .slice(0, limit)
  }

  if (rpc.error && !isMissingRpc(rpc.error)) {
    throw new Error('Não foi possível carregar as releases.')
  }

  const direct = await client
    .from('project_github_releases')
    .select(
      'id, project_repository_id, project_id, github_release_id, tag_name, name, body, html_url, draft, prerelease, author_login, published_at, assets',
    )
    .eq('project_id', projectId)
    .eq('is_active', true)
    .order('published_at', { ascending: false })
    .limit(limit)

  if (direct.error) {
    if (isMissingRpc(rpc.error)) return []
    throw new Error('Não foi possível carregar as releases.')
  }

  return ((direct.data ?? []) as Record<string, unknown>[])
    .map(mapRelease)
    .filter((row): row is GithubReleaseItem => Boolean(row))
}
