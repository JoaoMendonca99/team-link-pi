export const supportCorsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-project-id, x-api-key',
}

export function handleSupportCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: supportCorsHeaders })
  }
  return null
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...supportCorsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(
  message: string,
  status: number,
  extra?: { detail?: string; code?: string },
): Response {
  return jsonResponse(
    {
      ok: false,
      error: message,
      message,
      ...(extra?.detail ? { detail: extra.detail } : {}),
      ...(extra?.code ? { code: extra.code } : {}),
    },
    status,
  )
}

export function serializeSupportError(error: unknown): Record<string, unknown> {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    return {
      message: typeof record.message === 'string' ? record.message : String(error),
      code: typeof record.code === 'string' ? record.code : undefined,
      details: record.details ?? undefined,
      hint: record.hint ?? undefined,
      stack: error instanceof Error ? error.stack : undefined,
    }
  }
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }
}

export function safeErrorDetail(error: unknown, fallback = 'Erro interno.'): string {
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    if (typeof record.message === 'string' && record.message.trim()) {
      return record.message.trim()
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }
  return fallback
}

export function successResponse<T extends Record<string, unknown>>(
  data: T,
  status = 200,
): Response {
  return jsonResponse({ ok: true, ...data }, status)
}
