'use client'

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { GithubCommitVisibility } from '@/lib/github/types'

export interface LinkGithubDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (input: {
    installation_id: number
    owner: string
    repo: string
    commit_visibility: GithubCommitVisibility
  }) => Promise<{ ok: true } | { ok: false; message: string }>
}

export function LinkGithubDialog({ open, onClose, onSubmit }: LinkGithubDialogProps) {
  const [installationId, setInstallationId] = useState('')
  const [owner, setOwner] = useState('')
  const [repo, setRepo] = useState('')
  const [visibility, setVisibility] = useState<GithubCommitVisibility>('members')
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErrorMessage(null)
    setInstallationId('')
    setOwner('')
    setRepo('')
    setVisibility('members')
  }, [open])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, saving])

  if (!open) return null

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsedInstallation = Number(installationId.trim())
    if (!Number.isFinite(parsedInstallation) || parsedInstallation <= 0) {
      setErrorMessage('Informe o ID da instalação do GitHub.')
      return
    }
    if (!owner.trim() || !repo.trim()) {
      setErrorMessage('Informe o dono e o nome do repositório.')
      return
    }

    setSaving(true)
    setErrorMessage(null)
    const result = await onSubmit({
      installation_id: parsedInstallation,
      owner: owner.trim(),
      repo: repo.trim(),
      commit_visibility: visibility,
    })
    setSaving(false)
    if (!result.ok) {
      setErrorMessage(result.message)
      return
    }
    onClose()
  }

  return (
    <>
      <button
        type="button"
        aria-label="Fechar"
        className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm"
        onClick={() => {
          if (!saving) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-github-title"
        className="fixed inset-x-4 top-[10vh] z-[90] mx-auto max-h-[80vh] w-full max-w-md overflow-y-auto rounded-[1.75rem] border border-card-outline bg-card p-6 shadow-2xl sm:inset-x-auto"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="link-github-title" className="font-heading text-lg font-bold">
              Conectar repositório
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Instale o app do Team Link no GitHub e vincule o repositório da equipe.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-xl"
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mb-4 rounded-2xl border border-card-outline bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          No GitHub, abra{' '}
          <a
            href="https://github.com/settings/installations"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            Configurações → Aplicativos instalados
          </a>{' '}
          e copie o ID da instalação do app Team Link. Depois informe dono e nome do repositório
          (ex.: <span className="font-mono">uniso-tech</span> e{' '}
          <span className="font-mono">meu-projeto</span>).
        </p>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-foreground">ID da instalação</span>
            <Input
              value={installationId}
              onChange={(event) => setInstallationId(event.target.value)}
              placeholder="Ex.: 12345678"
              inputMode="numeric"
              className="rounded-xl"
              disabled={saving}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Dono</span>
              <Input
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="organização ou usuário"
                className="rounded-xl"
                disabled={saving}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-foreground">Repositório</span>
              <Input
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder="nome-do-repo"
                className="rounded-xl"
                disabled={saving}
              />
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-foreground">
              Visibilidade dos commits no Team Link
            </legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="commit_visibility"
                checked={visibility === 'members'}
                onChange={() => setVisibility('members')}
                disabled={saving}
              />
              Somente membros do projeto
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="commit_visibility"
                checked={visibility === 'public'}
                onChange={() => setVisibility('public')}
                disabled={saving}
              />
              Visível na página pública do projeto
            </label>
          </fieldset>

          {errorMessage ? (
            <p className="text-sm font-medium text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-2xl font-semibold"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="submit" className="rounded-2xl font-semibold" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Conectando…
                </>
              ) : (
                'Conectar'
              )}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
