/** Metadados técnicos para console (nunca exibir ao usuário final). */
export interface GithubFunctionDebugInfo {
  functionName: string
  errorMessage?: string
  status?: number
  responseBody?: unknown
  requestBody?: unknown
  /** Resposta não-JSON ou corpo bruto (truncado pelo chamador se necessário). */
  rawText?: string | null
}

type InvokeErrorLike = {
  message?: string
  context?: Response | { status?: number; statusCode?: number }
}

export function buildGithubFunctionDebug(
  functionName: string,
  error: unknown,
  data: unknown,
  requestBody?: unknown,
): GithubFunctionDebugInfo {
  const invokeError =
    error && typeof error === 'object' ? (error as InvokeErrorLike) : null

  let status: number | undefined
  const context = invokeError?.context
  if (context instanceof Response) {
    status = context.status
  } else if (context && typeof context === 'object') {
    const code = context.status ?? context.statusCode
    if (typeof code === 'number' && Number.isFinite(code)) {
      status = code
    }
  }

  return {
    functionName,
    errorMessage: invokeError?.message,
    status,
    responseBody: data ?? null,
    requestBody,
  }
}

export function logGithubFunctionDebug(
  debug: GithubFunctionDebugInfo,
  extra?: Record<string, unknown>,
): void {
  const payload = {
    function: debug.functionName,
    message: debug.errorMessage,
    status: debug.status,
    requestBody: debug.requestBody,
    responseBody: debug.responseBody,
    ...extra,
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('[Team Link · GitHub]', {
      ...payload,
      rawText: debug.rawText,
    })
    return
  }

  if (extra && ('code' in extra || 'step' in extra)) {
    console.error('[Team Link · GitHub]', {
      function: debug.functionName,
      status: debug.status,
      code: extra.code,
      step: extra.step,
      details: extra.details,
      rawText: debug.rawText,
    })
  }
}
