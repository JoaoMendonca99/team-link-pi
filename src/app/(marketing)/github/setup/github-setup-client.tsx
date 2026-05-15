'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Github, Loader2, Lock } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { EmptyState } from '@/components/team-link/empty-state'
import { Button } from '@/components/ui/button'
import {
  completeGithubInstallation,
  linkSelectedGithubRepository,
} from '@/lib/github/actions'
import type {
  GithubCommitVisibility,
  GithubCompleteInstallationResult,
  GithubSelectableRepository,
} from '@/lib/github/types'
import { useSupabaseSession } from '@/hooks/use-supabase-session'

type SetupPhase = 'loading' | 'select' | 'linking' | 'done' | 'error' | 'auth'

export function GithubSetupClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, loading: sessionLoading } = useSupabaseSession()

  const installationIdParam = searchParams.get('installation_id')
  const setupAction = searchParams.get('setup_action')
  const stateParam = searchParams.get('state')

  const installationId = useMemo(() => {
    if (!installationIdParam) return null
    const parsed = Number(installationIdParam)
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null
  }, [installationIdParam])

  const returnPath = useMemo(() => {
    const query = searchParams.toString()
    return query ? `/github/setup?${query}` : '/github/setup'
  }, [searchParams])

  const [phase, setPhase] = useState<SetupPhase>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [setupData, setSetupData] = useState<GithubCompleteInstallationResult | null>(null)
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null)
  const [visibility, setVisibility] = useState<GithubCommitVisibility>('members')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const runComplete = useCallback(async () => {
    if (!installationId || !stateParam?.trim()) {
      setPhase('error')
      setErrorMessage('Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.')
      return
    }

    setPhase('loading')
    setErrorMessage(null)

    const result = await completeGithubInstallation({
      installation_id: installationId,
      setup_action: setupAction,
      state: stateParam.trim(),
    })

    if (!result.ok) {
      setPhase('error')
      setErrorMessage(result.message)
      return
    }

    setSetupData(result.data)
    if (result.data.repositories.length === 1) {
      setSelectedRepoId(result.data.repositories[0]!.github_repository_id)
    }
    setPhase('select')
  }, [installationId, setupAction, stateParam])

  useEffect(() => {
    if (sessionLoading) return

    if (!installationId || !stateParam?.trim()) {
      setPhase('error')
      setErrorMessage('Link de retorno do GitHub incompleto. Tente conectar novamente pelo painel.')
      return
    }

    if (!isAuthenticated) {
      setPhase('auth')
      return
    }

    void runComplete()
  }, [installationId, isAuthenticated, runComplete, sessionLoading, stateParam])

  async function handleLink() {
    if (!setupData || selectedRepoId == null) {
      setErrorMessage('Selecione um repositório para continuar.')
      return
    }

    setPhase('linking')
    setErrorMessage(null)

    const result = await linkSelectedGithubRepository({
      project_id: setupData.project_id,
      installation_id: setupData.installation_id,
      github_repository_id: selectedRepoId,
      commit_visibility: visibility,
    })

    if (!result.ok) {
      setPhase('select')
      setErrorMessage(result.message)
      return
    }

    setSuccessMessage(
      result.total_commits_imported > 0
        ? `Repositório ${result.full_name} conectado. ${result.total_commits_imported} commit(s) importado(s).`
        : `Repositório ${result.full_name} conectado com sucesso.`,
    )
    setPhase('done')
  }

  const panelHref = setupData?.project_slug
    ? `/projetos/${setupData.project_slug}/painel`
    : null

  if (sessionLoading || phase === 'loading') {
    return (
      <main className="bg-background">
        <Container className="flex min-h-[50vh] flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-medium text-muted-foreground">
            Finalizando conexão com o GitHub…
          </p>
        </Container>
      </main>
    )
  }

  if (phase === 'auth') {
    return (
      <main className="bg-background pb-20">
        <Container className="py-16">
          <EmptyState
            icon={Lock}
            title="Entre para continuar"
            description="Você precisa estar conectado no Team Link para concluir a integração com o GitHub."
            className="mx-auto max-w-lg"
          />
          <div className="mx-auto mt-6 flex max-w-lg flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild className="rounded-2xl font-semibold">
              <Link href={`/login?next=${encodeURIComponent(returnPath)}`}>Entrar</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  if (phase === 'error') {
    return (
      <main className="bg-background pb-20">
        <Container className="py-16">
          <EmptyState
            icon={Github}
            title="Não foi possível conectar"
            description={errorMessage ?? 'Tente novamente pelo painel do projeto.'}
            className="mx-auto max-w-lg"
          />
          <div className="mx-auto mt-6 flex max-w-lg justify-center">
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link href="/meus-projetos">Ir para meus projetos</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  if (phase === 'done') {
    return (
      <main className="bg-background pb-20">
        <Container className="mx-auto max-w-lg space-y-6 py-16">
          <div className="rounded-[1.75rem] border border-card-outline bg-card p-8 text-center shadow-sm">
            <Github className="mx-auto h-10 w-10 text-primary" aria-hidden />
            <h1 className="mt-4 font-heading text-xl font-bold">GitHub conectado</h1>
            <p className="mt-2 text-sm text-muted-foreground">{successMessage}</p>
            {panelHref ? (
              <Button asChild className="mt-6 w-full rounded-2xl font-semibold">
                <Link href={panelHref}>Voltar ao painel</Link>
              </Button>
            ) : (
              <Button
                type="button"
                className="mt-6 w-full rounded-2xl font-semibold"
                onClick={() => router.push('/meus-projetos')}
              >
                Ir para meus projetos
              </Button>
            )}
          </div>
        </Container>
      </main>
    )
  }

  const repositories = setupData?.repositories ?? []

  return (
    <main className="bg-background pb-20">
      <Container className="mx-auto max-w-xl space-y-6 py-12 sm:py-16">
        <div>
          <h1 className="font-heading text-2xl font-bold">Escolha o repositório</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Selecione qual repositório do GitHub será vinculado a este projeto no Team Link.
          </p>
        </div>

        {errorMessage ? (
          <p className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        {repositories.length === 0 ? (
          <div className="rounded-2xl border border-card-outline bg-muted/30 p-6 text-sm text-muted-foreground">
            Nenhum repositório autorizado foi encontrado nesta instalação. Volte ao GitHub e
            conceda acesso a pelo menos um repositório.
          </div>
        ) : (
          <ul className="space-y-2">
            {repositories.map((repo) => (
              <RepoOption
                key={repo.github_repository_id}
                repo={repo}
                selected={selectedRepoId === repo.github_repository_id}
                onSelect={() => setSelectedRepoId(repo.github_repository_id)}
              />
            ))}
          </ul>
        )}

        <fieldset className="space-y-2 rounded-2xl border border-card-outline bg-card p-4">
          <legend className="px-1 text-sm font-semibold">
            Visibilidade dos commits no Team Link
          </legend>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="commit_visibility"
              checked={visibility === 'members'}
              onChange={() => setVisibility('members')}
              disabled={phase === 'linking'}
            />
            Somente membros do projeto
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name="commit_visibility"
              checked={visibility === 'public'}
              onChange={() => setVisibility('public')}
              disabled={phase === 'linking'}
            />
            Visível na página pública do projeto
          </label>
        </fieldset>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {panelHref ? (
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link href={panelHref}>Cancelar</Link>
            </Button>
          ) : null}
          <Button
            type="button"
            className="rounded-2xl font-semibold"
            disabled={phase === 'linking' || selectedRepoId == null || repositories.length === 0}
            onClick={() => void handleLink()}
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
        </div>
      </Container>
    </main>
  )
}

function RepoOption({
  repo,
  selected,
  onSelect,
}: {
  repo: GithubSelectableRepository
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full flex-col gap-1 rounded-2xl border px-4 py-3 text-left transition-colors ${
          selected
            ? 'border-primary bg-primary/10'
            : 'border-card-outline bg-card hover:bg-muted/40'
        }`}
      >
        <span className="font-mono text-sm font-semibold text-foreground">{repo.full_name}</span>
        <span className="text-xs text-muted-foreground">
          {repo.private ? 'Privado' : 'Público'} · branch {repo.default_branch}
        </span>
      </button>
    </li>
  )
}
