import * as jose from 'npm:jose@5'

import { getGitHubPrivateKeyPem, requireEnv } from './env.ts'

const GITHUB_API = 'https://api.github.com'

const GH_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'GitHubApiError'
  }
}

export interface GitHubRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  default_branch: string
  html_url: string
  owner: { login: string; id?: number }
}

export interface GitHubInstallationMeta {
  installation_id: number
  app_id: number
  account_id: number
  account_login: string
  account_type: string
  target_type: string
  status: string
}

export interface GitHubCommitListItem {
  sha: string
  html_url: string
  commit: {
    message: string
    author: {
      name: string | null
      email: string | null
      date: string
    }
  }
  author: { login: string | null } | null
}

export interface GitHubPushCommit {
  id: string
  message: string
  timestamp: string
  url: string
  author: {
    name?: string
    email?: string
    username?: string
  } | null
  added?: string[]
  removed?: string[]
  modified?: string[]
}

/** Formato interno alinhado às colunas de `project_github_commits`. */
export interface NormalizedCommit {
  sha: string
  message: string
  author_name: string | null
  author_email: string | null
  github_username: string | null
  committed_at: string
  commit_url: string
  additions: number | null
  deletions: number | null
  changed_files: number | null
  files: Record<string, unknown> | null
  raw_commit: Record<string, unknown>
}

let cachedAppJwt: { token: string; expiresAt: number } | null = null

export async function createGitHubAppJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedAppJwt && cachedAppJwt.expiresAt > now + 30) {
    return cachedAppJwt.token
  }

  const appId = requireEnv('GITHUB_APP_ID')
  const pem = getGitHubPrivateKeyPem()

  const privateKey = pem.includes('BEGIN RSA PRIVATE KEY')
    ? await jose.importPKCS1(pem, 'RS256')
    : await jose.importPKCS8(pem, 'RS256')

  const token = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + 9 * 60)
    .setIssuer(appId)
    .sign(privateKey)

  cachedAppJwt = { token, expiresAt: now + 9 * 60 }
  return token
}

/** Gera installation access token em memória — nunca persistir nem retornar ao cliente. */
export async function createInstallationAccessToken(
  installationId: number,
): Promise<string> {
  const appJwt = await createGitHubAppJwt()
  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        ...GH_HEADERS,
        Authorization: `Bearer ${appJwt}`,
      },
    },
  )

  if (response.status === 404) {
    throw new GitHubApiError('Instalação do GitHub App não encontrada.', 404)
  }
  if (response.status === 403) {
    throw new GitHubApiError('Sem permissão para acessar esta instalação no GitHub.', 403)
  }
  if (response.status === 429) {
    throw new GitHubApiError(
      'Limite de requisições do GitHub atingido. Tente novamente em instantes.',
      429,
    )
  }
  if (!response.ok) {
    throw new GitHubApiError('Não foi possível obter acesso à instalação do GitHub.', 502)
  }

  const payload = (await response.json()) as { token?: string }
  if (!payload.token) {
    throw new GitHubApiError('Resposta inválida do GitHub ao gerar token de instalação.', 502)
  }
  return payload.token
}

async function githubFetch(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      ...GH_HEADERS,
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  })
}

function mapGitHubError(response: Response): GitHubApiError {
  if (response.status === 404) {
    return new GitHubApiError(
      'Repositório não encontrado ou inacessível para esta instalação.',
      404,
    )
  }
  if (response.status === 403) {
    return new GitHubApiError('Sem permissão para acessar este recurso no GitHub.', 403)
  }
  if (response.status === 429) {
    return new GitHubApiError(
      'Limite de requisições do GitHub atingido. Tente novamente em instantes.',
      429,
    )
  }
  return new GitHubApiError('Não foi possível comunicar com o GitHub.', response.status)
}

