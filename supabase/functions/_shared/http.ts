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
  return jsonResponse({ error: message }, status)
}

/** Resposta de erro com código e etapa — sem dados sensíveis. */
export function structuredFailResponse(
  message: string,
  code: string,
  step: string,
  status: number,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: message,
      code,
      step,
    },
    status,
  )
}

/** Compatível com consumidores que leem apenas `error` + `code`. */
export function codedErrorResponse(
  message: string,
  code: string,
  status: number,
  step?: string,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: message,
      code,
      ...(step ? { step } : {}),
    },
    status,
  )
}
