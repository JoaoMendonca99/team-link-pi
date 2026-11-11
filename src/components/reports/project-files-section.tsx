'use client'

import { useRef, useState } from 'react'
import { AlertCircle, Download, Eye, FileText, Loader2, Plus, Trash2, X } from 'lucide-react'
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const uploadInputRef = useRef<HTMLInputElement>(null)

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

  async function handleUploadSelected(file: File) {
    const validationError = validateChosenFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setBusy(true)
    setError('')
    setNotice('')
    try {
      await uploadProjectFile(projectId, file, file.name)
      await onChanged()
      setNotice('Arquivo adicionado com sucesso.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível enviar o arquivo.')
    } finally {
      setBusy(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
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

  async function handleViewAbntGuide() {
    setBusy(true)
    setError('')
    try {
      const exports = await import('@/lib/documentation-export')
      const font = await exports.loadDocumentationFont()
      const pdf = exports.createAbntGuide(font)
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível visualizar o Guia ABNT.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadAbntGuide() {
    setBusy(true)
    setError('')
    try {
      const exports = await import('@/lib/documentation-export')
      const font = await exports.loadDocumentationFont()
      const pdf = exports.createAbntGuide(font)
      const blob = pdf.output('blob')
      saveBlob(blob, 'Guia_ABNT_TeamLink.pdf')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível baixar o Guia ABNT.')
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
      setNotice('Arquivo excluído com sucesso.')
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
            Documentos disponíveis e arquivos salvos para compor os pacotes de documentação.
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

      <ul className="grid gap-3 sm:grid-cols-2">
        {/* Item 1 permanente: Guia ABNT — Documento padrão do sistema */}
        <li
          key="builtin-abnt-guide"
          className="flex flex-col justify-between gap-3 rounded-2xl border border-card-outline bg-card p-4 transition-colors"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-primary">
              <FileText className="size-5" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-sm font-medium" title="Guia ABNT — Team Link.pdf">
                  Guia ABNT — Team Link.pdf
                </h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary shrink-0">
                  Padrão
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Documento padrão do sistema · PDF
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 border-t pt-2.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              className="h-8 px-2 text-xs gap-1"
              onClick={() => void handleViewAbntGuide()}
              title="Visualizar documento padrão"
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
              onClick={() => void handleDownloadAbntGuide()}
              title="Baixar documento padrão"
            >
              <Download className="size-3.5" aria-hidden />
              Baixar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled
              className="h-8 px-2 text-xs gap-1 text-muted-foreground/40 cursor-not-allowed opacity-50"
              aria-label="Excluir documento padrão desabilitado"
              title="Documento padrão do sistema não pode ser removido"
            >
              <Trash2 className="size-3.5" aria-hidden />
              Excluir
            </Button>
          </div>
        </li>

        {/* Demais itens: Arquivos enviados para o projeto */}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    className="h-8 px-2 text-xs gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmDeleteId(file.id)}
                    title="Excluir documento do projeto"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Excluir
                  </Button>
                )}
              </div>
            </li>
          )
        })}

        {/* Card discreto quando não houver arquivos adicionais enviados */}
        {files.length === 0 && manager && !readOnly && (
          <li className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-card-outline bg-card/40 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              Adicione outros arquivos PDF ou DOCX específicos para o seu projeto.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              className="mt-2 text-xs h-8 gap-1.5"
              onClick={() => uploadInputRef.current?.click()}
            >
              <Plus className="size-3.5" aria-hidden />
              Adicionar arquivo
            </Button>
          </li>
        )}
      </ul>

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
                Excluir arquivo do projeto?
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
                Confirmar exclusão
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
