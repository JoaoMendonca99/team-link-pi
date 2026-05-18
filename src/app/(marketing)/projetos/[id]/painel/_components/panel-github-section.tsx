'use client'

import {
  Download,
  ExternalLink,
  GitBranch,
  Github,
  Loader2,
  RefreshCw,
  Tag,
  Unlink,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  activitySourceLabel,
  authorLabel,
  commitVisibilityLabel,
  formatRelativeCommitDate,
  formatReleaseAssetSize,
  formatSyncDate,
  releaseAuthorLabel,
  releaseBodyPreview,
  releaseDisplayName,
  shortSha,
} from '@/lib/github/format'
import type {
  GithubActivitySource,
  GithubCommitItem,
  GithubReleaseItem,
  GithubRepositoryLink,
} from '@/lib/github/types'
import { cn } from '@/lib/utils'

interface PanelGithubSectionProps {
  repository: GithubRepositoryLink | null
  commits: GithubCommitItem[]
  releases: GithubReleaseItem[]
  repoLoading: boolean
  commitsLoading: boolean
  releasesLoading: boolean
  actionLoading: boolean
  isManager: boolean
  feedback: string | null
  onConnect: () => void
  onSync: () => void
  onUnlink: () => void
  onToggleVisibility: () => void
  onChangeActivitySource: (source: GithubActivitySource) => void
  onOpenCommit: (commit: GithubCommitItem) => void
  className?: string
}

