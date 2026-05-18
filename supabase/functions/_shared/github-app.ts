import { getGitHubPrivateKeyPem, requireEnv } from './env.ts'
import { importGithubAppSigningKeyFromPem } from './github-rsa-import.ts'

export { importGithubAppSigningKeyFromPem } from './github-rsa-import.ts'

const GITHUB_API = 'https://api.github.com'

const GH_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly githubMessage?: string,
  ) {
    super(message)
    this.name = 'GitHubApiError'
  }

  toSanitizedDetails(): Record<string, unknown> {
    return {
      http_status: this.status,
      github_message: this.githubMessage ?? null,
    }
  }
}

export class GitHubPrivateKeyError extends Error {
  constructor(message?: string, options?: { cause?: unknown }) {
    super(message ?? 'Chave privada do GitHub App inválida ou mal formatada.', options)
    this.name = 'GitHubPrivateKeyError'
  }
}

type JoseModule = typeof import('https://esm.sh/jose@5.9.6')
let joseModulePromise: Promise<JoseModule> | null = null

async function loadJose(): Promise<JoseModule> {
  if (!joseModulePromise) {
    joseModulePromise = import('https://esm.sh/jose@5.9.6').catch((error) => {
      joseModulePromise = null
      console.error('[github-app] jose_import_failed', {
        error_name: error instanceof Error ? error.name : 'unknown',
      })
      throw new GitHubPrivateKeyError('Biblioteca JWT indisponível no runtime.', {
        cause: error,
      })
    })
  }
  return joseModulePromise
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
  account_id: number | null
  account_login: string
  account_type: string
  target_type: string
  status: string
}

export interface GitHubCommitListItem {
  sha: string
  html_url: string
  commit: {
    message?: string
    author?: {
      name: string | null
      email: string | null
      date: string
    } | null
    committer?: {
      name: string | null
      email: string | null
      date: string
    } | null
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

async function readGitHubErrorBody(response: Response): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as { message?: string }
    const message = payload?.message?.trim()
    return message || undefined
  } catch {
    return undefined
  }
}

async function importGitHubPrivateKey(pem: string): Promise<CryptoKey> {
  return importGithubAppSigningKeyFromPem(pem)
}

