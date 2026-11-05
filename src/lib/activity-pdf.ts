import { jsPDF } from 'jspdf'
import { activityDate, kinds, overdue, priorities, taskKind, type Workspace } from './activities'

// Only text fields explicitly listed here are exported; never comments or audit details.
export function createActivityPdf(data: Workspace, periodId: string, font: string, scope: string, issued = new Date()) {
  const period = data.periods.find(p => p.id === periodId)
  if (!period) throw new Error('Período indisponível.')
  const tasks = data.tasks.filter(t => t.period_id === periodId)
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', compress: true, putOnlyUsedFonts: true })
  doc.addFileToVFS('NotoSans.ttf', font)
  doc.addFont('NotoSans.ttf', 'NotoSans', 'normal')
  doc.setFont('NotoSans')
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight()
  const margin = 15, lineHeight = 5, bottom = height - 17
  let y = 19
  const clean = (text: string) => text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  function newPage() { doc.addPage(); y = 19 }
  function text(value: string, size = 10, color = '#243047') {
    doc.setFontSize(size); doc.setTextColor(color)
    const lines: string[] = doc.splitTextToSize(clean(value), width - margin * 2)
    for (const line of lines) {
      if (y + lineHeight > bottom) newPage()
      doc.text(line, margin, y); y += size > 13 ? 7 : lineHeight
    }
  }
  text('TEAM LINK — RELATÓRIO DE ATIVIDADES', 18, '#194fc4')
  text(data.project.title, 13)
  text('Período: ' + period.name)
  text('Emissão: ' + issued.toLocaleString('pt-BR') + ' · ' + Intl.DateTimeFormat().resolvedOptions().timeZone, 9)
  text(scope, 9)
  y += 3
  const completed = tasks.filter(t => taskKind(t, data.stages) === 'done').length
  const late = tasks.filter(t => overdue(t.due_at, taskKind(t, data.stages) === 'done', issued.getTime())).length
  text(`Total: ${tasks.length} · Concluídas: ${completed} · Pendentes: ${tasks.length - completed} · Atrasadas: ${late} · Conclusão: ${tasks.length ? Math.round(completed / tasks.length * 100) : 0}%`)
  text(Object.entries(kinds).map(([kind, name]) => `${name}: ${tasks.filter(t => taskKind(t, data.stages) === kind).length}`).join(' · '), 9)
  y += 5
  for (const stage of [...data.stages].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))) {
    const items = tasks.filter(t => t.stage_id === stage.id)
    if (y + 28 > bottom) newPage()
    doc.setFillColor('#edf2fc'); doc.rect(margin - 2, y - 5, width - margin * 2 + 4, 9, 'F')
    text(`${stage.name.toLocaleUpperCase('pt-BR')} — ${items.length} ATIVIDADES`, 12, '#194fc4'); y += 4
    if (!items.length) { text('Nenhuma atividade neste escopo.', 9); y += 4 }
    for (const task of items) {
      if (y + 28 > bottom) newPage()
      text(task.title, 12)
      text(`Status: ${stage.name} · Prioridade: ${priorities[task.priority]} · Prazo: ${activityDate(task.due_at)}`, 9)
      text('Responsáveis: ' + (task.assignees.map(id => data.members.find(p => p.id === id)?.name || 'Integrante indisponível').join(', ') || 'Não definidos'), 9)
      if (task.goal_id) text('Meta: ' + (data.goals.find(g => g.id === task.goal_id && g.period_id === periodId)?.title || 'Indisponível'), 9)
      const checklist = data.checklist.filter(c => c.task_id === task.id)
      if (checklist.length) text(`Checklist: ${checklist.filter(c => c.done).length}/${checklist.length} itens concluídos`, 9)
      if (task.description) text(task.description)
      y += 5
    }
    y += 3
  }
  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setFontSize(8); doc.setTextColor('#61718a')
    doc.text(`Team Link · Página ${page} de ${pages}`, width - margin, height - 8, { align: 'right' })
  }
  const safe = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 65)
  const date = `${issued.getFullYear()}-${String(issued.getMonth() + 1).padStart(2, '0')}-${String(issued.getDate()).padStart(2, '0')}`
  return { doc, filename: `TeamLink_${safe(data.project.title)}_Atividades_${safe(period.name)}_${date}.pdf` }
}
