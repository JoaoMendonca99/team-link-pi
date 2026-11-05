'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { activityRpc, filterTasks, type ActivityFilters, type Workspace } from '@/lib/activities'
import { Dialog } from './workspace-editors'

export function ActivityExport({ data, filters, close }: { data: Workspace; filters: ActivityFilters; close: () => void }) {
  const [mode, setMode] = useState('full')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const period = data.periods.find(p => p.id === data.selectedPeriod)
  async function download() {
    setBusy(true); setError('')
    try {
      // Revalidate membership instead of exporting a previously cached private snapshot.
      const fresh = await activityRpc<Workspace>('get_activity_workspace', { p_slug: data.project.slug })
      if (fresh.project.id !== data.project.id || !period || !fresh.periods.some(p => p.id === period.id)) throw new Error('Período indisponível.')
      const scoped = fresh.tasks.filter(t => t.period_id === period.id)
      const tasks = mode === 'full' ? scoped : filterTasks(scoped, fresh.stages, filters)
      const response = await fetch('/fonts/NotoSans-Regular.ttf')
      if (!response.ok) throw new Error('Fonte indisponível.')
      const bytes = new Uint8Array(await response.arrayBuffer())
      let font = ''
      for (let i = 0; i < bytes.length; i += 8192) font += String.fromCharCode(...bytes.subarray(i, i + 8192))
      const { createActivityPdf } = await import('@/lib/activity-pdf')
      const label = mode === 'full' ? 'Relatório completo do período · Filtros do Kanban desconsiderados.' : 'Relatório das atividades filtradas · Resultados correspondentes aos filtros aplicados no Kanban.'
      const { doc, filename } = createActivityPdf({ ...fresh, tasks }, period.id, btoa(font), label)
      await doc.save(filename, { returnPromise: true })
      close()
    } catch { setError('Não foi possível gerar o PDF. Confira sua conexão e seu acesso ao projeto e tente novamente.') }
    finally { setBusy(false) }
  }
  return <Dialog title="Baixar PDF do Kanban" busy={busy} close={close}>
    <p className="text-sm">Período: {period?.name}. O relatório será gerado em A4 horizontal, sem comentários ou histórico.</p>
    <fieldset disabled={busy} className="space-y-3"><legend className="mb-2 font-semibold">Escopo da exportação</legend>
      <label className="flex items-start gap-2 rounded-xl border p-3 text-sm"><input type="radio" name="export-scope" value="full" checked={mode==='full'} onChange={()=>setMode('full')} />Relatório completo do período — ignora os filtros atuais.</label>
      <label className="flex items-start gap-2 rounded-xl border p-3 text-sm"><input type="radio" name="export-scope" value="filtered" checked={mode==='filtered'} onChange={()=>setMode('filtered')} />Relatório das atividades filtradas — respeita todos os filtros atuais do Kanban.</label>
    </fieldset>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button disabled={busy||!period} onClick={()=>void download()}>{busy?'Gerando PDF…':'Gerar e baixar PDF'}</Button>
  </Dialog>
}
