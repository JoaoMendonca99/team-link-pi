'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, Copy, Download, ExternalLink, QrCode, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useProjectViewer } from '@/components/providers/project-viewer'
import { useProjectAcademics } from '@/hooks/use-project-academics'
import { useProjectCardState } from '@/hooks/use-project-card-state'
import {
  getProjectCardFilename,
  getProjectPublicUrl,
  isProjectPubliclyAccessible,
} from '@/lib/project-card'
import type { ProjectDisplay } from '@/lib/projects/display'
import { ProjectLogo } from './project-logo'
import { ProjectStatusBadge } from './project-status-badge'

export function ProjectPanelHeader({
  project,
  manager,
  canManage,
  pending,
}: {
  project: ProjectDisplay
  manager: boolean
  canManage: boolean
  pending: number
}) {
  const { data } = useProjectAcademics(project.id)
  const period = data?.context === 'academic' ? data.periods.find((p) => p.is_active) : undefined
  const historical = ['completed', 'archived'].includes(project.status)
  const { token } = useProjectViewer()
  const { row: cardState } = useProjectCardState(project.id)

  const [card, setCard] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')
  const [copyStatus, setCopyStatus] = useState('')
  const [copyError, setCopyError] = useState('')
  const preview = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    return () => {
      if (card) URL.revokeObjectURL(card)
    }
  }, [card])

  const canGenerateCard = isProjectPubliclyAccessible(project)
  const publicUrl = getProjectPublicUrl(project.slug)

  async function prepareCard() {
    if (!canGenerateCard) return
    setPreparing(true)
    setError('')
    setCopyStatus('')
    setCopyError('')
    setCard('')
    preview.current?.showModal()
    try {
      const { makeProjectCard } = await import('@/lib/project-card')
      const blob = await makeProjectCard(project, {
        token,
        hasLogo: cardState ? Boolean(cardState.image_ref) : undefined,
        url: publicUrl,
      })
      setCard(URL.createObjectURL(blob))
    } catch {
      setError('Não foi possível gerar o cartão do projeto. Tente novamente.')
    } finally {
      setPreparing(false)
    }
  }

  async function copyPublicLink() {
    setCopyStatus('')
    setCopyError('')
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopyStatus('Link público copiado para a área de transferência.')
    } catch {
      setCopyError('Não foi possível copiar o link automaticamente.')
    }
  }

  return (
    <header className="space-y-4">
      <Link
        className="inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline"
        href="/meu-espaco/projetos"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Meus projetos
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex min-w-0 items-center gap-3">
            <ProjectLogo projectId={project.id} title={project.title} />
            <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {project.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {period && (
              <span className="break-words">
                {[
                  period.discipline,
                  period.name,
                  period.advisor ? 'Orientador: ' + period.advisor : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
            <ProjectStatusBadge status={project.status} />
          </div>
          {historical && (
            <p className="text-sm text-primary">
              Projeto finalizado — somente leitura.{' '}
              <Link
                className="underline underline-offset-2"
                href={'/meu-espaco/mensagens?projeto=' + project.id}
              >
                Consultar conversas históricas
              </Link>
            </p>
          )}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button asChild variant="outline" size="sm">
            <Link href={'/projetos/' + project.slug}>
              <ExternalLink className="mr-1.5 size-4" aria-hidden />
              Página pública
            </Link>
          </Button>
          {canGenerateCard && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={preparing}
              onClick={() => void prepareCard()}
            >
              <QrCode className="mr-1.5 size-4" aria-hidden />
              Gerar cartão
            </Button>
          )}
          {manager && (
            <Button asChild variant="outline" size="sm">
              <Link id="candidaturas" href={'/projetos/' + project.slug + '/painel/candidaturas'}>
                Candidaturas
                {pending > 0 && (
                  <span
                    className="ml-1.5 rounded-full bg-primary/10 px-2 text-primary"
                    aria-label={pending + ' pendentes'}
                  >
                    {pending}
                  </span>
                )}
              </Link>
            </Button>
          )}
          {canManage && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="mr-1.5 size-4" aria-hidden />
                  Gerenciar projeto
                  <ChevronDown className="ml-1 size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={'/projetos/' + project.slug + '/editar'}>Editar informações</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={'/projetos/' + project.slug + '#equipe-do-projeto'}>
                    Gerenciar equipe
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={'/projetos/' + project.slug + '/editar#project-vacancies'}>
                    Gerenciar vagas
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={'/projetos/' + project.slug + '/editar#project-publishing'}>
                    Configurações do projeto
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {canGenerateCard && (
        <dialog
          ref={preview}
          aria-label="Prévia do cartão do projeto"
          onClose={() => {
            setError('')
            setCopyStatus('')
            setCopyError('')
          }}
          className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-4 text-card-foreground shadow-xl backdrop:bg-black/70"
        >
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Prévia do cartão do projeto</h2>
            {preparing && (
              <p role="status" className="text-sm text-muted-foreground">
                Gerando imagem…
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {card && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card}
                alt={`Cartão de divulgação do projeto ${project.title} com QR Code para a página pública`}
                className="mx-auto max-h-[65dvh] max-w-full rounded-xl object-contain"
              />
            )}
            {copyStatus && (
              <p role="status" className="text-xs text-primary">
                {copyStatus}
              </p>
            )}
            {copyError && (
              <p role="alert" className="text-xs text-destructive">
                {copyError}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  preview.current?.close()
                }}
              >
                Fechar
              </Button>
              <Button type="button" variant="outline" onClick={() => void copyPublicLink()}>
                <Copy className="mr-1.5 size-4" aria-hidden />
                Copiar link
              </Button>
              {card && (
                <Button asChild>
                  <a href={card} download={getProjectCardFilename(project.slug)}>
                    <Download className="mr-1.5 size-4" aria-hidden />
                    Baixar PNG
                  </a>
                </Button>
              )}
            </div>
          </div>
        </dialog>
      )}
    </header>
  )
}
