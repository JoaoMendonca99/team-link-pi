import {
  branchFromRef,
  normalizePushCommits,
  normalizeWebhookRelease,
  verifyWebhookSignature,
  type GitHubPushCommit,
  type GitHubReleaseItem,
} from '../_shared/github-app.ts'
import {
  deactivateRepositoryRelease,
  findActiveRepositoriesByGithubId,
  insertWebhookEventIfNew,
  markWebhookEvent,
  repositoryTracksCommits,
  repositoryTracksReleases,
  touchRepositorySync,
  upsertProjectCommits,
  upsertRepositoryReleases,
} from '../_shared/github-db.ts'
import { defaultActivitySource } from '../_shared/github-schema.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

interface PushPayload {
  action?: string
  installation?: { id?: number }
  repository?: { id?: number; full_name?: string }
  ref?: string
  commits?: GitHubPushCommit[]
}

interface ReleasePayload {
  action?: string
  installation?: { id?: number }
  repository?: { id?: number; full_name?: string }
  release?: GitHubReleaseItem
}

const RELEASE_UPSERT_ACTIONS = new Set([
  'published',
  'created',
  'edited',
  'released',
])

const RELEASE_DEACTIVATE_ACTIONS = new Set(['unpublished', 'deleted'])

function buildWebhookMetadata(
  eventType: string,
  payload: PushPayload | ReleasePayload,
): Record<string, unknown> {
  if (eventType === 'release') {
    const releasePayload = payload as ReleasePayload
    return {
      event_type: eventType,
      action: releasePayload.action ?? null,
      repository_full_name: releasePayload.repository?.full_name ?? null,
      release_id: releasePayload.release?.id ?? null,
      tag_name: releasePayload.release?.tag_name ?? null,
    }
  }

  const pushPayload = payload as PushPayload
  return {
    event_type: eventType,
    ref: pushPayload.ref ?? null,
    repository_full_name: pushPayload.repository?.full_name ?? null,
    commits_count: Array.isArray(pushPayload.commits) ? pushPayload.commits.length : 0,
  }
}

async function processPushWebhook(
  admin: ReturnType<typeof createAdminClient>,
  payload: PushPayload,
  githubRepositoryId: number,
): Promise<Record<string, unknown>> {
  if (!payload.ref || !Array.isArray(payload.commits)) {
    return { ok: true, ignored: true, reason: 'incomplete_push_payload' }
  }

  const repositories = await findActiveRepositoriesByGithubId(admin, githubRepositoryId)
  const commitRepositories = repositories.filter((linked) =>
    repositoryTracksCommits(defaultActivitySource(linked.activity_source)),
  )

  if (commitRepositories.length === 0) {
    return { ok: true, linked_projects: 0, commits_upserted: 0 }
  }

  const branch = branchFromRef(payload.ref)
  const normalizedCommits = normalizePushCommits(payload.commits)
  let totalImported = 0

  for (const linked of commitRepositories) {
    const importedResult = await upsertProjectCommits(
      admin,
      {
        project_repository_id: linked.id,
        project_id: linked.project_id,
        github_repository_id: linked.github_repository_id,
        branch,
      },
      normalizedCommits,
    )
    if (!importedResult.ok) {
      const msg =
        importedResult.build_error ??
        importedResult.supabase_error_message ??
        'upsert commits failed'
      throw new Error(
        `${importedResult.supabase_error_code ?? 'commits'}: ${msg}`,
      )
    }
    totalImported += importedResult.count
    await touchRepositorySync(admin, linked.id)
  }

  return {
    ok: true,
    linked_projects: commitRepositories.length,
    commits_processed: normalizedCommits.length,
    commits_upserted: totalImported,
  }
}