export async function fetchInstallation(installationId: number): Promise<GitHubInstallationMeta> {
  const appJwt = await createGitHubAppJwt()
  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}`, {
    headers: {
      ...GH_HEADERS,
      Authorization: `Bearer ${appJwt}`,
    },
  })

  if (!response.ok) {
    throw mapGitHubError(response)
  }

  const data = (await response.json()) as {
    id?: number
    app_id?: number
    target_type?: string
    suspended_at?: string | null
    account?: { id?: number; login?: string; type?: string }
  }

  const appId = Number(data.app_id ?? requireEnv('GITHUB_APP_ID'))

  return {
    installation_id: data.id ?? installationId,
    app_id: appId,
    account_id: data.account?.id ?? 0,
    account_login: data.account?.login ?? 'unknown',
    account_type: data.account?.type ?? 'User',
    target_type: data.target_type ?? 'User',
    status: data.suspended_at ? 'suspended' : 'active',
  }
}

export async function fetchRepository(
  accessToken: string,
  ownerLogin: string,
  repoName: string,
): Promise<GitHubRepo> {
  const response = await githubFetch(`/repos/${ownerLogin}/${repoName}`, accessToken)
  if (!response.ok) {
    throw mapGitHubError(response)
  }
  return (await response.json()) as GitHubRepo
}

export async function fetchRepositoryById(
  accessToken: string,
  githubRepositoryId: number,
): Promise<GitHubRepo> {
  const response = await githubFetch(`/repositories/${githubRepositoryId}`, accessToken)
  if (!response.ok) {
    throw mapGitHubError(response)
  }
  return (await response.json()) as GitHubRepo
}

export interface SafeGithubRepository {
  github_repository_id: number
  owner_login: string
  repo_name: string
  full_name: string
  default_branch: string
  private: boolean
  html_url: string
}

export function mapRepoToSafe(repository: GitHubRepo): SafeGithubRepository {
  return {
    github_repository_id: repository.id,
    owner_login: repository.owner.login,
    repo_name: repository.name,
    full_name: repository.full_name,
    default_branch: repository.default_branch || 'main',
    private: repository.private,
    html_url: repository.html_url,
  }
}

export async function listInstallationRepositories(
  accessToken: string,
): Promise<GitHubRepo[]> {
  const collected: GitHubRepo[] = []
  let page = 1

  while (page <= 20) {
    const response = await githubFetch(
      `/installation/repositories?per_page=100&page=${page}`,
      accessToken,
    )
    if (!response.ok) {
      throw mapGitHubError(response)
    }

    const payload = (await response.json()) as {
      repositories?: GitHubRepo[]
      total_count?: number
    }
    const batch = payload.repositories ?? []
    collected.push(...batch)

    const total = payload.total_count ?? collected.length
    if (batch.length === 0 || collected.length >= total) {
      break
    }
    page += 1
  }

  return collected
}

export async function fetchRecentCommits(
  accessToken: string,
  ownerLogin: string,
  repoName: string,
  branch: string,
  perPage = 30,
): Promise<GitHubCommitListItem[]> {
  const params = new URLSearchParams({ sha: branch, per_page: String(perPage) })
  const response = await githubFetch(
    `/repos/${ownerLogin}/${repoName}/commits?${params.toString()}`,
    accessToken,
  )
  if (!response.ok) {
    throw mapGitHubError(response)
  }
  return (await response.json()) as GitHubCommitListItem[]
}

export function normalizeApiCommits(commits: GitHubCommitListItem[]): NormalizedCommit[] {
  return commits.map((item) => ({
    sha: item.sha,
    message: item.commit.message,
    author_name: item.commit.author.name ?? null,
    author_email: item.commit.author.email ?? null,
    github_username: item.author?.login ?? null,
    committed_at: item.commit.author.date,
    commit_url: item.html_url,
    additions: null,
    deletions: null,
    changed_files: null,
    files: null,
    raw_commit: item as unknown as Record<string, unknown>,
  }))
}

export function normalizePushCommits(commits: GitHubPushCommit[]): NormalizedCommit[] {
  return commits.map((item) => {
    const added = item.added ?? []
    const removed = item.removed ?? []
    const modified = item.modified ?? []

    return {
      sha: item.id,
      message: item.message,
      author_name: item.author?.name ?? item.author?.username ?? null,
      author_email: item.author?.email ?? null,
      github_username: item.author?.username ?? null,
      committed_at: item.timestamp,
      commit_url: item.url,
      additions: added.length > 0 ? added.length : null,
      deletions: removed.length > 0 ? removed.length : null,
      changed_files: modified.length > 0 ? modified.length : null,
      files: {
        added,
        removed,
        modified,
      },
      raw_commit: item as unknown as Record<string, unknown>,
    }
  })
}

export function branchFromRef(ref: string): string {
  return ref.replace(/^refs\/heads\//, '')
}

export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false

  const secret = requireEnv('GITHUB_WEBHOOK_SECRET')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const expected = `sha256=${Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`

  const a = new TextEncoder().encode(expected)
  const b = new TextEncoder().encode(signatureHeader)
  if (a.byteLength !== b.byteLength) return false

  let diff = 0
  for (let i = 0; i < a.byteLength; i++) {
    diff |= a[i]! ^ b[i]!
  }
  return diff === 0
}
