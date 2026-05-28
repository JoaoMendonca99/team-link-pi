import { readExternalHeaders, validateExternalApiAccess } from '../_shared/support-auth.ts'
import { createTicketWithInitialMessage } from '../_shared/support-db.ts'
import { parseCategory, parsePriority } from '../_shared/support-schema.ts'
import {
  errorResponse,
  handleSupportCors,
  safeErrorDetail,
  serializeSupportError,
  successResponse,
} from '../_shared/support-http.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

interface CreateTicketBody {
  external_user_id?: string
  external_user_email?: string | null
  external_user_name?: string | null
  title?: string
  message?: string
  category?: string | null
  priority?: string | null
  app_version?: string | null
  app_platform?: string | null
  app_module?: string | null
  filial?: string | null
  external_ticket_ref?: string | null
}

function resolveSourceApp(body: CreateTicketBody): string {
  const platform = body.app_platform?.trim()
  if (platform) return platform.slice(0, 64)
  return 'external'
}

Deno.serve(async (req) => {
  try {
    console.info('[support-create-ticket] request received', { method: req.method })

    const cors = handleSupportCors(req)
    if (cors) return cors

    if (req.method !== 'POST') {
      return errorResponse('Método não permitido.', 405, { code: 'method_not_allowed' })
    }

    const { projectId, apiKey } = readExternalHeaders(req)
    console.info('[support-create-ticket] headers present', {
      has_project_id: Boolean(projectId),
      has_api_key: Boolean(apiKey),
      project_id: projectId ?? null,
    })

    let admin
    try {
      admin = createAdminClient()
    } catch (error) {
      console.error('[support-create-ticket] admin client error', serializeSupportError(error))
      return errorResponse(
        'Configuração do servidor incompleta.',
        500,
        { detail: safeErrorDetail(error), code: 'missing_env' },
      )
    }

    const access = await validateExternalApiAccess(admin, projectId ?? '', apiKey ?? '')
    if (!access.ok) {
      console.warn('[support-create-ticket] api access denied', {
        status: access.status,
        project_id: projectId ?? null,
      })
      return errorResponse(access.message, access.status, { code: `http_${access.status}` })
    }

    console.info('[support-create-ticket] api access validated', {
      project_id: access.integration.project_id,
    })

    let body: CreateTicketBody
    try {
      body = (await req.json()) as CreateTicketBody
    } catch (error) {
      console.error('[support-create-ticket] body parse error', serializeSupportError(error))
      return errorResponse('JSON inválido.', 400, { code: 'invalid_json' })
    }

    console.info('[support-create-ticket] body parsed', {
      has_external_user_id: Boolean(body.external_user_id?.trim()),
      has_title: Boolean(body.title?.trim()),
      has_message: Boolean(body.message?.trim()),
      category: body.category ?? null,
      priority: body.priority ?? null,
    })

    const externalUserId = body.external_user_id?.trim()
    const title = body.title?.trim()
    const message = body.message?.trim()

    if (!externalUserId) {
      return errorResponse('external_user_id é obrigatório.', 400, { code: 'missing_field' })
    }
    if (!title) {
      return errorResponse('title é obrigatório.', 400, { code: 'missing_field' })
    }
    if (!message) {
      return errorResponse('message é obrigatório.', 400, { code: 'missing_field' })
    }

    const category = body.category == null || body.category === ''
      ? null
      : parseCategory(body.category)
    if (body.category != null && body.category !== '' && !category) {
      return errorResponse(
        'category inválida. Use: bug, duvida, erro_sistema, solicitacao, melhoria ou outro.',
        400,
        { code: 'invalid_category' },
      )
    }

    const priority = body.priority == null || body.priority === ''
      ? null
      : parsePriority(body.priority)
    if (body.priority != null && body.priority !== '' && !priority) {
      return errorResponse(
        'priority inválida. Use: low, normal, high ou urgent.',
        400,
        { code: 'invalid_priority' },
      )
    }

    console.info('[support-create-ticket] ticket insert starting', {
      project_id: access.integration.project_id,
      integration_id: access.integration.id,
    })

    const created = await createTicketWithInitialMessage(admin, {
      project_id: access.integration.project_id,
      integration_id: access.integration.id,
      source_app: resolveSourceApp(body),
      external_user_id: externalUserId,
      external_user_email: body.external_user_email?.trim() || null,
      external_user_name: body.external_user_name?.trim() || null,
      title,
      message,
      category,
      priority,
      app_version: body.app_version?.trim() || null,
      app_platform: body.app_platform?.trim() || null,
      app_module: body.app_module?.trim() || null,
      filial: body.filial?.trim() || null,
      external_ticket_ref: body.external_ticket_ref?.trim() || null,
    })

    if (!created.ok) {
      console.error('[support-create-ticket] create failed', {
        code: created.code,
        detail: created.detail,
      })
      return errorResponse(created.message, 500, {
        detail: created.detail,
        code: created.code,
      })
    }

    console.info('[support-create-ticket] ticket insert success', {
      ticket_id: created.ticket.id,
      ticket_number: created.ticket.ticket_number,
    })
    console.info('[support-create-ticket] message insert success', {
      ticket_id: created.ticket.id,
      message_id: created.message.id,
    })

    return successResponse({
      ticket_id: created.ticket.id,
      ticket_number: created.ticket.ticket_number,
      status: created.ticket.status,
    })
  } catch (error) {
    console.error('[support-create-ticket] unhandled error', serializeSupportError(error))
    return errorResponse('Não foi possível criar o ticket.', 500, {
      detail: safeErrorDetail(error),
      code: 'internal_error',
    })
  }
})
