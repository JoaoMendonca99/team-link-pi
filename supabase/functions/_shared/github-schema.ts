/** Colunas permitidas por tabela — alinhado ao schema remoto do Supabase. */

export type CommitVisibility = 'members' | 'public'

export interface GithubInstallationInsert {
  installation_id: number
  app_id: number
  account_id: number | null
  account_login: string
  account_type: string
  target_type: string
  status: string
  created_by: string | null
  metadata: Record<string, unknown>
}

export interface ProjectGithubRepositoryInsert {
  project_id: string
  installation_id: number
  github_repository_id: number
  owner_login: string
  repo_name: string
  full_name: string
  default_branch: string
  private: boolean
  html_url: string
  commit_visibility: CommitVisibility
  is_active: boolean
  linked_by: string
  linked_at: string
  metadata: Record<string, unknown>
}

export interface ProjectGithubCommitInsert {
  project_repository_id: string
  project_id: string
  github_repository_id: number
  sha: string
  message: string
  author_name: string | null
  author_email: string | null
  github_username: string | null
  committed_at: string
  branch: string
  commit_url: string
  additions: number | null
  deletions: number | null
  changed_files: number | null
  files: Record<string, unknown> | unknown[] | null
  raw_commit: Record<string, unknown>
}

export interface GithubSyncLogInsert {
  project_id: string | null
  project_repository_id: string | null
  action: string
  status: string
  message: string | null
  metadata: Record<string, unknown>
}

export interface GithubWebhookEventInsert {
  delivery_id: string
  event_type: string
  action: string | null
  installation_id: number | null
  github_repository_id: number | null
  processed: boolean
  error_message: string | null
  received_at: string
  metadata: Record<string, unknown>
}

export interface ProjectGithubRepositoryRow {
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
  commit_visibility: CommitVisibility
  is_active: boolean
  last_synced_at: string | null
  linked_by: string | null
  linked_at: string | null
}

const INSTALLATION_KEYS = new Set([
  'installation_id',
  'app_id',
  'account_id',
  'account_login',
  'account_type',
  'target_type',
  'status',
  'created_by',
  'metadata',
] as const)

const REPOSITORY_KEYS = new Set([
  'project_id',
  'installation_id',
  'github_repository_id',
  'owner_login',
  'repo_name',
  'full_name',
  'default_branch',
  'private',
  'html_url',
  'commit_visibility',
  'is_active',
  'linked_by',
  'linked_at',
  'metadata',
] as const)

const COMMIT_KEYS = new Set([
  'project_repository_id',
  'project_id',
  'github_repository_id',
  'sha',
  'message',
  'author_name',
  'author_email',
  'github_username',
  'committed_at',
  'branch',
  'commit_url',
  'additions',
  'deletions',
  'changed_files',
  'files',
  'raw_commit',
] as const)

const SYNC_LOG_KEYS = new Set([
  'project_id',
  'project_repository_id',
  'action',
  'status',
  'message',
  'metadata',
] as const)

const WEBHOOK_EVENT_KEYS = new Set([
  'delivery_id',
  'event_type',
  'action',
  'installation_id',
  'github_repository_id',
  'processed',
  'error_message',
  'received_at',
  'metadata',
] as const)

function pickAllowed<T extends Record<string, unknown>>(
  input: T,
  allowed: Set<string>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in input) {
      row[key] = input[key]
    }
  }
  return row
}

export function buildGithubInstallationRow(
  input: GithubInstallationInsert,
): Record<string, unknown> {
  return pickAllowed(input as unknown as Record<string, unknown>, INSTALLATION_KEYS)
}

export function buildProjectGithubRepositoryRow(
  input: ProjectGithubRepositoryInsert,
): Record<string, unknown> {
  return pickAllowed(input as unknown as Record<string, unknown>, REPOSITORY_KEYS)
}

export function buildProjectGithubCommitRow(
  input: ProjectGithubCommitInsert,
): Record<string, unknown> {
  if (!input.sha?.trim()) {
    throw new Error('Commit inválido: sha ausente.')
  }

  const message =
    input.message != null && String(input.message).trim() !== ''
      ? String(input.message)
      : '(sem mensagem)'

  const committedAt =
    input.committed_at != null && String(input.committed_at).trim() !== ''
      ? String(input.committed_at)
      : '1970-01-01T00:00:00.000Z'

  const files = input.files != null ? input.files : []
  const raw_commit = input.raw_commit != null ? input.raw_commit : {}

  return pickAllowed(
    {
      project_repository_id: input.project_repository_id,
      project_id: input.project_id,
      github_repository_id: input.github_repository_id,
      sha: input.sha.trim(),
      message,
      author_name: input.author_name,
      author_email: input.author_email,
      github_username: input.github_username,
      committed_at: committedAt,
      branch: input.branch,
      commit_url: input.commit_url,
      additions: input.additions,
      deletions: input.deletions,
      changed_files: input.changed_files,
      files,
      raw_commit,
    } as unknown as Record<string, unknown>,
    COMMIT_KEYS,
  )
}

export function buildGithubSyncLogRow(input: GithubSyncLogInsert): Record<string, unknown> {
  return pickAllowed(input as unknown as Record<string, unknown>, SYNC_LOG_KEYS)
}

export function buildGithubWebhookEventRow(
  input: GithubWebhookEventInsert,
): Record<string, unknown> {
  return pickAllowed(input as unknown as Record<string, unknown>, WEBHOOK_EVENT_KEYS)
}

export const PROJECT_GITHUB_REPOSITORY_SELECT =
  'id, project_id, installation_id, github_repository_id, owner_login, repo_name, full_name, default_branch, private, html_url, commit_visibility, is_active, last_synced_at, linked_by, linked_at'
