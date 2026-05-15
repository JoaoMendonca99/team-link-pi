import { requireEnv } from './env.ts'

const STATE_TTL_MS = 10 * 60 * 1000

export interface GithubOAuthStatePayload {
  project_id: string
  user_id: string
  nonce: string
  exp: number
}

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncode(new TextEncoder().encode(value))
}

function base64UrlDecodeToString(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const normalized = padded + '='.repeat(padLen)
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

async function signPayload(payloadB64: string): Promise<string> {
  const secret = requireEnv('GITHUB_STATE_SECRET')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return base64UrlEncode(new Uint8Array(digest))
}

async function verifySignature(payloadB64: string, signature: string): Promise<boolean> {
  const expected = await signPayload(payloadB64)
  const a = new TextEncoder().encode(expected)
  const b = new TextEncoder().encode(signature)
  if (a.byteLength !== b.byteLength) return false
  let diff = 0
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i]! ^ b[i]!
  }
  return diff === 0
}

export async function createSignedGithubState(input: {
  project_id: string
  user_id: string
}): Promise<string> {
  const payload: GithubOAuthStatePayload = {
    project_id: input.project_id.trim(),
    user_id: input.user_id.trim(),
    nonce: crypto.randomUUID(),
    exp: Date.now() + STATE_TTL_MS,
  }

  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload))
  const signature = await signPayload(payloadB64)
  return `${payloadB64}.${signature}`
}

export async function verifySignedGithubState(
  state: string,
): Promise<GithubOAuthStatePayload | null> {
  const trimmed = state.trim()
  const dot = trimmed.lastIndexOf('.')
  if (dot <= 0) return null

  const payloadB64 = trimmed.slice(0, dot)
  const signature = trimmed.slice(dot + 1)
  if (!payloadB64 || !signature) return null

  const validSig = await verifySignature(payloadB64, signature)
  if (!validSig) return null

  let payload: GithubOAuthStatePayload
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64)) as GithubOAuthStatePayload
  } catch {
    return null
  }

  if (
    !payload?.project_id ||
    !payload?.user_id ||
    !payload?.nonce ||
    typeof payload.exp !== 'number'
  ) {
    return null
  }

  if (Date.now() > payload.exp) {
    return null
  }

  return payload
}
