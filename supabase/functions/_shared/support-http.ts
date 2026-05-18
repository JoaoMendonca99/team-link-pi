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

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ ok: false, error: message, message }, status)
}

export function successResponse<T extends Record<string, unknown>>(
  data: T,
  status = 200,
): Response {
  return jsonResponse({ ok: true, ...data }, status)
}
