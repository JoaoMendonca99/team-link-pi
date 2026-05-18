import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import {
  createInstallationAccessToken,
  fetchInstallation,
  type GitHubRepo,
} from './github-app.ts'
import {
  insertSyncLog,
  touchRepositorySync,
  upsertGithubInstallation,
  upsertProjectRepository,
  type CommitVisibility,
} from './github-db.ts'
import { syncRepositoryByActivitySource } from './github-sync-core.ts'
import type { ActivitySource } from './github-schema.ts'

export interface LinkProjectRepositoryResult {
  repository_id: string
  full_name: string
  private: boolean
  default_branch: string
  activity_source: ActivitySource
  total_commits_imported: number
  total_releases_imported: number
}

export async function linkProjectRepositoryCore(
  admin: SupabaseClient,
  userId: string,
  input: {
    project_id: string
    installation_id: number
    repository: GitHubRepo
    commit_visibility: CommitVisibility
    activity_source?: ActivitySource
    linked_via: string
  },
): Promise<LinkProjectRepositoryResult> {
  const activitySource = input.activity_source ?? 'commits'
  const installationMeta = await fetchInstallation(input.installation_id)
  const accessToken = await createInstallationAccessToken(input.installation_id)

  const installationUpsert = await upsertGithubInstallation(admin, installationMeta, userId)
  if (!installationUpsert.ok) {
    throw new Error(
      installationUpsert.supabase_error_message ?? 'Falha ao salvar instalação GitHub.',
    )
  }

  const linkedRepository = await upsertProjectRepository(admin, {
    project_id: input.project_id,
    installation_id: input.installation_id,
    github_repository_id: input.repository.id,
    owner_login: input.repository.owner.login,
    repo_name: input.repository.name,
    full_name: input.repository.full_name,
    default_branch: input.repository.default_branch,
    private: input.repository.private,
    html_url: input.repository.html_url,
    commit_visibility: input.commit_visibility,
    activity_source: activitySource,
    linked_by: userId,
    metadata: {
      linked_via: input.linked_via,
    },
  })

  const { commits_synced, releases_synced } = await syncRepositoryByActivitySource(
    admin,
    linkedRepository,
    accessToken,
    activitySource,
  )

  await touchRepositorySync(admin, linkedRepository.id)

  await insertSyncLog(admin, {
    project_id: input.project_id,
    project_repository_id: linkedRepository.id,
    action: 'link',
    status: 'success',
    message: 'Repositório vinculado com sucesso.',
    commits_synced,
    releases_synced,
  })

  return {
    repository_id: linkedRepository.id,
    full_name: linkedRepository.full_name,
    private: linkedRepository.private,
    default_branch: linkedRepository.default_branch,
    activity_source: activitySource,
    total_commits_imported: commits_synced,
    total_releases_imported: releases_synced,
  }
}
