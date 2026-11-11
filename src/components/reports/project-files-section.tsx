'use client'

import { useRef, useState } from 'react'
import { AlertCircle, Download, Eye, FileText, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  deleteProjectFile,
  formatFileSize,
  readDocument,
  saveBlob,
  uploadProjectFile,
  type ProjectFile,
} from '@/lib/project-documents'

interface ProjectFilesSectionProps {
  projectId: string
  files: ProjectFile[]
  manager: boolean
  readOnly: boolean
  onChanged: () => Promise<void>
}

export function ProjectFilesSection({
  projectId,
  files,
  manager,
  readOnly,
  onChanged,
}: ProjectFilesSectionProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [replacingId, setReplacingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const uploadInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const fileToDelete = files.find((f) => f.id === confirmDeleteId)

  function validateChosenFile(file: File): string | null {
    if (file.size > 10 * 1024 * 1024) {
      return 'O arquivo excede o limite máximo de 10 MB.'
    }
    const ext = file.name.split('.').at(-1)?.toLowerCase()
    if (!ext || !['pdf', 'docx'].includes(ext)) {
      return 'Formato não permitido. Envie apenas arquivos PDF ou DOCX.'
    }
    return null
  }

  async function handleUploadSelected(file: File, replaceTargetId?: string) {
    const validationError = validateChosenFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      await uploadProjectFile(projectId, file, file.name, replaceTargetId)
      await onChanged()
      setNotice(replaceTargetId ? 'Arquivo substituído com sucesso.' : 'Arquivo adicionado com sucesso.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.')
    } finally {
      setBusy(false)
      setReplacingId(null)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
      if (replaceInputRef.current) replaceInputRef.current.value = ''
    }
  }

  async function handleDownload(file: ProjectFile) {
    setBusy(true)
    setError('')
    try {
      const blob = await readDocument('project', file.id)
      saveBlob(blob, file.filename || file.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível baixar o arquivo.')
    } finally {
      setBusy(false)
    }
  }

  async function handleView(file: ProjectFile) {
    setBusy(true)
    setError('')
    try {
      const blob = await readDocument('project', file.id)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível visualizar o arquivo.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteConfirmed() {
    if (!confirmDeleteId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await deleteProjectFile(confirmDeleteId)
      await onChanged()
      setNotice('Arquivo removido com sucesso.')
      setConfirmDeleteId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover o arquivo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="project-files-heading" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="project-files-heading" className="text-lg font-semibold">
            Arquivos do projeto
          </h2>
          <p className="text-sm text-muted-foreground">
            Adicione documentos para reutilizar nos próximos pacotes de documentação.
          </p>
        </div>
        {manager && !readOnly && (
          <div>
            <Button
              type="button"
              disabled={busy}
              onClick={() => uploadInputRef.current?.click()}
              className="gap-2"
            >
              <Plus className="size-4" aria-hidden />
              Adicionar arquivo
            </Button>
            <input
              ref={uploadInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              aria-label="Selecionar arquivo para upload"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void handleUploadSelected(f)
              }}
            />
            <input
              ref={replaceInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              aria-label="Selecionar arquivo para substituição"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f && replacingId) void handleUploadSelected(f, replacingId)
              }}
            />
          </div>
        )}
      </header>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-card-outline bg-card/50 p-8 text-center">
          <FileText className="size-10 text-muted-foreground/60" aria-hidden />
          <h3 className="mt-3 text-sm font-semibold">Nenhum arquivo permanente adicionado</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            Envie arquivos PDF ou DOCX (até 10 MB) para ficarem salvos no projeto e prontos para seleção nos próximos pacotes ZIP.
          </p>
          {manager && !readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="mt-4 gap-2"
              onClick={() => uploadInputRef.current?.click()}
            >
              <Plus className="size-4" aria-hidden />
              Enviar primeiro arquivo
            </Button>
          )}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {files.map((file) => {
            const isDocx = file.mime.includes('word') || file.filename.endsWith('.docx')
            const dateLabel = new Date(file.created_at).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
            return (
              <li
                key={file.id}
                className="flex flex-col justify-between gap-3 rounded-2xl border border-card-outline bg-card p-4 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-primary">
                    <FileText className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium" title={file.name}>
                      {file.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {isDocx ? 'DOCX' : 'PDF'} · {formatFileSize(file.size)} · {dateLabel}
                    </p>
                    {file.uploader?.full_name && (
                      <p className="text-[11px] text-muted-foreground/80 truncate">
                        Enviado por: {file.uploader.full_name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5 border-t pt-2.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="h-8 px-2 text-xs gap-1"
                    onClick={() => void handleView(file)}
                    title="Visualizar documento"
                  >
                    <Eye className="size-3.5" aria-hidden />
                    Visualizar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="h-8 px-2 text-xs gap-1"
                    onClick={() => void handleDownload(file)}
                    title="Baixar documento"
                  >
                    <Download className="size-3.5" aria-hidden />
                    Baixar
                  </Button>

                  {manager && !readOnly && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        className="h-8 px-2 text-xs gap-1"
                        onClick={() => {
                          setReplacingId(file.id)
                          replaceInputRef.current?.click()
                        }}
                        title="Substituir por versão atualizada"
                      >
                        <RefreshCw className="size-3.5" aria-hidden />
                        Substituir
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        className="h-8 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirmDeleteId(file.id)}
                        title="Remover documento"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Remover
                      </Button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/* Confirmação de exclusão */}
      {confirmDeleteId && fileToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h3 id="confirm-delete-title" className="text-base font-semibold">
                Remover arquivo do projeto?
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => setConfirmDeleteId(null)}
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              O documento <strong>{fileToDelete.name}</strong> será excluído permanentemente do projeto e não entrará mais nos futuros pacotes ZIP.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                onClick={() => void handleDeleteConfirmed()}
                className="gap-2"
              >
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Confirmar remoção
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
