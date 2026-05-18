/** Garante que o bundle inclui o import RSA compartilhado (PKCS#1 → Web Crypto). */
import '../_shared/github-rsa-import.ts'

import {
  createInstallationAccessToken,
  fetchRepositoryById,
  GitHubApiError,
  GitHubPrivateKeyError,
  listInstallationRepositories,
} from '../_shared/github-app.ts'
import {
  assertProjectManager,
  insertSyncLog,
  RepositoryCommitsSaveError,
  RepositoryReleasesSaveError,
} from '../_shared/github-db.ts'
import { linkProjectRepositoryCore } from '../_shared/github-link-core.ts'
import type { CommitVisibility } from '../_shared/github-db.ts'
import { parseActivitySource } from '../_shared/github-schema.ts'
import { errorResponse, handleCors, jsonResponse } from '../_shared/http.ts'
import {
  createAdminClient,
  createUserClientFromRequest,
  getUserFromRequest,
} from '../_shared/supabase-admin.ts'

interface LinkSelectedBody {
  project_id?: string
  installation_id?: number
  github_repository_id?: number
  commit_visibility?: string
  activity_source?: string
}

function safeJwtRelatedDetail(e: unknown, maxLen = 400): string {
  if (e == null) return ''
  if (typeof e === 'string') {
    const s = e.trim()
    if (!s) return ''
    if (/-----BEGIN|BEGIN[\sA-Z]*PRIVATE|RSA PRIVATE/i.test(s)) return 'redacted'
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s
  }
  if (e instanceof Error) {
    let m = e.message
    if (/-----BEGIN|BEGIN[\sA-Z]*PRIVATE|RSA PRIVATE/i.test(m)) return 'redacted+pem'
    m = m.replace(/[A-Za-z0-9+/=]{64,}/g, '[b64]')
    if (m.length > maxLen) m = `${m.slice(0, maxLen)}…`
    return `${e.name}: ${m}`
  }
  return 'unknown'
}

Deno.serve(async (req) => {
  const cors = handleCors(req)
  if (cors) return cors

  if (req.method !== 'POST') {
    return errorResponse('Método não permitido.', 405)
  }

  const admin = createAdminClient()
  const user = await getUserFromRequest(req)
  if (!user) {
    return errorResponse('Autenticação obrigatória.', 401)
  }

  let body: LinkSelectedBody
  try {
    body = (await req.json()) as LinkSelectedBody
  } catch {
    return errorResponse('JSON inválido.', 400)
  }

  const projectId = body.project_id?.trim()
  const installationId = body.installation_id
  const githubRepositoryId = body.github_repository_id

  if (!projectId || !installationId || !githubRepositoryId) {
    return errorResponse(
      'project_id, installation_id e github_repository_id são obrigatórios.',
      400,
    )
  }

  const commitVisibility: CommitVisibility =
    body.commit_visibility === 'public' ? 'public' : 'members'

  const activitySource = parseActivitySource(body.activity_source)
  if (body.activity_source != null && body.activity_source !== '' && !activitySource) {
    return errorResponse(
      'activity_source inválido. Use commits, releases ou both.',
      400,
    )
  }
  const resolvedActivitySource = activitySource ?? 'commits'

  const userClient = createUserClientFromRequest(req)
  const canManage = await assertProjectManager(admin, projectId, user.id, userClient)
  if (!canManage) {
    return errorResponse('Você não tem permissão para vincular repositórios neste projeto.', 403)
  }

  const { data: installationRow, error: installationLookupError } = await admin
    .from('github_installations')
    .select('installation_id, status, created_by, account_id, account_login')
    .eq('installation_id', installationId)
    .maybeSingle()

  if (installationLookupError) {
    return errorResponse(
      'Esta conexão GitHub não está disponível para este usuário. Conecte o GitHub novamente.',
      403,
    )
  }

  if (!installationRow) {
    return errorResponse(
      'Esta conexão GitHub não está disponível para este usuário. Conecte o GitHub novamente.',
      404,
    )
  }

  const row = installationRow as {
    status?: string | null
    created_by?: string | null
    account_id?: number | null
  }

  if (row.created_by !== user.id) {
    return errorResponse(
      'Esta conexão GitHub não está disponível para este usuário. Conecte o GitHub novamente.',
      403,
    )
  }

  if (row.status !== 'active') {
    return errorResponse(
      'Esta conexão GitHub não está disponível para este usuário. Conecte o GitHub novamente.',
      403,
    )
  }

  if (row.account_id == null) {
    return errorResponse(
      'Esta conexão GitHub não está disponível para este usuário. Conecte o GitHub novamente.',
      403,
    )
  }

  try {
    const accessToken = await createInstallationAccessToken(installationId)
    const repository = await fetchRepositoryById(accessToken, githubRepositoryId)

    const allowed = await listInstallationRepositories(accessToken)
    const isAllowed = allowed.some((repo) => repo.id === repository.id)
    if (!isAllowed) {
      return errorResponse('Esse repositório não está disponível para esta instalação.', 400)
    }

    const result = await linkProjectRepositoryCore(admin, user.id, {
      project_id: projectId,
      installation_id: installationId,
      repository,
      commit_visibility: commitVisibility,
      activity_source: resolvedActivitySource,
      linked_via: 'github-link-selected-repository',
    })

    return jsonResponse(result)
  } catch (error) {
    if (
      error instanceof RepositoryCommitsSaveError ||
      error instanceof RepositoryReleasesSaveError
    ) {
      await insertSyncLog(admin, {
        project_id: projectId,
        action: 'link',
        status: 'error',
        message: error.message,
      }).catch(() => undefined)

      console.error('[github-link-selected-repository] save_repository_activity_failed', {
        code: error.code,
        details_keys: Object.keys(error.details),
      })

      return jsonResponse(
        {
          ok: false,
          step: error.step,
          code: error.code,
          message: error.message,
          details: error.details,
        },
        500,
      )
    }

    if (error instanceof GitHubPrivateKeyError) {
      const causeMsg = safeJwtRelatedDetail(error.cause)
      const detailMsg = causeMsg || error.message

      await insertSyncLog(admin, {
        project_id: projectId,
        action: 'link',
        status: 'error',
        message: error.message,
      }).catch(() => undefined)

      console.error('[github-link-selected-repository] create_github_jwt_failed', {
        error_name: error.name,
        cause_name: error.cause instanceof Error
          ? error.cause.name
          : typeof error.cause,
      })

      return jsonResponse(
        {
          ok: false,
          step: 'create_github_jwt',
          code: 'github_private_key_invalid',
          message: 'Chave privada do GitHub App inválida ou mal formatada.',
          details: {
            error_name: error.name,
            error_message: detailMsg,
          },
        },
        500,
      )
    }

    const message =
      error instanceof GitHubApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Não foi possível vincular o repositório.'

    await insertSyncLog(admin, {
      project_id: projectId,
      action: 'link',
      status: 'error',
      message,
    }).catch(() => undefined)

    const status = error instanceof GitHubApiError ? error.status : 500
    return errorResponse(message, status >= 400 && status < 600 ? status : 500)
  }
})
