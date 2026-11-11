'use client'

import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  formatFileSize,
  readDocument,
  saveBlob,
  type ProjectFile,
  type ReferenceDocument,
} from '@/lib/project-documents'

export interface AvailableDocumentsProps {
  abntDoc?: ReferenceDocument
  isAbntSelected: boolean
  onToggleAbnt: (selected: boolean) => void

  projectFiles: ProjectFile[]
  selectedProjectFileIds: string[]
  onToggleProjectFile: (fileId: string, selected: boolean) => void

  otherDocuments: ReferenceDocument[]
  selectedReferenceIds: string[]
  onToggleReference: (docId: string, selected: boolean) => void

  disabled: boolean
}

export function AvailableDocumentsSection({
  abntDoc,
  isAbntSelected,
  onToggleAbnt,
  projectFiles,
  selectedProjectFileIds,
  onToggleProjectFile,
  otherDocuments,
  selectedReferenceIds,
  onToggleReference,
  disabled,
}: AvailableDocumentsProps) {
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const term = search.trim().toLocaleLowerCase('pt-BR')

  const showAbnt = useMemo(() => {
    if (!term) return true
    const abntName = 'guia abnt — team link.pdf'
    const abntDesc = 'documento padrao do sistema'
    return abntName.includes(term) || abntDesc.includes(term)
  }, [term])

  const filteredProjectFiles = useMemo(() => {
    if (!term) return projectFiles
    return projectFiles.filter((f) =>
      f.name.toLocaleLowerCase('pt-BR').includes(term) ||
      f.filename.toLocaleLowerCase('pt-BR').includes(term)
    )
  }, [projectFiles, term])

  const filteredOtherDocs = useMemo(() => {
    if (!term) return otherDocuments
    return otherDocuments.filter((d) =>
      d.name.toLocaleLowerCase('pt-BR').includes(term) ||
      (d.description && d.description.toLocaleLowerCase('pt-BR').includes(term)) ||
      (d.institution && d.institution.toLocaleLowerCase('pt-BR').includes(term))
    )
  }, [otherDocuments, term])

  const totalSelected =
    (isAbntSelected ? 1 : 0) +
    selectedProjectFileIds.length +
    otherDocuments.filter((d) => selectedReferenceIds.includes(d.id)).length

  async function handleDownloadAbnt() {
    setError('')
    try {
      const exports = await import('@/lib/documentation-export')
      const font = await exports.loadDocumentationFont()
      const pdf = exports.createAbntGuide(font)
      saveBlob(pdf.output('blob'), 'Guia_ABNT_TeamLink.pdf')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível baixar o Guia ABNT.')
    }
  }

  async function handleDownloadProjectFile(file: ProjectFile) {
    setError('')
    try {
      const blob = await readDocument('project', file.id)
      saveBlob(blob, file.filename || file.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível baixar o arquivo do projeto.')
    }
  }

  async function handleDownloadReference(doc: ReferenceDocument) {
    setError('')
    try {
      const blob = await readDocument('reference', doc.id)
      saveBlob(blob, doc.filename || doc.name)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível baixar o documento de referência.')
    }
  }

  const hasAnyItems = showAbnt || filteredProjectFiles.length > 0 || filteredOtherDocs.length > 0

  return (
    <section aria-label="Arquivos disponíveis" className="space-y-3 rounded-xl border border-card-outline p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">Arquivos disponíveis</h3>
          <p className="text-xs text-muted-foreground">
            Selecione os documentos que comporão o pacote para a IA.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground font-medium">
          {totalSelected} selecionado{totalSelected === 1 ? '' : 's'}
        </span>
      </div>

      <label className="block text-xs font-medium text-muted-foreground">
        Buscar arquivo
        <input
          type="search"
          className="report-input mt-1 text-sm font-normal text-foreground"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filtrar por nome ou termo…"
          disabled={disabled}
        />
      </label>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {!hasAnyItems ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nenhum arquivo encontrado com o termo informado.
          </p>
        ) : (
          <>
            {/* 1. Guia ABNT — Documento padrão do sistema */}
            {showAbnt && (
              <article
                key={abntDoc?.id || 'abnt-guide'}
                className="flex items-center justify-between gap-3 rounded-xl border border-card-outline bg-card/60 p-2.5 transition-colors hover:bg-card"
              >
                <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAbntSelected}
                    disabled={disabled}
                    className="size-4 rounded border-border accent-primary shrink-0"
                    onChange={(e) => onToggleAbnt(e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium truncate">Guia ABNT — Team Link.pdf</span>
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary shrink-0">
                        Padrão
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Documento padrão do sistema · Síntese orientadora
                    </p>
                  </div>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  className="h-7 px-2 text-xs shrink-0 gap-1"
                  onClick={() => void handleDownloadAbnt()}
                  title="Baixar Guia ABNT"
                >
                  <Download className="size-3" aria-hidden />
                  Baixar
                </Button>
              </article>
            )}

            {/* 2. Documentos permanentes salvos no projeto */}
            {filteredProjectFiles.map((file) => {
              const checked = selectedProjectFileIds.includes(file.id)
              const isDocx = file.mime.includes('word') || file.filename.endsWith('.docx')
              return (
                <article
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-card-outline bg-card/60 p-2.5 transition-colors hover:bg-card"
                >
                  <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      className="size-4 rounded border-border accent-primary shrink-0"
                      onChange={(e) => onToggleProjectFile(file.id, e.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium truncate" title={file.name}>
                          {file.name}
                        </span>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                          {isDocx ? 'DOCX' : 'PDF'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Arquivo do projeto · {formatFileSize(file.size)}
                      </p>
                    </div>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    className="h-7 px-2 text-xs shrink-0 gap-1"
                    onClick={() => void handleDownloadProjectFile(file)}
                    title="Baixar arquivo do projeto"
                  >
                    <Download className="size-3" aria-hidden />
                    Baixar
                  </Button>
                </article>
              )
            })}

            {/* 3. Outros documentos publicados da biblioteca */}
            {filteredOtherDocs.map((doc) => {
              const checked = selectedReferenceIds.includes(doc.id)
              return (
                <article
                  key={doc.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-card-outline bg-card/60 p-2.5 transition-colors hover:bg-card"
                >
                  <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled || doc.status === 'rejected'}
                      className="size-4 rounded border-border accent-primary shrink-0"
                      onChange={(e) => onToggleReference(doc.id, e.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium truncate" title={doc.name}>
                          {doc.name}
                        </span>
                        {doc.document_type && (
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0">
                            {doc.document_type}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {doc.description || (doc.institution ? `Instituição: ${doc.institution}` : 'Documento de referência')}
                        {doc.size ? ` · ${Math.ceil(doc.size / 1024)} KB` : ''}
                      </p>
                    </div>
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    className="h-7 px-2 text-xs shrink-0 gap-1"
                    onClick={() => void handleDownloadReference(doc)}
                    title="Baixar documento de referência"
                  >
                    <Download className="size-3" aria-hidden />
                    Baixar
                  </Button>
                </article>
              )
            })}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}

// Exportação de compatibilidade
export { AvailableDocumentsSection as DocumentationLibrary }
