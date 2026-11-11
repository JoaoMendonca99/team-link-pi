'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { readDocument, saveBlob, type ReferenceDocument } from '@/lib/project-documents'

interface DocumentationLibraryProps {
  documents: ReferenceDocument[]
  selected: string[]
  onSelect: (ids: string[]) => void
  disabled: boolean
}

export function DocumentationLibrary({
  documents,
  selected,
  onSelect,
  disabled,
}: DocumentationLibraryProps) {
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  async function download(document: ReferenceDocument) {
    setError('')
    try {
      if (document.builtin) {
        const exports = await import('@/lib/documentation-export')
        saveBlob(
          exports.createAbntGuide(await exports.loadDocumentationFont()).output('blob'),
          'Guia_ABNT_TeamLink.pdf'
        )
      } else {
        saveBlob(await readDocument('reference', document.id), document.filename || document.name)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const filtered = documents.filter((d) =>
    d.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))
  )

  return (
    <section aria-label="Biblioteca compartilhada" className="space-y-4 rounded-xl border border-card-outline p-4">
      <div>
        <h3 className="font-semibold">Biblioteca compartilhada</h3>
        <p className="text-xs text-muted-foreground">
          Documentos publicados estão disponíveis para seleção em todos os projetos.
        </p>
      </div>

      <label className="block text-sm">
        Buscar documento
        <input
          type="search"
          className="report-input mt-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nome do documento"
        />
      </label>

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">
            Nenhum documento encontrado na biblioteca.
          </p>
        ) : (
          filtered.map((document) => (
            <article key={document.id} className="rounded-xl border p-3 text-sm">
              <div className="flex items-start gap-2">
                <input
                  aria-label={'Incluir ' + document.name}
                  type="checkbox"
                  className="mt-1 size-4 rounded border-border accent-primary"
                  disabled={disabled || document.status === 'rejected'}
                  checked={selected.includes(document.id)}
                  onChange={(e) =>
                    onSelect(
                      e.target.checked
                        ? [...selected, document.id]
                        : selected.filter((id) => id !== document.id)
                    )
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">
                    {document.name}
                    {document.builtin ? ' · Padrão do sistema' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {document.document_type} · v{document.version}
                    {document.institution ? ' · ' + document.institution : ''} ·{' '}
                    {document.status === 'published'
                      ? 'Publicado'
                      : document.status === 'pending'
                        ? 'Aguardando revisão'
                        : 'Não publicado'}
                  </p>
                  {document.description && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {document.description}
                    </p>
                  )}
                  {document.review_note && (
                    <p className="text-xs">Revisão: {document.review_note}</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Incluído em {new Date(document.created_at).toLocaleDateString('pt-BR')}
                    {document.size ? ' · ' + Math.ceil(document.size / 1024) + ' KB' : ''}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => void download(document)}
                >
                  Baixar
                </Button>
              </div>
            </article>
          ))
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
