/**
 * URL externa opcional do projeto (apenas http/https).
 */

export type OptionalProjectUrlResult =
  | { ok: true; value: string | null }
  | { ok: false }

/**
 * Valida e normaliza o texto do campo.
 * Vazio → `null` (não persistir valor).
 * Preenchido → URL absoluta com protocolo http ou https.
 */
export function parseOptionalProjectUrl(raw: string): OptionalProjectUrlResult {
  const t = raw.trim()
  if (t === '') return { ok: true, value: null }
  try {
    const u = new URL(t)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false }
    }
    return { ok: true, value: u.href }
  } catch {
    return { ok: false }
  }
}
