'use client'

import {
  ExternalLink,
  GitBranch,
  Github,
  Loader2,
  RefreshCw,
  Unlink,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  authorLabel,
  commitVisibilityLabel,
  formatRelativeCommitDate,
  formatSyncDate,
  shortSha,
} from '@/lib/github/format'
import type { GithubCommitItem, GithubRepositoryLink } from '@/lib/github/types'

interface PanelGithubSectionProps {
  repository: GithubRepositoryLink | null
  commits: GithubCommitItem[]
  repoLoading: boolean
  commitsLoading: boolean
  actionLoading: boolean
  isManager: boolean
  feedback: string | null
  onConnect: () => void
  onSync: () => void
  onUnlink: () => void
  onToggleVisibility: () => void
  onOpenCommit: (commit: GithubCommitItem) => void
}

export function PanelGithubSection({
  repository,
  commits,
  repoLoading,
  commitsLoading,
  actionLoading,
  isManager,
  feedback,
  onConnect,
  onSync,
  onUnlink,
  onToggleVisibility,
  onOpenCommit,
}: PanelGithubSectionProps) {
  return (
    <section className="space-y-6 rounded-[1.85rem] border border-card-outline bg-card p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Github className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">GitHub</h2>
            <p className="text-sm text-muted-foreground">
              Acompanhe o repositório e as últimas alterações da equipe.
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
          ) : null}
        </div>
      ) : null}

      <div className="border-t border-card-outline/70 pt-5">
        <h3 className="text-sm font-semibold">Últimos commits</h3>
        {commitsLoading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando commits…
          </div>
        ) : null}
        {!commitsLoading && repository && commits.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum commit sincronizado ainda. Peça a um responsável para sincronizar o repositório.
          </p>
        ) : null}
        {!commitsLoading && !repository ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Conecte um repositório para ver os commits aqui.
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
    </section>
  )
}
