'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Github, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  GITHUB_LIST_AVAILABLE_USER_MESSAGE,
  GITHUB_START_USER_MESSAGE,
  linkSelectedGithubRepository,
  listAvailableGithubRepositories,
  startGithubInstallation,
} from '@/lib/github/actions'
import { savePendingGithubProject } from '@/lib/github/pending-project'
import type {
  GithubAvailableRepository,
  GithubCommitVisibility,
} from '@/lib/github/types'

type DialogPhase = 'loading' | 'pickRepository' | 'linking' | 'empty' | 'error'

export interface ConnectGithubDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectSlug: string
  onLinked?: (message: string) => void
}

export function ConnectGithubDialog({
  open,
  onClose,
  projectId,
  projectSlug,
  onLinked,
}: ConnectGithubDialogProps) {
  const [phase, setPhase] = useState<DialogPhase>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [redirecting, setRedirecting] = useState(false)

  const [accountLabel, setAccountLabel] = useState<string | null>(null)
  const [repositories, setRepositories] = useState<GithubAvailableRepository[]>([])
  const [invalidCount, setInvalidCount] = useState(0)

  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null)
  const [visibility, setVisibility] = useState<GithubCommitVisibility>('members')

  const selectableRepositories = useMemo(
    () => repositories.filter((repo) => !repo.linked_to_current_project),
    [repositories],
  )

  const selectedRepository = useMemo(
    () =>
      selectableRepositories.find((repo) => repo.github_repository_id === selectedRepoId) ??
      null,
    [selectableRepositories, selectedRepoId],
  )

  const loadAvailable = useCallback(async () => {
    setPhase('loading')
    setErrorMessage(null)
    setRepositories([])
    setInvalidCount(0)
    setAccountLabel(null)
    setSelectedRepoId(null)

    const result = await listAvailableGithubRepositories(projectId)
    if (!result.ok) {
      setPhase('error')
      setErrorMessage(result.message || GITHUB_LIST_AVAILABLE_USER_MESSAGE)
      return
    }

    setRepositories(result.repositories)
    setInvalidCount(result.invalid_installations.length)

    const account =
      result.installations[0]?.account_login ??
      result.repositories[0]?.owner_login ??
      null
    setAccountLabel(account)

    const selectable = result.repositories.filter((repo) => !repo.linked_to_current_project)
    if (selectable.length > 0) {
      setSelectedRepoId(selectable[0]!.github_repository_id)
      setPhase('pickRepository')
      return
    }

    setPhase('empty')
  }, [projectId])

  useEffect(() => {
    if (!open) return
    setRedirecting(false)
    setVisibility('members')
    void loadAvailable()
  }, [open, loadAvailable])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && phase !== 'linking' && !redirecting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, phase, redirecting])

  if (!open) return null

  const busy = phase === 'linking' || redirecting
  const showInvalidWarning = invalidCount > 0 && phase !== 'loading' && phase !== 'error'

  async function handleAuthorizeMore() {
    setRedirecting(true)
    setErrorMessage(null)
    const result = await startGithubInstallation(projectId)
    if (!result.ok) {
      setRedirecting(false)
      setErrorMessage(result.message || GITHUB_START_USER_MESSAGE)
      return
    }

    savePendingGithubProject({
      project_id: projectId,
      project_slug: projectSlug,
      panel_url: `/projetos/${projectSlug}/painel`,
      saved_at: Date.now(),
    })

    window.location.assign(result.install_url)
  }

  async function handleLink() {
    if (!selectedRepository) return
    setPhase('linking')
    setErrorMessage(null)

    const result = await linkSelectedGithubRepository({
      project_id: projectId,
      installation_id: selectedRepository.installation_id,
      github_repository_id: selectedRepository.github_repository_id,
      commit_visibility: visibility,
    })

    if (!result.ok) {
      setPhase('pickRepository')
      setErrorMessage(result.message)
      return
    }

    const message =
      result.total_commits_imported > 0
        ? `Repositório ${result.full_name} vinculado. ${result.total_commits_imported} commit(s) importado(s).`
        : `Repositório ${result.full_name} vinculado com sucesso.`

    onLinked?.(message)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-github-title"
        className="relative z-[90] flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-[1.75rem] border border-card-outline bg-card p-6 shadow-2xl"
      >
        <ConnectGithubDialogBody
          phase={phase}
          accountLabel={accountLabel}
          errorMessage={errorMessage}
          repositories={repositories}
          selectableRepositories={selectableRepositories}
          selectedRepoId={selectedRepoId}
          visibility={visibility}
          busy={busy}
          redirecting={redirecting}
          showInvalidWarning={showInvalidWarning}
          onClose={onClose}
          onRetry={() => void loadAvailable()}
          onSelectRepo={setSelectedRepoId}
          onVisibilityChange={setVisibility}
          onLink={() => void handleLink()}
          onAuthorizeMore={() => void handleAuthorizeMore()}
        />
      </div>
    </div>
  )
}

