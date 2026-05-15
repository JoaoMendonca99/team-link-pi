/** Metadados técnicos para console (nunca exibir ao usuário final). */
export interface GithubFunctionDebugInfo {
  functionName: string
  errorMessage?: string
  status?: number
  responseBody?: unknown
  requestBody?: unknown
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
  if (process.env.NODE_ENV !== 'development') return

  console.error('[Team Link · GitHub]', {
    function: debug.functionName,
    message: debug.errorMessage,
    status: debug.status,
    requestBody: debug.requestBody,
    responseBody: debug.responseBody,
    ...extra,
  })
}