export async function createGitHubAppJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (cachedAppJwt && cachedAppJwt.expiresAt > now + 30) {
    return cachedAppJwt.token
  }

  const appId = requireEnv('GITHUB_APP_ID')
  let pem: string
  try {
    pem = getGitHubPrivateKeyPem()
  } catch (error) {
    console.error('[github-app] github_private_key_invalid', {
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    throw new GitHubPrivateKeyError(undefined, { cause: error })
  }

  let privateKey: CryptoKey
  try {
    privateKey = await importGitHubPrivateKey(pem)
  } catch (error) {
    console.error('[github-app] github_private_key_invalid', {
      hint: 'Verifique GITHUB_PRIVATE_KEY (PEM completo, com quebras de linha).',
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    throw new GitHubPrivateKeyError(undefined, { cause: error })
  }

  let token: string
  try {
    const jose = await loadJose()
    token = await new jose.SignJWT({})
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(now - 60)
      .setExpirationTime(now + 9 * 60)
      .setIssuer(appId)
      .sign(privateKey)
  } catch (error) {
    console.error('[github-app] github_jwt_failed', {
      error_name: error instanceof Error ? error.name : 'unknown',
    })
    throw new GitHubPrivateKeyError(undefined, { cause: error })
  }

  cachedAppJwt = { token, expiresAt: now + 9 * 60 }
  return token
}

async function mapGitHubError(response: Response): Promise<GitHubApiError> {
  const githubMessage = await readGitHubErrorBody(response)

  if (response.status === 404) {
    return new GitHubApiError(
      'Recurso não encontrado no GitHub para esta instalação.',
      404,
      githubMessage,
    )
  }
  if (response.status === 401) {
    return new GitHubApiError(
      'Credenciais do GitHub App rejeitadas. Verifique App ID e chave privada.',
      401,
      githubMessage,
    )
  }
  if (response.status === 403) {
    return new GitHubApiError('Sem permissão para acessar este recurso no GitHub.', 403, githubMessage)
  }
  if (response.status === 429) {
    return new GitHubApiError(
      'Limite de requisições do GitHub atingido. Tente novamente em instantes.',
      429,
      githubMessage,
    )
  }
  return new GitHubApiError(
    'Não foi possível comunicar com o GitHub.',
    response.status >= 400 ? response.status : 502,
    githubMessage,
  )
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

  if (!response.ok) {
    throw await mapGitHubError(response)
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

export async function fetchInstallation(installationId: number): Promise<GitHubInstallationMeta> {
  const appJwt = await createGitHubAppJwt()
  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}`, {
    headers: {
      ...GH_HEADERS,
      Authorization: `Bearer ${appJwt}`,
    },
  })

  if (!response.ok) {
    throw await mapGitHubError(response)
  }

  const data = (await response.json()) as {
    id?: number
    app_id?: number
    target_type?: string
    suspended_at?: string | null
    account?: { id?: number; login?: string; type?: string }
  }

  const accountId = data.account?.id
  if (!accountId || !Number.isFinite(accountId)) {
    throw new GitHubApiError('Instalação do GitHub sem conta associada.', 502)
  }

  const appId = Number(data.app_id ?? requireEnv('GITHUB_APP_ID'))

  return {
    installation_id: data.id ?? installationId,
    app_id: appId,
    account_id: accountId,
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
    throw await mapGitHubError(response)
  }
  return (await response.json()) as GitHubRepo
}

export async function fetchRepositoryById(
  accessToken: string,
  githubRepositoryId: number,
): Promise<GitHubRepo> {
  const response = await githubFetch(`/repositories/${githubRepositoryId}`, accessToken)
  if (!response.ok) {
    throw await mapGitHubError(response)
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

export interface PublicGithubRepository {
  id: number
  name: string
  full_name: string
  owner_login: string
  private: boolean
  default_branch: string
  html_url: string
  github_repository_id: number
  repo_name: string
}

export function mapRepoToPublic(repository: GitHubRepo): PublicGithubRepository {
  const safe = mapRepoToSafe(repository)
  return {
    id: safe.github_repository_id,
    name: safe.repo_name,
    full_name: safe.full_name,
    owner_login: safe.owner_login,
    private: safe.private,
    default_branch: safe.default_branch,
    html_url: safe.html_url,
    github_repository_id: safe.github_repository_id,
    repo_name: safe.repo_name,
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
      throw await mapGitHubError(response)
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
    throw await mapGitHubError(response)
  }
  return (await response.json()) as GitHubCommitListItem[]
}

export function normalizeApiCommits(commits: GitHubCommitListItem[]): NormalizedCommit[] {
  return commits.map((item) => ({
    sha: item.sha,
    message: item.commit.message ?? '',
    author_name: item.commit.author?.name ?? item.commit.committer?.name ?? null,
    author_email: item.commit.author?.email ?? item.commit.committer?.email ?? null,
    github_username: item.author?.login ?? null,
    committed_at:
      item.commit.author?.date ?? item.commit.committer?.date ?? '',
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

export interface GitHubReleaseAsset {
  id?: number
  name?: string
  label?: string | null
  content_type?: string | null
  size?: number
  download_count?: number
  browser_download_url?: string | null
}

export interface GitHubReleaseItem {
  id: number
  tag_name: string
  name?: string | null
  body?: string | null
  html_url: string
  draft?: boolean
  prerelease?: boolean
  author?: { login?: string | null } | null
  published_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  assets?: GitHubReleaseAsset[]
}

export interface NormalizedRelease {
  github_release_id: number
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  draft: boolean
  prerelease: boolean
  author_login: string | null
  published_at: string | null
  created_at_github: string | null
  updated_at_github: string | null
  assets: GitHubReleaseAsset[]
  raw_release: Record<string, unknown>
}

export async function listRepositoryReleases(
  accessToken: string,
  ownerLogin: string,
  repoName: string,
  perPage = 30,
): Promise<GitHubReleaseItem[]> {
  const params = new URLSearchParams({ per_page: String(perPage) })
  const response = await githubFetch(
    `/repos/${ownerLogin}/${repoName}/releases?${params.toString()}`,
    accessToken,
  )
  if (!response.ok) {
    throw await mapGitHubError(response)
  }
  const data = (await response.json()) as GitHubReleaseItem[]
  return Array.isArray(data) ? data : []
}

export function normalizeApiReleases(releases: GitHubReleaseItem[]): NormalizedRelease[] {
  return releases
    .filter((item) => Number.isFinite(item.id) && item.id > 0)
    .map((item) => normalizeReleaseItem(item))
}

export function normalizeWebhookRelease(release: GitHubReleaseItem): NormalizedRelease {
  return normalizeReleaseItem(release)
}

function normalizeReleaseItem(item: GitHubReleaseItem): NormalizedRelease {
  const assets = Array.isArray(item.assets) ? item.assets : []
  return {
    github_release_id: item.id,
    tag_name: item.tag_name?.trim() ? item.tag_name.trim() : `release-${item.id}`,
    name: item.name?.trim() ? item.name.trim() : null,
    body: item.body ?? null,
    html_url: item.html_url ?? '',
    draft: Boolean(item.draft),
    prerelease: Boolean(item.prerelease),
    author_login: item.author?.login?.trim() ? item.author.login.trim() : null,
    published_at: item.published_at ?? null,
    created_at_github: item.created_at ?? null,
    updated_at_github: item.updated_at ?? null,
    assets,
    raw_release: item as unknown as Record<string, unknown>,
  }
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
