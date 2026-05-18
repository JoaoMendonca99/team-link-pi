export function shortSha(sha: string, shortShaFromDb?: string | null): string {
  const fromDb = shortShaFromDb?.trim()
  if (fromDb) return fromDb
  return sha.slice(0, 7)
}

export function formatCommitDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeCommitDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return 'agora'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `há ${diffMin} min`
  const diffHours = Math.round(diffMin / 60)
  if (diffHours < 24) return `há ${diffHours} h`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `há ${diffDays} dia${diffDays === 1 ? '' : 's'}`
  return formatCommitDate(iso)
}

export function formatSyncDate(iso: string | null | undefined): string {
  if (!iso) return 'Ainda não sincronizado'
  return formatRelativeCommitDate(iso)
}

export function commitVisibilityLabel(visibility: string | null | undefined): string {
  if (visibility === 'public') return 'Público no Team Link'
  return 'Somente membros'
}

export function activitySourceLabel(source: string | null | undefined): string {
  if (source === 'releases') return 'Releases'
  if (source === 'both') return 'Commits e releases'
  return 'Commits'
}

export function releaseDisplayName(release: {
  tag_name: string
  name: string | null
}): string {
  const name = release.name?.trim()
  if (name && name !== release.tag_name) return name
  return release.tag_name
}

export function releaseBodyPreview(body: string | null, maxLength = 220): string {
  if (!body?.trim()) return ''
  const normalized = body.trim().replace(/\s+/g, ' ')
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength)}…`
}

export function releaseAuthorLabel(release: { author_login: string | null }): string {
  return release.author_login?.trim() || 'Autor desconhecido'
}

export function formatReleaseAssetSize(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function listChangedFiles(files: Record<string, unknown> | null): string[] {
  if (!files) return []
  const added = Array.isArray(files.added)
    ? files.added.filter((item): item is string => typeof item === 'string')
    : []
  const removed = Array.isArray(files.removed)
    ? files.removed.filter((item): item is string => typeof item === 'string')
    : []
  const modified = Array.isArray(files.modified)
    ? files.modified.filter((item): item is string => typeof item === 'string')
    : []
  return [...added, ...removed, ...modified]
}

export function authorLabel(commit: {
  author_name: string | null
  github_username: string | null
}): string {
  return (
    commit.author_name?.trim() ||
    commit.github_username?.trim() ||
    'Autor desconhecido'
  )
}
