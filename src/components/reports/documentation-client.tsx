'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { Container } from '@/components/layout/container'
import { Button } from '@/components/ui/button'
import { DocumentationLibrary } from './documentation-library'
import { LegacyDocuments } from './legacy-documents'
import { ProjectFilesSection } from './project-files-section'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { buildAiPrompt, kindLabels, missingAcademic, type DocumentationData, type DocumentKind } from '@/lib/documentation'
import {
  formatFileSize,
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
      // Mantém a seleção memorizada a partir do banco
      setSelectedProjectFileIds(files.filter((f) => f.selected_for_package).map((f) => f.id))
    } catch {
      // Falha não impeditiva no carregamento secundário
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
    setSelected((ids) =>
      first
        ? docs.filter((d) => d.builtin).map((d) => d.id)
        : ids.filter((id) => docs.some((d) => d.id === id && d.status !== 'rejected'))
    )
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

  const chosen = documents.filter((d) => selected.includes(d.id) && d.status !== 'rejected')
  const chosenProjectFiles = projectFiles.filter((f) => selectedProjectFileIds.includes(f.id))

  async function exportPackage(zip: boolean) {
    await act(async () => {
      const next = await refresh()
      const exports = await import('@/lib/documentation-export')
      const font = await exports.loadDocumentationFont()
      const blob = zip
        ? await exports.createDocumentationZip(next, kind, chosen, font, chosenProjectFiles)
        : exports.createDataPdf(next, kind, font).output('blob')
      saveBlob(blob, zip ? 'TeamLink_Documentacao_IA.zip' : '01_Dados_do_Projeto.pdf')
      setNotice(zip ? 'Pacote ZIP gerado no seu dispositivo.' : 'PDF de dados gerado no seu dispositivo.')
    })
  }

  const currentMember = data?.members.find((m) => m.id === userId)
  const isManager = Boolean(
    currentMember && ['owner', 'manager', 'admin'].includes(currentMember.role)
  )
  const isReadOnly = Boolean(data && ['completed', 'archived'].includes(data.project.status))

  return (
    <Container className="space-y-6 py-6">
      {/* 1. Novo cabeçalho unificado e responsivo */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button asChild size="icon" variant="outline">
            <Link
              href={'/projetos/' + encodeURIComponent(slug) + '/painel'}
              aria-label="Voltar ao painel do projeto"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold">Documentação com IA</h1>
            <p className="break-words text-sm text-muted-foreground">{data?.project.title}</p>
          </div>
        </div>
        <div className="flex w-full justify-start sm:w-auto sm:justify-end">
          <Button disabled={!data || busy} onClick={() => setOpened(true)}>
            Preparar arquivos para IA
          </Button>
        </div>
      </header>

      {/* 2. Resumo compacto */}
      <div className="space-y-1.5">
        <p className="text-sm text-muted-foreground">
          Prepare um pacote com os dados do projeto e os documentos selecionados para utilizar na IA de sua preferência.
        </p>
        {data && (
          <p className="text-xs text-muted-foreground">
            {data.tasks.length} atividades do período · {data.members.length} integrantes · {data.goals.length} metas
            {isReadOnly && (
              <span className="ml-2 font-medium text-primary">· Projeto finalizado (somente consulta)</span>
            )}
          </p>
        )}
      </div>

      {error && !opened && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!data && !error && <p role="status">Carregando dados autorizados…</p>}

      {/* 3. Nova seção: Arquivos do projeto */}
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

      {/* 4. Relatórios anteriores (fluxo legado) */}
      {data && <LegacyDocuments documents={legacy} />}

      {/* Diálogo Preparar arquivos para IA */}
      <dialog
        ref={dialog}
        aria-label="Preparar pacote para IA"
        onCancel={(e) => {
          e.preventDefault()
          if (!busy) setOpened(false)
        }}
        className="report-dialog max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-3xl overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Preparar pacote para IA</h2>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={busy}
            aria-label="Fechar preparação"
            onClick={() => setOpened(false)}
          >
            <X className="size-4" />
          </Button>
        </div>
        <p className="my-3 text-sm text-muted-foreground">
          Escolha o documento, confira os dados e selecione referências da biblioteca compartilhada e arquivos permanentes do projeto. Depois, baixe o pacote ZIP completo, somente o PDF de dados ou copie o prompt. Nenhum texto manual é obrigatório.
        </p>
        <div className="space-y-4">
          <label className="block text-sm">
            Documento solicitado
            <select
              className="report-input"
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
          <label className="block text-sm">
            Período dos dados
            <select
              className="report-input"
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

          {/* Nova seção dentro do modal: Arquivos salvos no projeto */}
          <section className="rounded-xl border p-3 text-sm space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Arquivos salvos no projeto</h3>
              <span className="text-xs text-muted-foreground">
                {chosenProjectFiles.length} selecionado{chosenProjectFiles.length === 1 ? '' : 's'}
              </span>
            </div>
            {projectFiles.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum arquivo permanente adicionado ao projeto ainda. Use a seção &ldquo;Arquivos do projeto&rdquo; na página principal para adicionar.
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {projectFiles.map((file) => {
                  const checked = selectedProjectFileIds.includes(file.id)
                  return (
                    <li key={file.id}>
                      <label className="flex items-center gap-2 cursor-pointer hover:text-primary">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          className="rounded border-border accent-primary"
                          onChange={async (e) => {
                            const nextChecked = e.target.checked
                            setSelectedProjectFileIds((ids) =>
                              nextChecked ? [...ids, file.id] : ids.filter((id) => id !== file.id)
                            )
                            try {
                              await setProjectFileSelected(file.id, nextChecked)
                            } catch {
                              // persistência silenciosa
                            }
                          }}
                        />
                        <span className="truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({formatFileSize(file.size)})
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* Biblioteca compartilhada preservada */}
          <DocumentationLibrary
            documents={documents}
            selected={selected}
            onSelect={setSelected}
            onUploaded={library}
            disabled={busy}
          />

          {/* Estrutura do pacote com a nova pasta 05_Arquivos_do_Projeto */}
          <section className="rounded-xl border p-3 text-sm">
            <h3 className="font-medium">Arquivos do pacote</h3>
            <ul className="mt-2 list-inside list-disc space-y-1 break-words">
              <li>01_Dados_do_Projeto.pdf</li>
              {chosen.some((d) => d.builtin) && <li>02_Guia_ABNT.pdf</li>}
              {chosen
                .filter((d) => !d.builtin)
                .map((d) => (
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
                  await navigator.clipboard.writeText(buildAiPrompt(next, kind, chosen))
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
