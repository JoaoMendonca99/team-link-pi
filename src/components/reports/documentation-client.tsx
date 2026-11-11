'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { AvailableDocumentsSection } from './documentation-library'
import { LegacyDocuments } from './legacy-documents'
import { ProjectFilesSection } from './project-files-section'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { buildAiPrompt, kindLabels, missingAcademic, type DocumentationData, type DocumentKind } from '@/lib/documentation'
import {
  loadProjectFiles,
  saveBlob,
  setProjectFileSelected,
  type ProjectFile,
  type ReferenceDocument,
} from '@/lib/project-documents'
import type { ReportRow } from '@/lib/reports/model'

export async function documentationRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await getSupabaseClient().rpc(name, args)
  if (result.error) {
    console.error('documentation.rpc', { operation: name, code: result.error.code })
    throw Error(result.error.code === 'P0001' ? result.error.message : 'Não foi possível carregar a documentação.')
  }
  return result.data as T
}

export function DocumentationClient({ slug }: { slug: string }) {
  const { user, loading } = useSupabaseSession()
  return user ? (
    <Preparation key={user.id + slug} userId={user.id} slug={slug} />
  ) : (
    <Container className="py-8">
      <p>{loading ? 'Carregando…' : 'Entre na sua conta para acessar a documentação.'}</p>
    </Container>
  )
}

