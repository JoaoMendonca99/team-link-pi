'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Github, Headphones, Settings2, SquareKanban, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

const catalog = [
  { id: 'reports', name: 'Gerador de Relatórios', description: 'Crie relatórios acadêmicos com formatação ABNT, utilize informações do projeto e exporte documentos em PDF ou Word.', icon: FileText },
  { id: 'github', name: 'GitHub', description: 'Repositórios, commits e atividades do projeto.', icon: Github },
  { id: 'support', name: 'Suporte (SAC)', description: 'Atendimento e gerenciamento de chamados.', icon: Headphones },
  { id: 'activities', name: 'Controle de Atividades', description: 'Organize tarefas, distribua responsabilidades, acompanhe metas e visualize o progresso da equipe.', icon: SquareKanban },
] as const
export type WorkspaceModule = typeof catalog[number]['id']

export function ProjectTools({ active, manager, loading, error, open, toggle }: {
  active: WorkspaceModule[]; manager: boolean; loading: boolean; error: string | null
  open: (module: WorkspaceModule) => void; toggle: (module: WorkspaceModule, active: boolean) => Promise<void>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [removing, setRemoving] = useState<WorkspaceModule | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const target = catalog.find((tool) => tool.id === removing)
  useEffect(() => { if (!manager) dialog.current?.close() }, [manager])

  function showCatalog() {
    setRemoving(null)
    setFailure('')
    dialog.current?.showModal()
  }

  async function change(module: WorkspaceModule, enabled: boolean) {
    setBusy(true)
    setFailure('')
    try {
      await toggle(module, enabled)
      setRemoving(null)
      if (enabled) {
        dialog.current?.close()
        open(module)
      }
    } catch {
      setFailure('Não foi possível atualizar a funcionalidade.')
    } finally { setBusy(false) }
  }

  return <section aria-label="Ferramentas do projeto" className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">Funcionalidades opcionais</h2>
      {manager && <Button type="button" size="sm" variant="outline" onClick={showCatalog}><Settings2 aria-hidden /> Gerenciar funcionalidades</Button>}
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {loading ? <p role="status" className="text-sm text-muted-foreground">Carregando ferramentas…</p> :
      !error && !active.some(module=>module!=='activities') ? <p className="text-sm text-muted-foreground">Nenhuma funcionalidade opcional adicionada.</p> : null}
    <ul className="grid gap-3 sm:grid-cols-2">
      {catalog.filter((tool) => tool.id!=='activities' && active.includes(tool.id)).map((tool) => <li key={tool.id} className="space-y-3 rounded-2xl border border-card-outline bg-card p-4">
        <div className="flex items-start gap-3"><tool.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <div><h3 className="font-semibold">{tool.name}</h3><p className="text-sm text-muted-foreground">{tool.description}</p></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" aria-label={'Abrir ' + tool.name} onClick={() => open(tool.id)}>Abrir</Button>
          {manager && <Button type="button" size="sm" variant="outline" aria-label={'Configurar ' + tool.name} onClick={() => open(tool.id)}>Configurar</Button>}
        </div>
      </li>)}
    </ul>
    <dialog ref={dialog} aria-label="Gerenciar funcionalidades" onCancel={(event) => { if (busy) event.preventDefault() }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl space-y-4 overflow-y-auto overscroll-contain rounded-3xl border border-card-outline bg-card p-5 text-card-foreground backdrop:bg-black/70">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{target ? 'Remover ' + target.name : 'Gerenciar funcionalidades'}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label="Fechar" disabled={busy} onClick={() => dialog.current?.close()}><X aria-hidden /></Button>
      </div>
      {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
      {target ? <>
        <p className="text-sm text-muted-foreground">A ferramenta será desativada apenas neste projeto. A integração externa, as configurações e o histórico serão preservados.</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setRemoving(null); setFailure('') }}>Cancelar</Button>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void change(target.id, false)}>Confirmar remoção</Button>
        </div>
      </> : <ul className="space-y-3">{catalog.map((tool) => <li key={tool.id} className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex items-start gap-3"><tool.icon className="size-5 shrink-0 text-primary" aria-hidden />
          <div><h3 className="font-semibold">{tool.name}</h3><p className="text-sm text-muted-foreground">{tool.description}</p></div>
        </div>
        {tool.id==='activities' ? <p className="text-sm font-medium text-primary">Funcionalidade padrão · obrigatória</p> : active.includes(tool.id) ? <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { dialog.current?.close(); open(tool.id) }}>Configurar {tool.name}</Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { setFailure(''); setRemoving(tool.id) }}>Remover {tool.name}</Button>
        </div> : <Button type="button" size="sm" disabled={busy} onClick={() => void change(tool.id, true)}>Adicionar {tool.name}</Button>}
      </li>)}</ul>}
    </dialog>
  </section>
}
