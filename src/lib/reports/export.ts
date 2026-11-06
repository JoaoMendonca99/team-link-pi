import { jsPDF } from 'jspdf'
import { citationText, nodeText, numberedSections, referenceText, validateReport, type Report, type RichNode } from './model'

export type Run = { text: string; bold?: boolean; italic?: boolean }
export type Block = { type: 'text' | 'heading' | 'break' | 'figure' | 'table'; text?: string; runs?: Run[]; level?: number; zone?: string; id?: string; centered?: boolean; small?: boolean; reference?: boolean; quote?: boolean; source?: string; src?: string; rows?: string[][]; frame?: boolean }
function runs(node: RichNode): Run[] {
  if (node.type === 'hardBreak') return [{ text: '\n' }]
  if (node.text !== undefined) return [{ text: node.text, bold: node.marks?.some(m => m.type === 'bold'), italic: node.marks?.some(m => m.type === 'italic') }]
  return (node.content ?? []).flatMap(runs)
}
export function blocks(report: Report): Block[] {
  const result: Block[] = []; const counts = { figure: 0, table: 0, frame: 0 }
  const walk = (n: RichNode, prefix = '') => {
    if (n.type === 'pageBreak' || n.type === 'horizontalRule') { result.push({ type: 'break' }); return }
    if (n.type === 'figure') { result.push({ type: 'figure', text: `Figura ${++counts.figure} - ${n.attrs?.title || ''}`, source: String(n.attrs?.source || ''), src: String(n.attrs?.src || '') }); return }
    if (n.type === 'academicTable') {
      const frame = n.attrs?.kind === 'frame'
      const rows = n.content?.[0]?.content?.map(row => row.content?.map(cell => nodeText(cell)) ?? []) ?? []
      result.push({ type: 'table', text: `${frame ? 'Quadro ' + ++counts.frame : 'Tabela ' + ++counts.table} - ${n.attrs?.title || ''}`, source: String(n.attrs?.source || ''), rows, frame }); return
    }
    if (n.type === 'citation') { result.push({ type: 'text', text: citationText(n, report.references), quote: n.attrs?.mode === 'long', small: n.attrs?.mode === 'long' }); return }
    if (n.type === 'paragraph' || n.type === 'heading') { result.push({ type: n.type === 'heading' ? 'heading' : 'text', level: Number(n.attrs?.level || 1), text: prefix + nodeText(n), runs: [{ text: prefix }, ...runs(n)] }); return }
    if (n.type === 'blockquote') { for (const child of n.content ?? []) result.push({ type: 'text', text: nodeText(child), runs: runs(child), small: true, quote: true }); return }
    if (n.type === 'bulletList' || n.type === 'orderedList') { n.content?.forEach((item, i) => item.content?.forEach((child, j) => walk(child, j === 0 ? (n.type === 'orderedList' ? `${i + 1}. ` : '• ') : ''))); return }
    n.content?.forEach(child => walk(child))
  }
  for (const s of numberedSections(report.sections)) {
    result.push({ type: 'heading', id: s.id, text: s.label, level: s.level, zone: s.zone, centered: !s.numbered })
    walk(s.content)
    if (/^resumo$/i.test(s.title) && report.meta.keywords) result.push({ type: 'text', text: 'Palavras-chave: ' + report.meta.keywords.replace(/[.;\s]+$/, '') + '.' })
  }
  if (report.references.length) {
    result.push({ type: 'heading', id: 'references', text: 'REFERÊNCIAS', level: 1, zone: 'post', centered: true })
    report.references.slice().sort((a,b) => referenceText(a).localeCompare(referenceText(b), 'pt-BR')).forEach(ref => {const value=referenceText(ref),i=value.indexOf(ref.title);result.push({ type: 'text', text:value, reference:true,runs:i>=0?[{text:value.slice(0,i)},{text:ref.title,bold:true},{text:value.slice(i+ref.title.length)}]:[{text:value}] })})
  }
  return result
}

