export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-github-delivery, x-hub-signature-256, x-github-event',
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  return null
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ ok: false, error: message, message }, status)
}

export interface StandardFailInput {
  code: string
  step: string
  message: string
  status: number
  details?: Record<string, unknown>
}

/** Resposta de erro padronizada — sem dados sensíveis. */
export function standardFailResponse(input: StandardFailInput): Response {
  return jsonResponse(
    {
      ok: false,
      code: input.code,
      step: input.step,
      message: input.message,
      error: input.message,
      ...(input.details && Object.keys(input.details).length > 0
        ? { details: input.details }
        : {}),
    },
    input.status,
  )
}

/** @deprecated Preferir standardFailResponse */
export function structuredFailResponse(
  message: string,
  code: string,
  step: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return standardFailResponse({ code, step, message, status, details })
}

/** Compatível com consumidores que leem `error` + `code`. */
export function codedErrorResponse(
  message: string,
  code: string,
  status: number,
  step?: string,
  details?: Record<string, unknown>,
): Response {
  return standardFailResponse({
    code,
    step: step ?? 'unknown',
    message,
    status,
    details,
  })
}
