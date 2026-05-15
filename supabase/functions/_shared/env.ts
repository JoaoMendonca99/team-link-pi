export function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}`)
  }
  return value
}

export function getGitHubPrivateKeyPem(): string {
  const raw = requireEnv('GITHUB_PRIVATE_KEY')
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}