// A4, single-sided layout; all positions in mm. Two passes obtain real TOC pages.
export function renderPdf(report: Report) {
  if(validateReport(report).some(i=>i.severity==='Erro')) throw new Error('Corrija os erros de validação antes de exportar.')
  const content = blocks(report), st = report.style
  const unsupported = /[^\x09\x0a\x0d\x20-\x7e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac\u2122]/u
  if(unsupported.test([Object.values(report.meta).join(' '),...content.map(b=>[b.text,b.source,...(b.rows||[]).flat()].join(' '))].join(' '))) throw new Error('O PDF desta versão não suporta um dos caracteres utilizados. Substitua o símbolo ou exporte Word, que preserva Unicode.')
  const left = st.left, right = 210 - st.right, bottom = 297 - st.bottom, width = right - left
  const offsets = (report.style.cover ? 1 : 0)
  const displayPage = (p: number) => p - offsets
  const title = report.meta.title + (report.meta.subtitle ? ': ' + report.meta.subtitle : '')
  let previousToc: { title: string; page: number; level: number }[] = []
  let finalPdf!: jsPDF
  let finalToc: typeof previousToc = []
  for (let pass = 0; pass < 6; pass++) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
    pdf.setProperties({ title: report.meta.title, author: report.meta.authors, subject: 'Perfil: ' + report.profile + '; regras parciais; revisão humana necessária' })
    let y = st.top, page = 1, firstText = Infinity
    const toc: typeof previousToc = []
    const newPage = () => { pdf.addPage(); page++; y = st.top }
    const ensure = (height: number) => { if (y + height > bottom) newPage() }
    const lineText = (text: string, options: { size?: number; center?: boolean; bold?: boolean; indent?: number; single?: boolean; noIndent?: boolean; runs?: Run[] } = {}) => {
      const size = options.size ?? st.size, indent = options.indent ?? 0, x = left + indent, w = width - indent
      pdf.setFont(st.font === 'Arial' ? 'helvetica' : 'times', options.bold ? 'bold' : 'normal'); pdf.setFontSize(size)
      const lineHeight = size * .352778 * (options.single ? 1 : st.spacing)
      const firstIndent = options.noIndent || options.center || indent ? 0 : st.indent
      type Token = { text:string; bold?:boolean;italic?:boolean;width:number }
      const family=st.font==='Arial'?'helvetica':'times'
      const font=(bold?:boolean,italic?:boolean)=>pdf.setFont(family,bold?(italic?'bolditalic':'bold'):(italic?'italic':'normal'))
      const sourceRuns=options.runs?.length?options.runs:[{text:text||' ',bold:options.bold}]
      const tokens:Token[]=sourceRuns.flatMap(r=>r.text.split(/(\n|\s+)/).filter(Boolean).map(t=>{font(r.bold,r.italic);return {...r,text:t,width:pdf.getTextWidth(t)}}))
      const lines:{tokens:Token[];width:number;last:boolean}[]=[];let line:Token[]=[],used=0
      const push=(last=false)=>{while(line.length&&/^\s+$/.test(line[line.length-1].text)){used-=line.pop()!.width}lines.push({tokens:line,width:used,last});line=[];used=0}
      for(const t of tokens){if(t.text==='\n'){push(true);continue}const limit=w-(lines.length===0?firstIndent:0)
        if(used+t.width>limit&&line.length)push()
        if(!line.length&&/^\s+$/.test(t.text))continue
        // Long URLs/identifiers are split by measured glyph width rather than cut.
        if(t.width>w-firstIndent){for(const ch of t.text){font(t.bold,t.italic);const cw=pdf.getTextWidth(ch);if(used+cw>w-(lines.length===0?firstIndent:0))push();line.push({...t,text:ch,width:cw});used+=cw}}else{line.push(t);used+=t.width}
      }
      if(line.length||!lines.length)push(true);else lines[lines.length-1].last=true
      // Keep at least two lines together at a paragraph boundary.
      ensure(Math.min(2, lines.length) * lineHeight)
      for (let i = 0; i < lines.length; i++) {
        ensure(lineHeight)
        if(i===lines.length-1&&i>0&&y+lineHeight>bottom)newPage()
        const start = options.center ? 105-lines[i].width/2 : x+(i===0?firstIndent:0)
        const gaps=lines[i].tokens.filter(t=>/^\s+$/.test(t.text)).length
        const extra=!options.noIndent&&!options.center&&!options.single&&!lines[i].last&&gaps?(w-(i===0?firstIndent:0)-lines[i].width)/gaps:0
        let cursor=start
        for(const t of lines[i].tokens){font(t.bold,t.italic);pdf.text(t.text,cursor,y+size*.352778);cursor+=t.width+(/^\s+$/.test(t.text)?extra:0)}
        y += lineHeight
      }
      y += options.single ? size * .352778 : 2
    }
    if (st.cover) {
      lineText(report.meta.institution, { center: true, bold: true }); lineText(report.meta.course, { center: true }); lineText(report.meta.discipline, { center: true })
      y = Math.max(y + 12, 70); lineText(report.meta.authors, { center: true }); y = Math.max(y + 16, 130); lineText(title, { center: true, bold: true })
      if (y > 240) throw new Error('A capa excede uma página. Reduza o título ou a identificação.')
      y = 250; lineText(report.meta.city, { center: true }); lineText(report.meta.year, { center: true }); newPage()
    }
    if (st.titlePage) {
      lineText(report.meta.authors, { center: true }); y = Math.max(y + 10, 95); lineText(title, { center: true, bold: true }); y += 18
      lineText(report.meta.nature, { size: 10, single: true, indent: width / 2 }); lineText(report.meta.advisor ? 'Orientador(a): ' + report.meta.advisor : '', { size: 10, single: true, indent: width / 2 })
      if (y > 240) throw new Error('A folha de rosto excede uma página. Revise a identificação.')
      y = 250; lineText(report.meta.city, { center: true }); lineText(report.meta.year, { center: true }); newPage()
    }
    if (report.kind !== 'academic' && !st.cover) { lineText(title, { center: true, bold: true }); lineText(report.meta.authors, { center: true }); if (report.meta.advisor) lineText('Orientador(a): ' + report.meta.advisor, { center: true }); if (report.meta.orcid) lineText('ORCID: ' + report.meta.orcid, { center: true }); y += 6 }
    const drawToc = () => {
      lineText('SUMÁRIO', { center: true, bold: true }); y += 6
      const entries = previousToc.length ? previousToc : content.filter(b => b.id && b.zone !== 'pre').map(b => ({ title: b.text!, page: 0, level: b.level! }))
      for (const e of entries) {
        pdf.setFontSize(st.size); pdf.setFont(st.font === 'Arial' ? 'helvetica' : 'times', e.level === 1 ? 'bold' : 'normal')
        const wrapped: string[] = pdf.splitTextToSize(e.title, width - 18)
        ensure(wrapped.length * st.size * .352778 * st.spacing + 2)
        const entryY = y
        lineText(e.level===1?e.title.toLocaleUpperCase('pt-BR'):e.title, { bold: e.level === 1, noIndent: true })
        pdf.text(e.page ? String(displayPage(e.page)) : '', right, entryY + st.size * .352778, { align: 'right' })
      }
      newPage()
    }
    let tocDrawn = false
    for (const b of content) {
      if (b.type === 'heading' && b.id) {
        if (b.zone !== 'pre' && st.toc && !tocDrawn) { if (y > st.top + 1) newPage(); drawToc(); tocDrawn = true }
        if (b.level === 1 && report.kind === 'academic' && y > st.top + 1) newPage()
        ensure(25)
        if (b.zone !== 'pre') { firstText = Math.min(firstText, page); toc.push({ title: b.text!, page, level: b.level! }) }
      }
      if (b.type === 'break') { if (y > st.top) newPage(); continue }
      if (b.type === 'heading') { ensure(25); lineText(b.level === 1 ? b.text!.toLocaleUpperCase('pt-BR') : b.text!, { bold: true, center: b.centered, noIndent: true }); y += 4; continue }
      if (b.type === 'figure') {
        if (!/^data:image\/(png|jpeg);base64,/.test(b.src || '')) throw new Error('Figura inválida. Use PNG ou JPEG.')
        const image = pdf.getImageProperties(b.src!), imageW = Math.min(width, 150), imageH = Math.min(170, imageW / image.width * image.height), actualW = imageH / image.height * image.width
        ensure(imageH + 28); lineText(b.text!, { size: 10, center: true, single: true }); pdf.addImage(b.src!, image.fileType, left + (width - actualW) / 2, y, actualW, imageH); y += imageH + 2
        lineText('Fonte: ' + b.source, { size: 10, single: true, noIndent: true }); continue
      }
      if (b.type === 'table') {
        const rows = b.rows || []; if (!rows.length) continue
        const cols = Math.max(...rows.map(r => r.length)), cellW = width / cols, lh = 10 * .352778 * 1.15
        const measure = (row: string[],head=false) => { pdf.setFont(st.font === 'Arial' ? 'helvetica' : 'times',head?'bold':'normal');pdf.setFontSize(10); return row.map(cell => pdf.splitTextToSize(cell || ' ', cellW - 4) as string[]) }
        const rowHeight = (row: string[],head=false) => Math.max(...measure(row,head).map(lines => lines.length)) * lh + 4
        const drawRow = (row: string[], head: boolean) => {
          const lines = measure(row,head), h = rowHeight(row,head)
          if (h > bottom - st.top - 35) throw new Error('Uma linha da tabela é maior que a página. Divida o conteúdo da linha antes de exportar.')
          pdf.setFont(st.font === 'Arial' ? 'helvetica' : 'times', head ? 'bold' : 'normal'); pdf.setLineWidth(.2)
          lines.forEach((cell, i) => { if (b.frame) pdf.rect(left + i * cellW, y, cellW, h); cell.forEach((line,j) => pdf.text(line, left + i * cellW + 2, y + 5 + j * lh)) })
          if (!b.frame) { pdf.line(left,y,right,y); pdf.line(left,y+h,right,y+h) } y += h
        }
        ensure(25 + rowHeight(rows[0],true) + (rows[1] ? rowHeight(rows[1]) : 0))
        lineText(b.text!, { size: 10, single: true, noIndent: true }); drawRow(rows[0], true)
        for (const row of rows.slice(1)) {
          if (y + rowHeight(row) + 12 > bottom) { lineText('continua', { size: 10, single: true, noIndent: true }); newPage(); lineText(b.text! + ' (continuação)', { size: 10, single: true, noIndent: true }); drawRow(rows[0], true) }
          drawRow(row, false)
        }
        y += 2; lineText('conclusão', { size: 10, single: true, noIndent: true });lineText('Fonte: ' + b.source, { size: 10, single: true, noIndent: true }); continue
      }
      lineText(b.text || '', { size: b.small ? 10 : st.size, single: b.small||b.reference, indent: b.quote ? 40 : 0, noIndent: b.small||b.reference, runs:b.runs });
      if(b.reference)y+=st.size*.352778
    }
    for (let p = 1; p <= pdf.getNumberOfPages(); p++) { if (p >= firstText) { pdf.setPage(p); pdf.setFont(st.font === 'Arial' ? 'helvetica' : 'times', 'normal'); pdf.setFontSize(10); pdf.text(String(displayPage(p)),190,20,{align:'right'}) } }
    finalPdf = pdf; finalToc = toc
    if (JSON.stringify(previousToc) === JSON.stringify(toc) || !st.toc) break
    if (pass === 5) throw new Error('A paginação do sumário não estabilizou. Revise o documento.')
    previousToc = toc
  }
  return { pdf: finalPdf, toc: finalToc, pages: finalPdf.getNumberOfPages() }
}