function ConnectGithubDialogBody({
  phase,
  accountLabel,
  errorMessage,
  repositories,
  selectableRepositories,
  selectedRepoId,
  visibility,
  busy,
  redirecting,
  showInvalidWarning,
  onClose,
  onRetry,
  onSelectRepo,
  onVisibilityChange,
  onLink,
  onAuthorizeMore,
}: {
  phase: DialogPhase
  accountLabel: string | null
  errorMessage: string | null
  repositories: GithubAvailableRepository[]
  selectableRepositories: GithubAvailableRepository[]
  selectedRepoId: number | null
  visibility: GithubCommitVisibility
  busy: boolean
  redirecting: boolean
  showInvalidWarning: boolean
  onClose: () => void
  onRetry: () => void
  onSelectRepo: (id: number) => void
  onVisibilityChange: (value: GithubCommitVisibility) => void
  onLink: () => void
  onAuthorizeMore: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="connect-github-title" className="font-heading text-lg font-bold">
            Conectar repositório
          </h2>
          {phase === 'pickRepository' && accountLabel ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Conta GitHub:{' '}
              <span className="font-semibold text-foreground">{accountLabel}</span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Vincule um repositório autorizado ao projeto ou conecte o GitHub para autorizar
              novos repositórios.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 rounded-xl"
          onClick={onClose}
          disabled={busy}
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {phase === 'loading' ? (
          <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
            Carregando repositórios do GitHub…
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="space-y-4 py-2">
            <p className="text-sm font-medium text-destructive" role="alert">
              {errorMessage ?? GITHUB_LIST_AVAILABLE_USER_MESSAGE}
            </p>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-2xl font-semibold"
              onClick={onRetry}
              disabled={busy}
            >
              Tentar novamente
            </Button>
          </div>
        ) : null}

        {phase === 'empty' ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Nenhum repositório GitHub autorizado foi encontrado para sua conta. Conecte o
              GitHub para escolher a conta e autorizar repositórios.
            </p>
            {repositories.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Os repositórios listados abaixo já estão vinculados a este projeto.
              </p>
            ) : null}
          </div>
        ) : null}

        {phase === 'pickRepository' || phase === 'linking' ? (
          <div className="space-y-4">
            {showInvalidWarning ? (
              <p className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                Algumas conexões GitHub antigas não puderam ser usadas. Os repositórios
                disponíveis abaixo continuam válidos.
              </p>
            ) : null}

            {errorMessage ? (
              <p className="text-sm font-medium text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}

            {repositories.length === 0 ? (
              <p className="rounded-2xl border border-card-outline bg-muted/30 p-4 text-sm text-muted-foreground">
                Nenhum repositório autorizado encontrado. Use o botão abaixo para autorizar
                repositórios no GitHub.
              </p>
            ) : (
              <ul className="space-y-2">
                {repositories.map((repo) => (
                  <RepoListItem
                    key={repo.github_repository_id}
                    repo={repo}
                    selected={selectedRepoId === repo.github_repository_id}
                    disabled={repo.linked_to_current_project || phase === 'linking'}
                    onSelect={() => onSelectRepo(repo.github_repository_id)}
                  />
                ))}
              </ul>
            )}

            {selectableRepositories.length > 0 ? (
              <fieldset className="space-y-2 rounded-2xl border border-card-outline bg-muted/20 p-4">
                <legend className="px-1 text-sm font-semibold">
                  Visibilidade dos commits no Team Link
                </legend>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="commit_visibility"
                    checked={visibility === 'members'}
                    onChange={() => onVisibilityChange('members')}
                    disabled={phase === 'linking'}
                  />
                  Apenas membros do projeto
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="commit_visibility"
                    checked={visibility === 'public'}
                    onChange={() => onVisibilityChange('public')}
                    disabled={phase === 'linking'}
                  />
                  Público (página do projeto)
                </label>
              </fieldset>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex shrink-0 flex-col gap-2 border-t border-border pt-4">
        {(phase === 'pickRepository' || phase === 'linking') &&
        selectableRepositories.length > 0 ? (
          <Button
            type="button"
            className="w-full rounded-2xl font-semibold"
            disabled={busy || selectedRepoId == null}
            onClick={onLink}
          >
            {phase === 'linking' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Vinculando…
              </>
            ) : (
              'Vincular repositório'
            )}
          </Button>
        ) : null}

        {(phase === 'empty' || phase === 'error') && !busy ? (
          <Button
            type="button"
            className="w-full rounded-2xl font-semibold"
            onClick={onAuthorizeMore}
          >
            <Github className="mr-2 h-4 w-4" />
            Conectar GitHub
          </Button>
        ) : phase !== 'loading' ? (
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-2xl font-semibold"
            disabled={busy}
            onClick={onAuthorizeMore}
          >
          {redirecting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Redirecionando…
            </>
          ) : (
            'Autorizar mais repositórios / conectar outro GitHub'
          )}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          className="w-full rounded-2xl font-semibold"
          onClick={onClose}
          disabled={busy}
        >
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function RepoListItem({
  repo,
  selected,
  disabled,
  onSelect,
}: {
  repo: GithubAvailableRepository
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const linkedHere = repo.linked_to_current_project

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className={`flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-colors ${
          linkedHere
            ? 'cursor-not-allowed border-border bg-muted/40 opacity-70'
            : selected
              ? 'border-primary bg-primary/10'
              : disabled
                ? 'cursor-not-allowed border-card-outline bg-card opacity-60'
                : 'border-card-outline bg-card hover:bg-muted/40'
        }`}
      >
        <span className="font-mono text-sm font-semibold text-foreground">{repo.full_name}</span>
        <span className="text-xs text-muted-foreground">
          {repo.private ? 'Privado' : 'Público'} · branch {repo.default_branch}
          {linkedHere ? ' · já vinculado a este projeto' : null}
          {!linkedHere && repo.linked_elsewhere ? ' · usado em outro projeto' : null}
        </span>
      </button>
    </li>
  )
}
