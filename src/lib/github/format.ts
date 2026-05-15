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
