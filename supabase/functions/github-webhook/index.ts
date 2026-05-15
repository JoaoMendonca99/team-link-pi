import {
  branchFromRef,
  normalizePushCommits,
  verifyWebhookSignature,
  type GitHubPushCommit,
} from '../_shared/github-app.ts'
import {
  findActiveRepositoriesByGithubId,
  insertWebhookEventIfNew,
  markWebhookEvent,
  touchRepositorySync,
  upsertProjectCommits,
} from '../_shared/github-db.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

interface PushPayload {
  action?: string
  installation?: { id?: number }
  repository?: { id?: number; full_name?: string }
  ref?: string
  commits?: GitHubPushCommit[]
}

function buildWebhookMetadata(
  eventType: string,
  payload: PushPayload,
): Record<string, unknown> {
  return {
    event_type: eventType,
    ref: payload.ref ?? null,
    repository_full_name: payload.repository?.full_name ?? null,
    commits_count: Array.isArray(payload.commits) ? payload.commits.length : 0,
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

  let payload: PushPayload
  try {
    payload = JSON.parse(rawBody) as PushPayload
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

    if (eventType !== 'push') {
      await markWebhookEvent(admin, deliveryId, true, null)
      return jsonResponse({ ok: true, ignored: true, event: eventType })
    }

    if (!githubRepositoryId || !payload.ref || !Array.isArray(payload.commits)) {
      await markWebhookEvent(admin, deliveryId, true, null)
      return jsonResponse({ ok: true, ignored: true, reason: 'incomplete_push_payload' })
    }

    const repositories = await findActiveRepositoriesByGithubId(admin, githubRepositoryId)
    if (repositories.length === 0) {
      await markWebhookEvent(admin, deliveryId, true, null)
      return jsonResponse({ ok: true, linked_projects: 0 })
    }

    const branch = branchFromRef(payload.ref)
    const normalizedCommits = normalizePushCommits(payload.commits)
    let totalImported = 0

    for (const linked of repositories) {
      const imported = await upsertProjectCommits(
        admin,
        {
          project_repository_id: linked.id,
          project_id: linked.project_id,
          github_repository_id: linked.github_repository_id,
          branch,
        },
        normalizedCommits,
      )
      totalImported += imported
      await touchRepositorySync(admin, linked.id)
    }

    await markWebhookEvent(admin, deliveryId, true, null)
    return jsonResponse({
      ok: true,
      linked_projects: repositories.length,
      commits_processed: normalizedCommits.length,
      commits_upserted: totalImported,
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha ao processar webhook do GitHub.'

    await markWebhookEvent(admin, deliveryId, false, message).catch(() => undefined)

    return errorResponse('Não foi possível processar o webhook.', 500)
  }
})
