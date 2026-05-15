import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import type { GitHubInstallationMeta, NormalizedCommit } from './github-app.ts'
import {
  buildGithubInstallationRow,
  buildGithubSyncLogRow,
  buildGithubWebhookEventRow,
  buildProjectGithubCommitRow,
  buildProjectGithubRepositoryRow,
  PROJECT_GITHUB_REPOSITORY_SELECT,
  type CommitVisibility,
  type ProjectGithubRepositoryRow,
} from './github-schema.ts'

export type { CommitVisibility, ProjectGithubRepositoryRow }

export async function assertProjectManager(
  admin: SupabaseClient,
  projectId: string,
  userId: string,
  userClient?: SupabaseClient | null,
): Promise<boolean> {
  if (userClient) {
    const { data, error } = await userClient.rpc('github_is_project_manager', {
      p_project_id: projectId,
    })
    if (!error && data === true) return true
  }

  const { data: project } = await admin
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle()

  if (project?.owner_id === userId) return true

  const { data: member } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  return Boolean(member && (member.role === 'owner' || member.role === 'admin'))
}

export async function upsertGithubInstallation(
  admin: SupabaseClient,
  meta: GitHubInstallationMeta,
  createdBy: string,
): Promise<void> {
  const row = buildGithubInstallationRow({
    installation_id: meta.installation_id,
    app_id: meta.app_id,
    account_id: meta.account_id,
    account_login: meta.account_login,
    account_type: meta.account_type,
    target_type: meta.target_type,
    status: meta.status,
    created_by: createdBy,
    metadata: {},
  })

  const { error } = await admin.from('github_installations').upsert(row, {
    onConflict: 'installation_id',
  })

  if (error) {
    throw new Error('Não foi possível salvar a instalação do GitHub.')
  }
}

export async function upsertProjectRepository(
  admin: SupabaseClient,
  input: {
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
    linked_by: string
    metadata?: Record<string, unknown>
  },
): Promise<ProjectGithubRepositoryRow> {
  const now = new Date().toISOString()
  const row = buildProjectGithubRepositoryRow({
    project_id: input.project_id,
    installation_id: input.installation_id,
    github_repository_id: input.github_repository_id,
    owner_login: input.owner_login,
    repo_name: input.repo_name,
    full_name: input.full_name,
    default_branch: input.default_branch,
    private: input.private,
    html_url: input.html_url,
    commit_visibility: input.commit_visibility,
    is_active: true,
    linked_by: input.linked_by,
    linked_at: now,
    metadata: input.metadata ?? {},
  })

  const { data, error } = await admin
    .from('project_github_repositories')
    .upsert(row, { onConflict: 'project_id,github_repository_id' })
    .select(PROJECT_GITHUB_REPOSITORY_SELECT)
    .single()

  if (error || !data) {
    throw new Error('Não foi possível vincular o repositório ao projeto.')
  }

  return data as ProjectGithubRepositoryRow
}

export async function getProjectRepositoryById(
  admin: SupabaseClient,
  projectRepositoryId: string,
): Promise<ProjectGithubRepositoryRow | null> {
  const { data, error } = await admin
    .from('project_github_repositories')
    .select(PROJECT_GITHUB_REPOSITORY_SELECT)
    .eq('id', projectRepositoryId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return null
  return (data as ProjectGithubRepositoryRow | null) ?? null
}

export async function upsertProjectCommits(
  admin: SupabaseClient,
  ctx: {
    project_repository_id: string
    project_id: string
    github_repository_id: number
    branch: string
  },
  commits: NormalizedCommit[],
): Promise<number> {
  if (commits.length === 0) return 0

  const rows = commits.map((commit) =>
    buildProjectGithubCommitRow({
      project_repository_id: ctx.project_repository_id,
      project_id: ctx.project_id,
      github_repository_id: ctx.github_repository_id,
      sha: commit.sha,
      message: commit.message,
      author_name: commit.author_name,
      author_email: commit.author_email,
      github_username: commit.github_username,
      committed_at: commit.committed_at,
      branch: ctx.branch,
      commit_url: commit.commit_url,
      additions: commit.additions,
      deletions: commit.deletions,
      changed_files: commit.changed_files,
      files: commit.files,
      raw_commit: commit.raw_commit,
    }),
  )

  const { error } = await admin.from('project_github_commits').upsert(rows, {
    onConflict: 'project_repository_id,sha',
  })

  if (error) {
    throw new Error('Não foi possível salvar os commits do repositório.')
  }

  return commits.length
}

export async function touchRepositorySync(
  admin: SupabaseClient,
  projectRepositoryId: string,
): Promise<void> {
  const { error } = await admin
    .from('project_github_repositories')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', projectRepositoryId)

  if (error) {
    throw new Error('Não foi possível atualizar a data de sincronização.')
  }
}

export async function insertSyncLog(
  admin: SupabaseClient,
  input: {
    project_id?: string | null
    project_repository_id?: string | null
    action: string
    status: string
    message?: string | null
    commits_synced?: number
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) }
  if (input.commits_synced !== undefined) {
    metadata.commits_synced = input.commits_synced
  }

  const row = buildGithubSyncLogRow({
    project_id: input.project_id ?? null,
    project_repository_id: input.project_repository_id ?? null,
    action: input.action,
    status: input.status,
    message: input.message ?? null,
    metadata,
  })

  const { error } = await admin.from('github_sync_logs').insert(row)
  if (error) {
    throw new Error('Não foi possível registrar o log de sincronização.')
  }
}

export async function insertWebhookEventIfNew(
  admin: SupabaseClient,
  input: {
    delivery_id: string
    event_type: string
    action: string | null
    installation_id: number | null
    github_repository_id: number | null
    metadata: Record<string, unknown>
  },
): Promise<'created' | 'duplicate'> {
  const { data: existing } = await admin
    .from('github_webhook_events')
    .select('delivery_id')
    .eq('delivery_id', input.delivery_id)
    .maybeSingle()

  if (existing) return 'duplicate'

  const row = buildGithubWebhookEventRow({
    delivery_id: input.delivery_id,
    event_type: input.event_type,
    action: input.action,
    installation_id: input.installation_id,
    github_repository_id: input.github_repository_id,
    processed: false,
    error_message: null,
    received_at: new Date().toISOString(),
    metadata: input.metadata,
  })

  const { error } = await admin.from('github_webhook_events').insert(row)

  if (error?.code === '23505') return 'duplicate'
  if (error) {
    throw new Error('Não foi possível registrar o evento do webhook.')
  }

  return 'created'
}

export async function markWebhookEvent(
  admin: SupabaseClient,
  deliveryId: string,
  processed: boolean,
  errorMessage: string | null,
): Promise<void> {
  const update: Record<string, unknown> = {
    processed,
    error_message: errorMessage,
  }
  if (processed) {
    update.processed_at = new Date().toISOString()
  }

  await admin.from('github_webhook_events').update(update).eq('delivery_id', deliveryId)
}

export async function findActiveRepositoriesByGithubId(
  admin: SupabaseClient,
  githubRepositoryId: number,
): Promise<ProjectGithubRepositoryRow[]> {
  const { data, error } = await admin
    .from('project_github_repositories')
    .select(PROJECT_GITHUB_REPOSITORY_SELECT)
    .eq('github_repository_id', githubRepositoryId)
    .eq('is_active', true)

  if (error || !data) return []
  return data as ProjectGithubRepositoryRow[]
}