export function PanelGithubSection({
  repository,
  commits,
  releases,
  repoLoading,
  commitsLoading,
  releasesLoading,
  actionLoading,
  isManager,
  feedback,
  onConnect,
  onSync,
  onUnlink,
  onToggleVisibility,
  onChangeActivitySource,
  onOpenCommit,
  className,
}: PanelGithubSectionProps) {
  const showCommits =
    repository != null &&
    (repository.activity_source === 'commits' || repository.activity_source === 'both')
  const showReleases =
    repository != null &&
    (repository.activity_source === 'releases' || repository.activity_source === 'both')

  return (
    <section
      className={cn(
        'space-y-6 rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm sm:p-8',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Github className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">GitHub</h2>
            <p className="text-sm text-muted-foreground">
              Acompanhe o repositório e a atividade recente da equipe.
            </p>
          </div>
        </div>
        {isManager && !repository && !repoLoading ? (
          <Button
            type="button"
            className="rounded-2xl font-semibold"
            onClick={onConnect}
            disabled={actionLoading}
          >
            Conectar repositório
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <p className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
          {feedback}
        </p>
      ) : null}

      {repoLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando repositório…
        </div>
      ) : null}

      {!repoLoading && !repository ? (
        <p className="text-sm text-muted-foreground">
          Nenhum repositório conectado ainda.
          {isManager ? ' Use o botão acima para vincular o projeto ao GitHub.' : ''}
        </p>
      ) : null}

      {repository ? (
        <div className="space-y-5 rounded-2xl border border-card-outline/70 bg-muted/20 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold text-foreground">
                {repository.full_name || `${repository.owner_login}/${repository.repo_name}`}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="h-3.5 w-3.5" aria-hidden />
                {repository.default_branch}
                <span aria-hidden>·</span>
                {repository.private ? 'Privado' : 'Público'}
                <span aria-hidden>·</span>
                {commitVisibilityLabel(repository.commit_visibility)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Acompanhamento: {activitySourceLabel(repository.activity_source)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Última sincronização: {formatSyncDate(repository.last_synced_at)}
              </p>
            </div>
            {repository.html_url ? (
              <Button asChild variant="outline" size="sm" className="rounded-xl font-semibold">
                <a href={repository.html_url} target="_blank" rel="noopener noreferrer">
                  Abrir no GitHub
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            ) : null}
          </div>

          {isManager ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-semibold"
                  onClick={onSync}
                  disabled={actionLoading}
                >
                  {actionLoading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Sincronizar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-semibold"
                  onClick={onToggleVisibility}
                  disabled={actionLoading}
                >
                  Alterar visibilidade
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-semibold text-destructive hover:text-destructive"
                  onClick={onUnlink}
                  disabled={actionLoading}
                >
                  <Unlink className="mr-1.5 h-3.5 w-3.5" />
                  Desconectar
                </Button>
              </div>
              <label className="flex max-w-md flex-col gap-1.5 text-sm">
                <span className="font-semibold">Alterar acompanhamento</span>
                <select
                  className="rounded-xl border border-card-outline bg-background px-3 py-2 text-sm"
                  value={repository.activity_source}
                  disabled={actionLoading}
                  onChange={(event) =>
                    onChangeActivitySource(event.target.value as GithubActivitySource)
                  }
                >
                  <option value="commits">Commits</option>
                  <option value="releases">Releases / versões</option>
                  <option value="both">Commits e releases</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
      ) : null}

      {showCommits ? (
        <div className="border-t border-card-outline/70 pt-5">
          <h3 className="text-sm font-semibold">Últimos commits</h3>
          {commitsLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando commits…
            </div>
          ) : null}
          {!commitsLoading && commits.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhum commit sincronizado ainda. Peça a um responsável para sincronizar o repositório.
            </p>
          ) : null}
          {commits.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {commits.map((commit) => (
                <li key={commit.sha}>
                  <button
                    type="button"
                    onClick={() => onOpenCommit(commit)}
                    className="flex w-full flex-col gap-1 rounded-2xl border border-card-outline/60 bg-background/60 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <span className="font-mono text-xs font-semibold text-primary">
                      {shortSha(commit.sha, commit.short_sha)}
                    </span>
                    <span className="line-clamp-2 text-sm font-medium text-foreground">
                      {commit.message || 'Sem mensagem'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {authorLabel(commit)} · {formatRelativeCommitDate(commit.committed_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {showReleases ? (
        <div
          className={
            showCommits ? 'border-t border-card-outline/70 pt-5' : 'border-t border-card-outline/70 pt-5'
          }
        >
          <h3 className="text-sm font-semibold">Últimas versões</h3>
          {releasesLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando releases…
            </div>
          ) : null}
          {!releasesLoading && releases.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhuma release publicada ainda.
            </p>
          ) : null}
          {releases.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {releases.map((release) => (
                <li
                  key={`${release.github_release_id}-${release.tag_name}`}
                  className="rounded-2xl border border-card-outline/60 bg-background/60 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 font-mono text-xs font-semibold text-primary">
                        <Tag className="h-3.5 w-3.5" aria-hidden />
                        {release.tag_name}
                      </p>
                      <p className="mt-1 text-sm font-medium text-foreground">
                        {releaseDisplayName(release)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {releaseAuthorLabel(release)}
                        {release.published_at
                          ? ` · ${formatRelativeCommitDate(release.published_at)}`
                          : ''}
                        {release.prerelease ? ' · pré-release' : ''}
                        {release.draft ? ' · rascunho' : ''}
                      </p>
                    </div>
                    {release.html_url ? (
                      <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
                        <a href={release.html_url} target="_blank" rel="noopener noreferrer">
                          Ver release no GitHub
                          <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  {releaseBodyPreview(release.body) ? (
                    <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">
                      {releaseBodyPreview(release.body)}
                    </p>
                  ) : null}
                  {release.assets.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {release.assets.map((asset) => (
                        <li key={`${asset.name}-${asset.id ?? asset.browser_download_url}`}>
                          {asset.browser_download_url ? (
                            <a
                              href={asset.browser_download_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 rounded-xl border border-card-outline/50 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                            >
                              <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                              <span className="min-w-0 flex-1 truncate font-medium">
                                {asset.name}
                              </span>
                              {asset.size ? (
                                <span className="shrink-0 text-xs text-muted-foreground">
                                  {formatReleaseAssetSize(asset.size)}
                                </span>
                              ) : null}
                            </a>
                          ) : (
                            <span className="block px-3 py-2 text-sm text-muted-foreground">
                              {asset.name}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {!repository && !repoLoading ? (
        <p className="text-sm text-muted-foreground">
          Conecte um repositório para ver a atividade do GitHub aqui.
        </p>
      ) : null}
    </section>
  )
}
