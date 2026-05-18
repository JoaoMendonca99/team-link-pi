const TECHNICAL_ERROR_RE =
  /jwt|pgrst|postgres|edge function|functions_http|fetch failed|non-2xx|network/i

export function readSupportFunctionError(payload: Record<string, unknown> | null): string | null {
  if (typeof payload?.message === 'string') return payload.message
  if (typeof payload?.error === 'string') return payload.error
  return null
}

export function friendlySupportError(message: string | undefined, fallback: string): string {
  const trimmed = message?.trim()
  if (!trimmed || TECHNICAL_ERROR_RE.test(trimmed)) return fallback
  return trimmed
}

export function parseSupportInvokePayload(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return null
}

export function resolveSupportInvokeFailure(
  payload: Record<string, unknown> | null,
  invokeError: { message?: string } | null,
  fallback: string,
): string {
  const fnError = readSupportFunctionError(payload)
  if (fnError) return friendlySupportError(fnError, fallback)
  if (invokeError?.message) return friendlySupportError(invokeError.message, fallback)
  return fallback
}

export function isSupportInvokeFailure(
  payload: Record<string, unknown> | null,
  invokeError: { message?: string } | null,
): boolean {
  if (payload?.ok === false) return true
  if (invokeError) return true
  return false
}
