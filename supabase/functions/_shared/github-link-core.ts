import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import {
  createInstallationAccessToken,
  fetchInstallation,
  fetchRecentCommits,
  type GitHubRepo,
  normalizeApiCommits,
} from './github-app.ts'
import {
  insertSyncLog,
  touchRepositorySync,
  upsertGithubInstallation,
  upsertProjectCommits,
  upsertProjectRepository,
  type CommitVisibility,
} from './github-db.ts'

export interface LinkProjectRepositoryResult {
  repository_id: string
  full_name: string
  private: boolean
  default_branch: string
  total_commits_imported: number
}

export async function linkProjectRepositoryCore(
  admin: SupabaseClient,
  userId: string,
  input: {
    project_id: string
    installation_id: number
    repository: GitHubRepo
    commit_visibility: CommitVisibility
    linked_via: string
  },
): Promise<LinkProjectRepositoryResult> {
  const installationMeta = await fetchInstallation(input.installation_id)
  const accessToken = await createInstallationAccessToken(input.installation_id)

  await upsertGithubInstallation(admin, installationMeta, userId)

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
    linked_by: userId,
    metadata: {
      linked_via: input.linked_via,
    },
  })

  const branch = input.repository.default_branch || 'main'
  const commits = normalizeApiCommits(
    await fetchRecentCommits(
      accessToken,
      input.repository.owner.login,
      input.repository.name,
      branch,
      30,
    ),
  )
  const imported = await upsertProjectCommits(
    admin,
    {
      project_repository_id: linkedRepository.id,
      project_id: input.project_id,
      github_repository_id: input.repository.id,
      branch,
    },
    commits,
  )
  await touchRepositorySync(admin, linkedRepository.id)

  await insertSyncLog(admin, {
    project_id: input.project_id,
    project_repository_id: linkedRepository.id,
    action: 'link',
    status: 'success',
    message: 'Repositório vinculado com sucesso.',
    commits_synced: imported,
  })

  return {
    repository_id: linkedRepository.id,
    full_name: linkedRepository.full_name,
    private: linkedRepository.private,
    default_branch: linkedRepository.default_branch,
    total_commits_imported: imported,
  }
}
