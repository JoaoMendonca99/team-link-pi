'use client'

import { useEffect, useState } from 'react'
import { Github, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  GITHUB_START_USER_MESSAGE,
  startGithubInstallation,
} from '@/lib/github/actions'
import { savePendingGithubProject } from '@/lib/github/pending-project'

export interface ConnectGithubDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
  projectSlug: string
}

export function ConnectGithubDialog({
  open,
  onClose,
  projectId,
  projectSlug,
}: ConnectGithubDialogProps) {
  const [starting, setStarting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErrorMessage(null)
    setStarting(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !starting) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, starting])

  if (!open) return null

  async function handleContinue() {
    setStarting(true)
    setErrorMessage(null)
    const result = await startGithubInstallation(projectId)
    if (!result.ok) {
      setStarting(false)
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

  return (
    <>
      <button
        type="button"
        aria-label="Fechar"
        className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm"
        onClick={() => {
          if (!starting) onClose()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-github-title"
        className="fixed inset-x-4 top-[12vh] z-[90] mx-auto w-full max-w-md rounded-[1.75rem] border border-card-outline bg-card p-6 shadow-2xl sm:inset-x-auto"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="connect-github-title" className="font-heading text-lg font-bold">
              Conectar GitHub
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Conecte o GitHub para mostrar commits do projeto no Team Link. Você será
              redirecionado ao GitHub para escolher a conta e os repositórios.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-xl"
            onClick={onClose}
            disabled={starting}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {errorMessage ? (
          <p className="mb-4 text-sm font-medium text-destructive" role="alert">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="rounded-2xl font-semibold"
            onClick={onClose}
            disabled={starting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="rounded-2xl font-semibold"
            disabled={starting}
            onClick={() => void handleContinue()}
          >
            {starting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Redirecionando…
              </>
            ) : (
              <>
                <Github className="mr-2 h-4 w-4" />
                Continuar com GitHub
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