async function processReleaseWebhook(
  admin: ReturnType<typeof createAdminClient>,
  payload: ReleasePayload,
  githubRepositoryId: number,
): Promise<Record<string, unknown>> {
  const action = payload.action ?? ''
  const release = payload.release

  if (!release?.id) {
    return { ok: true, ignored: true, reason: 'incomplete_release_payload' }
  }

  const repositories = await findActiveRepositoriesByGithubId(admin, githubRepositoryId)
  const releaseRepositories = repositories.filter((linked) =>
    repositoryTracksReleases(defaultActivitySource(linked.activity_source)),
  )

  if (releaseRepositories.length === 0) {
    return { ok: true, linked_projects: 0, releases_upserted: 0 }
  }

  if (RELEASE_DEACTIVATE_ACTIONS.has(action)) {
    for (const linked of releaseRepositories) {
      await deactivateRepositoryRelease(admin, linked.id, release.id)
      await touchRepositorySync(admin, linked.id)
    }
    return {
      ok: true,
      linked_projects: releaseRepositories.length,
      releases_deactivated: releaseRepositories.length,
    }
  }

  if (!RELEASE_UPSERT_ACTIONS.has(action)) {
    return { ok: true, ignored: true, reason: 'release_action_not_handled', action }
  }

  const normalized = normalizeWebhookRelease(release)
  let totalImported = 0

  for (const linked of releaseRepositories) {
    const importedResult = await upsertRepositoryReleases(
      admin,
      {
        project_repository_id: linked.id,
        project_id: linked.project_id,
        github_repository_id: linked.github_repository_id,
      },
      [normalized],
    )
    if (!importedResult.ok) {
      const msg =
        importedResult.build_error ??
        importedResult.supabase_error_message ??
        'upsert releases failed'
      throw new Error(
        `${importedResult.supabase_error_code ?? 'releases'}: ${msg}`,
      )
    }
    totalImported += importedResult.count
    await touchRepositorySync(admin, linked.id)
  }

  return {
    ok: true,
    linked_projects: releaseRepositories.length,
    releases_upserted: totalImported,
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido.', 405)
  }

  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256')
  const eventType = req.headers.get('x-github-event') ?? 'unknown'
  const deliveryId = req.headers.get('x-github-delivery')

  if (!deliveryId) {
    return errorResponse('Cabeçalho x-github-delivery ausente.', 400)
  }

  const valid = await verifyWebhookSignature(rawBody, signature)
  if (!valid) {
    return errorResponse('Assinatura do webhook inválida.', 401)
  }

  const admin = createAdminClient()

  let payload: PushPayload | ReleasePayload
  try {
    payload = JSON.parse(rawBody) as PushPayload | ReleasePayload
  } catch {
    return errorResponse('Payload inválido.', 400)
  }

  const githubRepositoryId = payload.repository?.id ?? null
  const installationId = payload.installation?.id ?? null
  const webhookAction = payload.action ?? null

  try {
    const insertResult = await insertWebhookEventIfNew(admin, {
      delivery_id: deliveryId,
      event_type: eventType,
      action: webhookAction,
      installation_id: installationId,
      github_repository_id: githubRepositoryId,
      metadata: buildWebhookMetadata(eventType, payload),
    })

    if (insertResult === 'duplicate') {
      return jsonResponse({ ok: true, duplicate: true })
    }

    if (!githubRepositoryId) {
      await markWebhookEvent(admin, deliveryId, true, null)
      return jsonResponse({ ok: true, ignored: true, reason: 'missing_repository_id' })
    }

    let result: Record<string, unknown>

    if (eventType === 'push') {
      result = await processPushWebhook(admin, payload as PushPayload, githubRepositoryId)
    } else if (eventType === 'release') {
      result = await processReleaseWebhook(admin, payload as ReleasePayload, githubRepositoryId)
    } else {
      await markWebhookEvent(admin, deliveryId, true, null)
      return jsonResponse({ ok: true, ignored: true, event: eventType })
    }

    await markWebhookEvent(admin, deliveryId, true, null)
    return jsonResponse(result)
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao processar webhook do GitHub.'

    await markWebhookEvent(admin, deliveryId, false, message).catch(() => undefined)

    return errorResponse('Não foi possível processar o webhook.', 500)
  }
})
