import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import {
  fetchRecentCommits,
  GitHubApiError,
  listRepositoryReleases,
  normalizeApiCommits,
  normalizeApiReleases,
} from './github-app.ts'
import {
  defaultActivitySource,
  RepositoryCommitsSaveError,
  RepositoryReleasesSaveError,
  repositoryTracksCommits,
  repositoryTracksReleases,
  upsertProjectCommits,
  upsertRepositoryReleases,
  type ProjectGithubRepositoryRow,
} from './github-db.ts'
import type { ActivitySource } from './github-schema.ts'

export interface SyncActivityResult {
  commits_synced: number
  releases_synced: number
}

export async function syncCommitsForRepository(
  admin: SupabaseClient,
  repository: ProjectGithubRepositoryRow,
  accessToken: string,
): Promise<number> {
  const branch = repository.default_branch || 'main'
  let commits
  try {
    commits = normalizeApiCommits(
      await fetchRecentCommits(
        accessToken,
        repository.owner_login,
        repository.repo_name,
        branch,
        30,
      ),
    )
  } catch (err) {
    const gh = err instanceof GitHubApiError ? err : null
    throw new RepositoryCommitsSaveError({
      github_status: gh != null ? gh.status : null,
      github_message: gh != null
        ? (gh.githubMessage ?? gh.message)
        : err instanceof Error
          ? err.message
          : null,
      supabase_error_code: null,
      supabase_error_message: null,
      supabase_error_details: null,
      supabase_error_hint: null,
      project_repository_id: repository.id,
      project_id: repository.project_id,
      github_repository_id: repository.github_repository_id,
      commit_count: 0,
      payload_keys: [],
      first_commit_preview: {},
    })
  }

  const commitUpsert = await upsertProjectCommits(
    admin,
    {
      project_repository_id: repository.id,
      project_id: repository.project_id,
      github_repository_id: repository.github_repository_id,
      branch,
    },
    commits,
  )

  if (!commitUpsert.ok) {
    throw new RepositoryCommitsSaveError({
      github_status: null,
      github_message: null,
      supabase_error_code: commitUpsert.supabase_error_code,
      supabase_error_message: commitUpsert.supabase_error_message,
      supabase_error_details: commitUpsert.supabase_error_details,
      supabase_error_hint: commitUpsert.supabase_error_hint,
      project_repository_id: repository.id,
      project_id: repository.project_id,
      github_repository_id: repository.github_repository_id,
      commit_count: commits.length,
      payload_keys: commitUpsert.payload_keys,
      first_commit_preview: commitUpsert.first_commit_preview,
    })
  }

  return commitUpsert.count
}

export async function syncReleasesForRepository(
  admin: SupabaseClient,
  repository: ProjectGithubRepositoryRow,
  accessToken: string,
): Promise<number> {
  let releases
  try {
    releases = normalizeApiReleases(
      await listRepositoryReleases(
        accessToken,
        repository.owner_login,
        repository.repo_name,
        30,
      ),
    )
  } catch (err) {
    const gh = err instanceof GitHubApiError ? err : null
    throw new RepositoryReleasesSaveError({
      github_status: gh != null ? gh.status : null,
      github_message: gh != null
        ? (gh.githubMessage ?? gh.message)
        : err instanceof Error
          ? err.message
          : null,
      supabase_error_code: null,
      supabase_error_message: null,
      supabase_error_details: null,
      supabase_error_hint: null,
      project_repository_id: repository.id,
      project_id: repository.project_id,
      github_repository_id: repository.github_repository_id,
      release_count: 0,
      payload_keys: [],
    })
  }

  const releaseUpsert = await upsertRepositoryReleases(
    admin,
    {
      project_repository_id: repository.id,
      project_id: repository.project_id,
      github_repository_id: repository.github_repository_id,
    },
    releases,
  )

  if (!releaseUpsert.ok) {
    throw new RepositoryReleasesSaveError({
      github_status: null,
      github_message: null,
      supabase_error_code: releaseUpsert.supabase_error_code,
      supabase_error_message: releaseUpsert.supabase_error_message,
      supabase_error_details: releaseUpsert.supabase_error_details,
      supabase_error_hint: releaseUpsert.supabase_error_hint,
      project_repository_id: repository.id,
      project_id: repository.project_id,
      github_repository_id: repository.github_repository_id,
      release_count: releases.length,
      payload_keys: releaseUpsert.payload_keys,
    })
  }

  return releaseUpsert.count
}

export async function syncRepositoryByActivitySource(
  admin: SupabaseClient,
  repository: ProjectGithubRepositoryRow,
  accessToken: string,
  activitySourceInput?: ActivitySource,
): Promise<SyncActivityResult> {
  const activitySource = defaultActivitySource(
    activitySourceInput ?? repository.activity_source,
  )

  let commits_synced = 0
  let releases_synced = 0

  if (repositoryTracksCommits(activitySource)) {
    commits_synced = await syncCommitsForRepository(admin, repository, accessToken)
  }

  if (repositoryTracksReleases(activitySource)) {
    releases_synced = await syncReleasesForRepository(admin, repository, accessToken)
  }

  return { commits_synced, releases_synced }
}
