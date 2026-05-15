export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`)
  }
  return value
}

export type PrivateKeyValidationResult =
  | { ok: true; pem: string }
  | { ok: false; message: string }

/** Valida e normaliza GITHUB_PRIVATE_KEY — nunca logar o valor. */
export function validateGitHubPrivateKeyFromEnv(): PrivateKeyValidationResult {
  const raw = Deno.env.get('GITHUB_PRIVATE_KEY')?.trim()
  if (!raw) {
    return { ok: false, message: 'GITHUB_PRIVATE_KEY ausente.' }
  }

  const pem = raw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()

  if (!pem.includes('-----BEGIN')) {
    return { ok: false, message: 'Cabeçalho PEM (-----BEGIN) ausente.' }
  }

  if (!pem.includes('-----END')) {
    return { ok: false, message: 'Rodapé PEM (-----END) ausente.' }
  }

  return { ok: true, pem }
}

/** Normaliza PEM com quebras reais ou `\\n` escapado (comum em secrets). */
export function getGitHubPrivateKeyPem(): string {
  const validated = validateGitHubPrivateKeyFromEnv()
  if (!validated.ok) {
    throw new Error(`GITHUB_PRIVATE_KEY inválida: ${validated.message}`)
  }
  return validated.pem
}

const GITHUB_RUNTIME_SECRETS = [
  'GITHUB_APP_ID',
  'GITHUB_PRIVATE_KEY',
  'GITHUB_STATE_SECRET',
] as const

const SUPABASE_RUNTIME_SECRETS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const

export type MissingSecretCode = 'missing_github_secret' | 'missing_supabase_secret'

export function getMissingRuntimeSecretCode(): MissingSecretCode | null {
  for (const name of SUPABASE_RUNTIME_SECRETS) {
    if (!Deno.env.get(name)?.trim()) return 'missing_supabase_secret'
  }
  for (const name of GITHUB_RUNTIME_SECRETS) {
    if (!Deno.env.get(name)?.trim()) return 'missing_github_secret'
  }
  return null
}

export function isMissingEnvError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.startsWith('Variável de ambiente ausente:') ||
      error.message.startsWith('GITHUB_PRIVATE_KEY inválida:'))
  )
}
