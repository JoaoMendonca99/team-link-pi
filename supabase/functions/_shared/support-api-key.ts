import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const API_KEY_PREFIX = 'tl_sac_'
const API_KEY_SECRET_LENGTH = 32

export function generatePlainApiKey(): { apiKey: string; last4: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let secret = ''
  for (let i = 0; i < API_KEY_SECRET_LENGTH; i++) {
    secret += alphabet[bytes[i % bytes.length]!]
  }
  const apiKey = `${API_KEY_PREFIX}${secret}`
  return { apiKey, last4: apiKey.slice(-4) }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function normalizeHashValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('\\x')) return trimmed.slice(2).toLowerCase()
    return trimmed.toLowerCase()
  }
  return String(value).trim().toLowerCase() || null
}

export async function hashApiKey(
  admin: SupabaseClient,
  apiKey: string,
): Promise<string> {
  const attempts: Record<string, string>[] = [
    { api_key: apiKey },
    { p_api_key: apiKey },
    { key_text: apiKey },
    { text_input: apiKey },
  ]

  for (const params of attempts) {
    const { data, error } = await admin.rpc('support_hash_api_key', params)
    if (!error) {
      const normalized = normalizeHashValue(data)
      if (normalized) return normalized
    }
  }

  return sha256Hex(apiKey)
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const left = a.trim().toLowerCase()
  const right = b.trim().toLowerCase()
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return diff === 0
}

export async function apiKeyMatches(
  admin: SupabaseClient,
  apiKey: string,
  storedHash: string,
): Promise<boolean> {
  const candidate = await hashApiKey(admin, apiKey)
  return timingSafeEqualHex(candidate, storedHash)
}