export async function renderDocx(report: Report) {
  if(validateReport(report).some(i=>i.severity==='Erro')) throw new Error('Corrija os erros de validação antes de exportar.')
  const D = await import('docx'), st = report.style, mm = (n: number) => Math.round(n * 56.692913)
  const docxRuns=(r:Run)=>r.text.split('\n').map((text,i)=>new D.TextRun({text,break:i?1:0,bold:r.bold,italics:r.italic}))
  const text = (value: string, style = 'Normal', extra: object = {}) => new D.Paragraph({ style, children: docxRuns({text:value}), ...extra })
  const children: (InstanceType<typeof D.Paragraph> | InstanceType<typeof D.Table>)[] = []
  const center = { alignment: D.AlignmentType.CENTER }
  if (st.cover) { children.push(text(report.meta.institution,'Title',center),text(report.meta.course,'Normal',center),text(report.meta.discipline,'Normal',center),text(report.meta.authors,'Normal',{...center,spacing:{before:1200}}),text(report.meta.title,'Title',{...center,spacing:{before:1800}}),text(report.meta.subtitle,'Normal',center),text(report.meta.city,'Normal',{...center,spacing:{before:2400}}),text(report.meta.year,'Normal',center),new D.Paragraph({children:[new D.PageBreak()]})) }
  const coverEnd=children.length
  if (st.titlePage) children.push(text(report.meta.authors,'Normal',center),text(report.meta.title,'Title',{...center,spacing:{before:1600}}),text(report.meta.nature,'Small',{indent:{left:mm(80)},spacing:{before:800}}),text(report.meta.advisor,'Small',{indent:{left:mm(80)}}),text(report.meta.city,'Normal',{...center,spacing:{before:2400}}),text(report.meta.year,'Normal',center),new D.Paragraph({children:[new D.PageBreak()]}))
  if (report.kind !== 'academic' && !st.cover) children.push(text(report.meta.title,'Title',center),text(report.meta.authors,'Normal',center),text(report.meta.advisor,'Normal',center),text(report.meta.orcid,'Normal',center))
  let toc = false, bodyStart = -1
  for (const b of blocks(report)) {
    if (st.toc && !toc && b.id && b.zone !== 'pre') { children.push(text('SUMÁRIO','Title',{...center,pageBreakBefore:true})); children.push(new D.TableOfContents('Sumário',{hyperlink:true,headingStyleRange:'1-3'}) as unknown as InstanceType<typeof D.Paragraph>); toc = true }
    if(bodyStart<0 && b.id && b.zone!=='pre') bodyStart=children.length
    if (b.type === 'break') {children.push(new D.Paragraph({children:[new D.PageBreak()]})); continue}
    if (b.type === 'heading') { children.push(text(b.level===1 ? b.text!.toLocaleUpperCase('pt-BR') : b.text!, b.zone === 'pre' ? 'Title' : 'Heading'+b.level,{pageBreakBefore:report.kind==='academic'&&b.level===1&&children.length!==bodyStart,...(b.centered ? center : {})})); continue }
    if (b.type === 'figure') { const raw = b.src?.split(',')[1]; if (!raw) throw new Error('Figura inválida'); const data=Uint8Array.from(atob(raw),c=>c.charCodeAt(0)); const img=new jsPDF().getImageProperties(b.src!); const w=Math.min((210-st.left-st.right)*96/25.4,img.width,600*img.width/img.height),h=w/img.width*img.height;children.push(text(b.text!,'Small',{...center,keepNext:true}),new D.Paragraph({...center,keepNext:true,children:[new D.ImageRun({data,type:img.fileType.toLowerCase()==='png'?'png':'jpg',transformation:{width:w,height:Math.min(h,600)}})]}),text('Fonte: '+b.source,'Small')); continue }
    if (b.type === 'table') {const line={style:D.BorderStyle.SINGLE,size:4,color:'000000'},none={style:D.BorderStyle.NONE,size:0};children.push(text(b.text!,'Small',{keepNext:true}),new D.Table({borders:{top:line,bottom:line,left:b.frame?line:none,right:b.frame?line:none,insideHorizontal:line,insideVertical:b.frame?line:none},width:{size:100,type:D.WidthType.PERCENTAGE},rows:(b.rows??[]).map((row,i)=>new D.TableRow({tableHeader:i===0,cantSplit:true,children:row.map(cell=>new D.TableCell({children:[text(cell,'Small')]}))}))}),text('Fonte: '+b.source,'Small'));continue}
    children.push(new D.Paragraph({style:b.quote?'LongQuote':b.reference?'Reference':'Normal',children:(b.runs?.length?b.runs:[{text:b.text||''}]).flatMap(docxRuns)}))
  }
  const page={size:{width:mm(210),height:mm(297)},margin:{top:mm(st.top),left:mm(st.left),right:mm(st.right),bottom:mm(st.bottom),header:mm(20)}}
  const header=new D.Header({children:[new D.Paragraph({alignment:D.AlignmentType.RIGHT,indent:{firstLine:0},children:[new D.TextRun({children:[D.PageNumber.CURRENT],size:20})]})]})
  const sections: import('docx').ISectionOptions[]=[]
  if(coverEnd) sections.push({properties:{page},children:children.slice(0,coverEnd-1)})
  const pre=children.slice(coverEnd,bodyStart<0?children.length:bodyStart)
  if(pre.length) sections.push({properties:{page:{...page,pageNumbers:{start:1}}},children:pre})
  const main=bodyStart<0?[]:children.slice(bodyStart)
  if(main.length) sections.push({properties:{page:{...page,...(!pre.length?{pageNumbers:{start:1}}:{})}},headers:{default:header},children:main})
  const document = new D.Document({creator:report.meta.authors,title:report.meta.title,description:'Perfil '+report.profile+'; revisão humana necessária',features:{updateFields:true},styles:{default:{document:{run:{font:st.font,size:st.size*2,color:'000000'},paragraph:{spacing:{line:Math.round(240*st.spacing)},indent:{firstLine:mm(st.indent)},alignment:D.AlignmentType.JUSTIFIED}}},paragraphStyles:[{id:'Normal',name:'Normal'},{id:'Title',name:'Título',basedOn:'Normal',run:{bold:true},paragraph:{alignment:D.AlignmentType.CENTER,indent:{firstLine:0},keepNext:true}},...[1,2,3].map(n=>({id:'Heading'+n,name:'Heading '+n,basedOn:'Normal',run:{bold:true,color:'000000'},paragraph:{outlineLevel:n-1,keepNext:true,indent:{firstLine:0},spacing:{before:240,after:240},alignment:D.AlignmentType.LEFT}})),{id:'Small',name:'Legenda e fonte',basedOn:'Normal',run:{size:20},paragraph:{spacing:{line:240},indent:{firstLine:0},alignment:D.AlignmentType.LEFT}},{id:'LongQuote',name:'Citação longa',basedOn:'Small',paragraph:{indent:{left:mm(40),firstLine:0},spacing:{line:240,before:240,after:240}}},{id:'Reference',name:'Referência',basedOn:'Normal',paragraph:{spacing:{line:240,after:240},indent:{firstLine:0},alignment:D.AlignmentType.LEFT}}]},sections})
  return D.Packer.toBlob(document)
}
