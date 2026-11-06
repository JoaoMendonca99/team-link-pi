/** Versioned semantic document. HTML is never the source of truth. */
export type RichNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string }[]; content?: RichNode[] }
export type Reference = { id: string; kind: 'book' | 'chapter' | 'article' | 'web' | 'institution' | 'thesis' | 'event'; author: string; call: string; title: string; year: string; publisher?: string; place?: string; container?: string; volume?: string; issue?: string; pages?: string; doi?: string; url?: string; accessed?: string; details?: string }
export type Section = { id: string; title: string; level: 1 | 2 | 3; zone: 'pre' | 'text' | 'post'; numbered: boolean; required: boolean; content: RichNode }
export type Report = {
  schema: 1; kind: 'academic' | 'tap' | 'abstract'; profile: 'abnt' | 'uniso2023' | 'custom';
  meta: { institution: string; course: string; discipline: string; title: string; subtitle: string; authors: string; advisor: string; city: string; year: string; period: string; nature: string; orcid: string; keywords: string };
  style: { font: 'Times New Roman' | 'Arial'; size: number; spacing: number; indent: number; top: number; left: number; right: number; bottom: number; cover: boolean; titlePage: boolean; toc: boolean; wordLimit: number };
  sections: Section[]; references: Reference[];
  rubric: { title: string; items: { id: string; label: string; section: string; checked: boolean; max?: number }[] };
  imports: { category: string; ids: string[]; capturedAt: string; section: string }[];
}
export type ReportRow = { id: string; project_id: string; owner_id: string; owner_name?: string; document_kind?: Report['kind']; format_profile?: Report['profile']; title: string; status: string; revision: number; updated_at: string; body: Report; editors: string[]; review_note: string }
export const kinds = { academic: 'Relatório acadêmico', tap: 'TAP', abstract: 'Resumo para publicação' }
export const profiles = { abnt: 'ABNT — Trabalho acadêmico (regras verificadas)', uniso2023: 'UNISO — Manual institucional 2023', custom: 'Personalizado — Regras da instituição' }
export const statuses = { draft: 'Rascunho', review: 'Em revisão', revised: 'Revisado', final: 'Finalizado' }
export const emptyContent = (): RichNode => ({ type: 'doc', content: [{ type: 'paragraph' }] })
export const paragraph = (text: string): RichNode => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
export function createReport(kind: Report['kind']): Report {
  const titles = kind === 'tap' ? ['Identificação do projeto', 'Contextualização', 'Justificativa', 'Objetivo geral', 'Objetivos específicos', 'Escopo', 'Não escopo', 'Premissas', 'Restrições', 'Entregáveis', 'Responsáveis', 'Cronograma', 'Riscos', 'Critérios de sucesso', 'Recursos necessários', 'Termo de autorização'] : kind === 'abstract' ? ['Resumo'] : ['Resumo', 'Introdução', 'Objetivos', 'Justificativa', 'Referencial teórico', 'Metodologia', 'Desenvolvimento', 'Resultados', 'Considerações finais']
  return { schema: 1, kind, profile: kind === 'academic' ? 'abnt' : 'custom', meta: { institution: '', course: '', discipline: '', title: '', subtitle: '', authors: '', advisor: '', city: '', year: '', period: '', nature: '', orcid: '', keywords: '' }, style: { font: 'Times New Roman', size: 12, spacing: kind === 'abstract' ? 1 : 1.5, indent: 12.5, top: 30, left: 30, right: 20, bottom: 20, cover: kind === 'academic', titlePage: kind === 'academic', toc: kind === 'academic', wordLimit: kind === 'abstract' ? 250 : 500 }, sections: titles.map((title, i) => ({ id: crypto.randomUUID(), title, level: 1, zone: kind === 'academic' && i === 0 ? 'pre' : 'text', numbered: title !== 'Resumo', required: false, content: emptyContent() })), references: [], rubric: { title: '', items: [] }, imports: [] }
}
export const nodeText = (node: RichNode): string => node.text ?? (node.type === 'hardBreak' ? '\n' : (node.content ?? []).map(nodeText).join(node.type === 'doc' || node.type === 'tableRow' ? '\n' : ''))
export function referenceText(r: Reference) {
  const entry = r.kind === 'chapter' || r.kind === 'event' ? `In: ${r.container || '[Obra/evento não informado]'}.` : r.kind === 'article' ? `${r.container || '[Periódico não informado]'}.${r.volume ? ' v. ' + r.volume + '.' : ''}${r.issue ? ' n. ' + r.issue + '.' : ''}` : ''
  return [r.author && r.author + '.', r.title && r.title + '.', entry, r.details, [r.place, r.publisher].filter(Boolean).join(': '), r.year && r.year + '.', r.pages && 'p. ' + r.pages + '.', r.doi && 'DOI: ' + r.doi + '.', r.url && 'Disponível em: ' + r.url + '.', r.accessed && 'Acesso em: ' + r.accessed + '.'].filter(Boolean).join(' ')
}
export function citationText(node: RichNode, references: Reference[]) {
  const r = references.find(r => r.id === node.attrs?.referenceId)
  const call = `(${r?.call || '[Referência ausente]'}, ${r?.year || '[ano]'}${node.attrs?.location ? ', ' + node.attrs.location : ''})`
  const quote = String(node.attrs?.quote ?? '')
  return node.attrs?.mode === 'short' ? `“${quote}” ${call}.` : node.attrs?.mode === 'long' ? `${quote} ${call}.` : `${quote}${quote ? ' ' : ''}${call}.`
}
export function numberedSections(sections: Section[]) {
  const counters = [0, 0, 0]
  return sections.map(s => {
    if (!s.numbered) return { ...s, label: s.title }
    counters[s.level - 1]++; counters.fill(0, s.level)
    return { ...s, label: counters.slice(0, s.level).join('.') + ' ' + s.title }
  })
}
export type Issue = { severity: 'Erro' | 'Aviso' | 'Informação'; text: string; section?: string }
export function validateReport(r: Report): Issue[] {
  const issues: Issue[] = []
  const add = (severity: Issue['severity'], text: string, section?: string) => issues.push({ severity, text, section })
  if (![10, 11, 12, 13, 14].includes(r.style.size) || r.style.spacing < 1 || r.style.spacing > 2 || !Number.isFinite(r.style.spacing) || r.style.indent < 0 || r.style.indent > 30 || [r.style.top,r.style.bottom,r.style.left,r.style.right].some(n=>!Number.isFinite(n)||n<10||n>50)) add('Erro','Configuração de página inválida. Use fonte 10–14 pt, entrelinhas 1–2, margens 10–50 mm e recuo 0–30 mm.')
  for (const key of ['title', 'authors'] as const) if (!r.meta[key].trim()) add('Erro', key === 'title' ? 'Informe o título.' : 'Informe os autores.')
  if (r.style.cover || r.style.titlePage) for (const key of ['institution', 'city', 'year'] as const) if (!r.meta[key].trim()) add('Erro', `Identificação incompleta: ${key}.`)
  if (r.style.titlePage && !r.meta.nature.trim()) add('Erro', 'Informe a natureza e o objetivo do trabalho para a folha de rosto.')
  let previous = 0
  for (const s of r.sections) {
    if (!s.title.trim()) add('Erro', 'Seção sem título.', s.id)
    if (s.numbered && s.level > previous + 1) add('Erro', 'Hierarquia de seção com nível intermediário ausente.', s.id)
    if(s.zone!=='text'&&s.numbered) add('Erro','Elementos pré e pós-textuais devem ficar sem indicativo numérico.',s.id)
    if (s.numbered) previous = s.level
    if (s.required && !nodeText(s.content).trim()) add('Erro', 'Seção obrigatória sem conteúdo.', s.id)
    const walk = (n: RichNode, academic = false) => {
      if(n.type==='heading') add('Aviso','Título interno sem numeração progressiva. Para incluí-lo na numeração e no sumário, use Adicionar seção e escolha o nível correspondente.',s.id)
      if (n.type === 'citation') {
        if (!r.references.some(ref => ref.id === n.attrs?.referenceId)) add('Erro', 'Citação sem referência correspondente.', s.id)
        if (n.attrs?.mode !== 'indirect' && !n.attrs?.location) add('Erro', 'Citação direta sem página/localização.', s.id)
      }
      if (n.type === 'figure' || n.type === 'academicTable') {
        if (!n.attrs?.title || !n.attrs?.source) add('Erro', 'Figura/tabela/quadro precisa de título e fonte.', s.id)
      }
      if (!academic && (n.type === 'image' || n.type === 'table')) add('Aviso', 'Use figura ou tabela acadêmica com título e fonte.', s.id)
      n.content?.forEach(child=>walk(child,academic||n.type==='academicTable'))
    }; walk(s.content)
    if (/^resumo$/i.test(s.title)) {
      const words = nodeText(s.content).trim().split(/\s+/).filter(Boolean).length
      if (words > r.style.wordLimit) add('Aviso', `Resumo com ${words} palavras; limite configurado: ${r.style.wordLimit}.`, s.id)
    }
  }
  const seen = new Set<string>()
  for (const ref of r.references) {
    const required: (keyof Reference)[] = ['author', 'call', 'title', 'year']
    if (['book', 'chapter'].includes(ref.kind)) required.push('publisher', 'place')
    if (['article', 'chapter', 'event'].includes(ref.kind)) required.push('container')
    if (ref.kind === 'thesis') required.push('details')
    if (ref.kind === 'web' || ref.url) required.push('url', 'accessed')
    if (required.some(k => !ref[k])) add('Erro', `Referência incompleta: ${ref.title || 'sem título'}.`)
    const key = (ref.doi || ref.author + ref.title + ref.year).toLocaleLowerCase().replace(/\s+/g, '')
    if (seen.has(key)) add('Aviso', `Referência repetida: ${ref.title}.`); seen.add(key)
    if (r.references.some(other => other.id !== ref.id && other.call === ref.call && other.year === ref.year)) add('Aviso', `Desambigue a chamada autor-data de ${ref.call} (${ref.year}), por exemplo com sufixos a/b.`)
  }
  if (r.profile === 'uniso2023') add('Aviso', 'Manual UNISO 2023 usa NBR 14724:2011 e NBR 6023:2018/2020. Perfil institucional histórico; revisão do professor necessária para 2026.')
  add('Informação', 'Verificações estruturais não certificam conformidade ABNT. Revise conteúdo, referências e PDF final. Sistema autor-data; somente páginas anversas. Normas 15287:2025 e 10719:2015 não implementadas como perfis específicos.')
  return issues
}
