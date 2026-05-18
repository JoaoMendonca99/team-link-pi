export type GithubCommitVisibility = 'members' | 'public'

export type GithubActivitySource = 'commits' | 'releases' | 'both'

export interface GithubRepositoryLink {
  id: string
  project_id: string
  installation_id: number
  github_repository_id: number
  owner_login: string
  repo_name: string
  full_name: string
  default_branch: string
  private: boolean
  html_url: string
  commit_visibility: GithubCommitVisibility
  activity_source: GithubActivitySource
  is_active: boolean
  last_synced_at: string | null
  linked_at: string | null
}

export interface GithubReleaseAsset {
  id?: number
  name?: string
  size?: number
  browser_download_url?: string | null
  download_count?: number
  content_type?: string | null
}

export interface GithubReleaseItem {
  id: string | null
  project_repository_id: string | null
  project_id: string | null
  repository_full_name: string | null
  github_release_id: number
  tag_name: string
  name: string | null
  body: string | null
  html_url: string | null
  draft: boolean
  prerelease: boolean
  author_login: string | null
  published_at: string | null
  assets: GithubReleaseAsset[]
}

export interface GithubCommitItem {
  id: string | null
  project_repository_id: string | null
  project_id: string | null
  github_repository_id: number | null
  sha: string
  short_sha: string | null
  message: string
  author_name: string | null
  author_email: string | null
  github_username: string | null
  committed_at: string
  branch: string
  commit_url: string | null
  additions: number | null
  deletions: number | null
  changed_files: number | null
  files: Record<string, unknown> | null
}

/** Repositório listado após instalação do GitHub App (sem tokens). */
export interface GithubSelectableRepository {
  github_repository_id: number
  owner_login: string
  repo_name: string
  full_name: string
  default_branch: string
  private: boolean
  html_url: string
}

export interface GithubCompleteInstallationResult {
  project_id: string
  project_slug: string | null
  installation_id: number
  setup_action: string | null
  repositories: GithubSelectableRepository[]
}

/** Instalação GitHub ativa disponível para o usuário logado. */
export interface GithubAvailableInstallation {
  installation_id: number
  account_login: string
  account_type: string
  status: string
}

/** Repositório autorizado em uma instalação, com flags de vínculo no Team Link. */
export interface GithubAvailableRepository {
  installation_id: number
  github_repository_id: number
  owner_login: string
  repo_name: string
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
  linked_to_current_project: boolean
  current_project_repository_id: string | null
  linked_elsewhere: boolean
}

export interface GithubInvalidInstallation {
  installation_id: number
  account_login: string
  reason: string
}

export type ListAvailableGithubRepositoriesResult =
  | {
      ok: true
      installations: GithubAvailableInstallation[]
      repositories: GithubAvailableRepository[]
      invalid_installations: GithubInvalidInstallation[]
    }
  | { ok: false; message: string }