function Preparation({ userId, slug }: { userId: string; slug: string }) {
  const [data, setData] = useState<DocumentationData>()
  const [documents, setDocuments] = useState<ReferenceDocument[]>([])
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([])
  const [legacy, setLegacy] = useState<Omit<ReportRow, 'body'>[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [selectedProjectFileIds, setSelectedProjectFileIds] = useState<string[]>([])
  const [kind, setKind] = useState<DocumentKind>('academic')
  const [period, setPeriod] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [opened, setOpened] = useState(false)

  const dialog = useRef<HTMLDialogElement>(null)
  const initialized = useRef(false)
  const sequence = useRef(0)
  const acting = useRef(false)

  const reloadProjectFiles = useCallback(async (projectId: string) => {
    try {
      const files = await loadProjectFiles(projectId)
      setProjectFiles(files)
      setSelectedProjectFileIds(files.filter((f) => f.selected_for_package).map((f) => f.id))
    } catch (e) {
      console.warn('Falha ao carregar arquivos do projeto:', e)
    }
  }, [])

  const library = useCallback(async () => {
    const result = await getSupabaseClient()
      .from('reference_documents')
      .select('*')
      .order('builtin', { ascending: false })
      .order('name')
    if (result.error) throw Error('Não foi possível carregar a biblioteca.')
    const docs = result.data as ReferenceDocument[]
    const first = !initialized.current
    initialized.current = true
    setDocuments(docs)
    setSelected((ids) => {
      if (first) {
        const builtinDoc = docs.find((d) => d.builtin)
        return builtinDoc ? [builtinDoc.id] : ['builtin-abnt-guide']
      }
      return ids.filter(
        (id) => id === 'builtin-abnt-guide' || docs.some((d) => d.id === id && d.status !== 'rejected')
      )
    })
  }, [])

  useEffect(() => {
    let alive = true
    void Promise.all([
      documentationRpc<DocumentationData>('get_documentation_data', { p_slug: slug, p_period: null }),
      documentationRpc<{ documents: Omit<ReportRow, 'body'>[] }>('get_report_workspace', { p_slug: slug }),
      library(),
    ])
      .then(([next, space]) => {
        if (alive) {
          setData(next)
          setLegacy(space.documents)
          void reloadProjectFiles(next.project.id)
        }
      })
      .catch((e) => {
        if (alive) setError((e as Error).message)
      })
    return () => {
      alive = false
    }
  }, [slug, library, reloadProjectFiles])

  useEffect(() => {
    if (opened) dialog.current?.showModal()
    else dialog.current?.close()
  }, [opened])

  async function refresh(nextPeriod = period) {
    const request = ++sequence.current
    const next = await documentationRpc<DocumentationData>('get_documentation_data', {
      p_slug: slug,
      p_period: nextPeriod || null,
    })
    if (request === sequence.current) setData(next)
    return next
  }

  async function act(run: () => Promise<void>) {
    if (acting.current) return
    acting.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await run()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      acting.current = false
      setBusy(false)
    }
  }

  const abntDoc: ReferenceDocument = documents.find((d) => d.builtin) || {
    id: 'builtin-abnt-guide',
    name: 'Guia ABNT — Team Link.pdf',
    description: 'Documento padrão do sistema',
    document_type: 'Guia ABNT',
    institution: '',
    version: '2026.1',
    status: 'published',
    builtin: true,
    filename: 'Guia_ABNT_TeamLink.pdf',
    size: null,
    created_at: new Date().toISOString(),
    uploader_id: null,
    review_note: '',
  }

  const isAbntSelected = selected.includes(abntDoc.id)
  const otherReferences = documents.filter((d) => !d.builtin && d.status === 'published')
  const chosenOtherReferences = otherReferences.filter((d) => selected.includes(d.id))
  const chosenReferences = (isAbntSelected ? [abntDoc] : []).concat(chosenOtherReferences)
  const chosenProjectFiles = projectFiles.filter((f) => selectedProjectFileIds.includes(f.id))

  async function exportPackage(zip: boolean) {
    await act(async () => {
      const next = await refresh()
      const exports = await import('@/lib/documentation-export')
      const font = await exports.loadDocumentationFont()
      const blob = zip
        ? await exports.createDocumentationZip(next, kind, chosenReferences, font, chosenProjectFiles)
        : exports.createDataPdf(next, kind, font).output('blob')
      saveBlob(blob, zip ? 'TeamLink_Documentacao_IA.zip' : '01_Dados_do_Projeto.pdf')
      setNotice(zip ? 'Pacote ZIP gerado no seu dispositivo.' : 'PDF de dados gerado no seu dispositivo.')
    })
  }

  const currentMember = data?.members.find((m) => m.id === userId)
  const isManager = currentMember ? ['owner', 'manager', 'admin'].includes(currentMember.role) : false
  const isReadOnly = data?.project.status === 'completed' || data?.project.status === 'archived'

  return (
    <Container className="space-y-6 py-6">
      {/* Cabeçalho padronizado e compacto */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/projetos/${encodeURIComponent(slug)}/painel`}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Voltar ao painel do projeto"
            aria-label="Voltar ao painel do projeto"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">
              Documentação com IA
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground truncate" title={data?.project.title}>
              {data?.project.title || 'Carregando…'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0">
          <Button
            type="button"
            disabled={!data}
            onClick={() => setOpened(true)}
            className="w-full sm:w-auto"
          >
            Preparar arquivos para IA
          </Button>
        </div>
      </header>

      {/* Apresentação inicial compacta */}
      <section className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Prepare um pacote com os dados do projeto e os documentos selecionados para utilizar na IA de sua preferência.
        </p>
        {data && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-muted-foreground">
            <span className="rounded-md border bg-muted/30 px-2.5 py-1">
              <strong className="text-foreground">{data.tasks.length}</strong> atividades no período
            </span>
            <span className="rounded-md border bg-muted/30 px-2.5 py-1">
              <strong className="text-foreground">{data.members.length}</strong> integrantes
            </span>
            <span className="rounded-md border bg-muted/30 px-2.5 py-1">
              <strong className="text-foreground">{data.goals.length}</strong> metas registradas
            </span>
          </div>
        )}
      </section>

      {/* Seção principal: Arquivos do projeto (com Guia ABNT integrado como primeiro item) */}
      {data && (
        <ProjectFilesSection
          projectId={data.project.id}
          files={projectFiles}
          manager={isManager}
          readOnly={isReadOnly}
          onChanged={async () => {
            await reloadProjectFiles(data.project.id)
          }}
        />
      )}

      {/* Histórico de relatórios anteriores */}
      {legacy.length > 0 && <LegacyDocuments documents={legacy} />}

      {/* Modal / Diálogo unificado: Preparar pacote para IA */}
      <dialog
        ref={dialog}
        className="backdrop:bg-black/60 m-auto max-w-2xl rounded-2xl border bg-card p-6 text-card-foreground shadow-2xl"
        onCancel={(e) => {
          e.preventDefault()
          setOpened(false)
        }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <h2 className="text-base font-semibold">Preparar pacote para IA</h2>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpened(false)}
              aria-label="Fechar diálogo"
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>

          {/* 1. Documento solicitado */}
          <label className="block text-sm">
            Tipo de documento desejado
            <select
              className="report-input mt-1"
              disabled={busy}
              value={kind}
              onChange={(e) => setKind(e.target.value as DocumentKind)}
            >
              {Object.entries(kindLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {/* 2. Período dos dados */}
          <label className="block text-sm">
            Período dos dados
            <select
              className="report-input mt-1"
              value={period}
              disabled={busy}
              onChange={(e) => {
                const value = e.target.value
                setPeriod(value)
                void act(async () => {
                  await refresh(value)
                })
              }}
            >
              <option value="">Período ativo</option>
              {data?.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.is_active ? ' · Ativo' : ''}
                </option>
              ))}
            </select>
          </label>

          {/* 3. Informações a confirmar */}
          {data && (
            <section className="rounded-xl border p-3 text-sm">
              <h3 className="font-medium">Informações a confirmar</h3>
              <p className="mt-1 text-muted-foreground">
                {missingAcademic(data).length
                  ? 'Ausentes: ' + missingAcademic(data).join(', ') + '.'
                  : 'Dados acadêmicos básicos registrados.'}{' '}
                A IA deverá perguntar sobre objetivos, métodos, resultados e bibliografia que não estejam documentados.
              </p>
            </section>
          )}

          {/* 4. Arquivos disponíveis — Seção unificada de seleção */}
          <AvailableDocumentsSection
            abntDoc={abntDoc}
            isAbntSelected={isAbntSelected}
            onToggleAbnt={(checked) => {
              setSelected((ids) =>
                checked
                  ? ids.includes(abntDoc.id)
                    ? ids
                    : [...ids, abntDoc.id]
                  : ids.filter((id) => id !== abntDoc.id)
              )
            }}
            projectFiles={projectFiles}
            selectedProjectFileIds={selectedProjectFileIds}
            onToggleProjectFile={async (fileId, checked) => {
              setSelectedProjectFileIds((ids) =>
                checked ? [...ids, fileId] : ids.filter((id) => id !== fileId)
              )
              try {
                await setProjectFileSelected(fileId, checked)
              } catch {
                // persistência silenciosa
              }
            }}
            otherDocuments={otherReferences}
            selectedReferenceIds={selected}
            onToggleReference={(docId, checked) => {
              setSelected((ids) =>
                checked ? (ids.includes(docId) ? ids : [...ids, docId]) : ids.filter((id) => id !== docId)
              )}
            }
            disabled={busy}
          />

          {/* 5. Resumo do pacote — Estrutura dos arquivos que entrarão no ZIP */}
          <section className="rounded-xl border p-3 text-sm">
            <h3 className="font-medium">Arquivos do pacote</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 break-words">
              <li>01_Dados_do_Projeto.pdf</li>
              {isAbntSelected && <li>02_Guia_ABNT.pdf</li>}
              {chosenOtherReferences.map((d) => (
                <li key={d.id}>03_Documentos_de_Referencia/{d.filename || d.name}</li>
              ))}
              <li>04_Prompt_IA.txt</li>
              {chosenProjectFiles.map((f) => (
                <li key={f.id}>05_Arquivos_do_Projeto/{f.filename || f.name}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              O guia é uma síntese própria baseada nas normas e nas{' '}
              <a className="underline" href="https://biblioteca.ufes.br/normalizacao" target="_blank" rel="noreferrer">
                orientações atuais da UFES
              </a>
              . Nenhuma norma protegida é redistribuída.
            </p>
          </section>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-primary">
              {notice}
            </p>
          )}

          {/* 6. Botões de exportação */}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !data} onClick={() => void exportPackage(true)}>
              {busy ? 'Preparando…' : 'Baixar pacote ZIP'}
            </Button>
            <Button variant="outline" disabled={busy || !data} onClick={() => void exportPackage(false)}>
              Baixar só o PDF de dados
            </Button>
            <Button
              variant="outline"
              disabled={busy || !data}
              onClick={() =>
                void act(async () => {
                  const next = await refresh()
                  await navigator.clipboard.writeText(buildAiPrompt(next, kind, chosenReferences))
                  setNotice('Prompt copiado.')
                })
              }
            >
              Copiar prompt
            </Button>
          </div>
        </div>
      </dialog>
    </Container>
  )
}
