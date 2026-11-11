'use client'

import { ExternalLink, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { AccessibleDialog } from '@/components/ui/accessible-dialog'
import {
  authorLabel,
  formatCommitDate,
  listChangedFiles,
  shortSha,
} from '@/lib/github/format'
import type { GithubCommitItem } from '@/lib/github/types'

interface CommitDetailModalProps {
  commit: GithubCommitItem | null
  onClose: () => void
}

export function CommitDetailModal({ commit, onClose }: CommitDetailModalProps) {
  if (!commit) return null

  const files = listChangedFiles(commit.files)
  const hasStats =
    commit.additions != null || commit.deletions != null || commit.changed_files != null

  return (
    <AccessibleDialog open label="Detalhes do commit" onClose={onClose} className="max-w-lg p-4 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Commit
            </p>
            <h2 id="commit-detail-title" className="mt-1 font-heading text-lg font-bold">
              {shortSha(commit.sha, commit.short_sha)}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-xl"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="text-sm font-medium text-foreground">{commit.message || 'Sem mensagem'}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          {authorLabel(commit)} · {formatCommitDate(commit.committed_at)}
        </p>

        {hasStats ? (
          <ul className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {commit.changed_files != null ? (
              <li>{commit.changed_files} arquivo(s)</li>
            ) : null}
            {commit.additions != null ? <li>+{commit.additions}</li> : null}
            {commit.deletions != null ? <li>-{commit.deletions}</li> : null}
          </ul>
        ) : null}

        {files.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Arquivos alterados
            </p>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-foreground">
              {files.map((file) => (
                <li key={file} className="truncate font-mono">
                  {file}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-dashed border-card-outline bg-muted/30 p-4">
          <p className="text-sm font-medium text-foreground">Comentários da equipe</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Em breve você poderá comentar commits diretamente por aqui.
          </p>
        </div>

        {commit.commit_url ? (
          <Button asChild variant="outline" className="mt-6 w-full rounded-2xl font-semibold">
            <a href={commit.commit_url} target="_blank" rel="noopener noreferrer">
              Ver no GitHub
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        ) : null}
    </AccessibleDialog>
  )
}
