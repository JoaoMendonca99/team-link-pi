export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`)
  }
  return value
}

export function getGitHubPrivateKeyPem(): string {
  const raw = requireEnv('GITHUB_PRIVATE_KEY')
  return raw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()
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
    error.message.startsWith('Variável de ambiente ausente:')
  )
}
