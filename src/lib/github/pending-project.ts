const STORAGE_KEY = 'teamlink_pending_github_project'

export interface PendingGithubProject {
  project_id: string
  project_slug: string
  panel_url: string
  saved_at: number
}

export function savePendingGithubProject(input: PendingGithubProject): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(input))
  } catch {
    // ignore quota / private mode
  }
}

export function readPendingGithubProject(): PendingGithubProject | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingGithubProject
    if (!parsed?.project_id || typeof parsed.project_id !== 'string') return null
    return {
      project_id: parsed.project_id,
      project_slug: typeof parsed.project_slug === 'string' ? parsed.project_slug : '',
      panel_url:
        typeof parsed.panel_url === 'string' && parsed.panel_url.startsWith('/')
          ? parsed.panel_url
          : parsed.project_slug
            ? `/projetos/${parsed.project_slug}/painel`
            : '',
      saved_at: typeof parsed.saved_at === 'number' ? parsed.saved_at : 0,
    }
  } catch {
    return null
  }
}

export function clearPendingGithubProject(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
