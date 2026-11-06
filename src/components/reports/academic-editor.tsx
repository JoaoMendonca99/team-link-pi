'use client'

import { Node, mergeAttributes, type JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { citationText, type Reference, type RichNode } from '@/lib/reports/model'

const Citation = Node.create({ name: 'citation', group: 'block', atom: true,
  addAttributes: () => ({ referenceId: {default:''}, mode: {default:'indirect'}, quote: {default:''}, location: {default:''}, label: {default:''} }),
  parseHTML: () => [{tag:'div[data-citation]'}], renderHTML: ({node}) => ['div',{'data-citation':'',class:'academic-citation'},String(node.attrs.label)] })
const PageBreak = Node.create({name:'pageBreak',group:'block',atom:true,parseHTML:()=>[{tag:'hr[data-page-break]'}],renderHTML:()=>['hr',{'data-page-break':''}]})
const Figure = Node.create({name:'figure',group:'block',atom:true,
  addAttributes:()=>({src:{default:''},title:{default:''},source:{default:''}}),parseHTML:()=>[{tag:'figure[data-academic]'}],
  renderHTML:({node})=>['figure',{'data-academic':''},['figcaption',{},'Figura — '+node.attrs.title],['img',{src:/^data:image\/(png|jpeg);base64,/.test(node.attrs.src)?node.attrs.src:'',alt:node.attrs.title}],['p',{},'Fonte: '+node.attrs.source]]})
const AcademicTable = Node.create({name:'academicTable',group:'block',content:'table',isolating:true,
  addAttributes:()=>({title:{default:''},source:{default:''},kind:{default:'table'}}),parseHTML:()=>[{tag:'div[data-academic-table]'}],
  renderHTML:({HTMLAttributes,node})=>['div',mergeAttributes(HTMLAttributes,{'data-academic-table':'',class:'academic-table'}),['p',{},(node.attrs.kind==='frame'?'Quadro':'Tabela')+' — '+node.attrs.title],['div',{},0],['p',{},'Fonte: '+node.attrs.source]]})
export const academicExtensions = [StarterKit.configure({heading:{levels:[1,2,3]},link:false,codeBlock:false,code:false,strike:false,underline:false}),TableKit.configure({table:{resizable:false}}),Citation,PageBreak,Figure,AcademicTable]

export function AcademicEditor({value,onChange,disabled,references}:{value:RichNode;onChange:(value:RichNode)=>void;disabled:boolean;references:Reference[]}) {
  const [insert,setInsert]=useState<'citation'|'figure'|'table'|null>(null), [error,setError]=useState('')
  const dialog=useRef<HTMLDialogElement>(null)
  const editor=useEditor({extensions:academicExtensions,content:value as JSONContent,immediatelyRender:false,editable:!disabled,
    editorProps:{attributes:{'aria-label':'Conteúdo da seção',class:'academic-content min-h-80 rounded-xl border border-input bg-background p-5 outline-none focus:ring-2 focus:ring-ring'}},
    onUpdate:({editor})=>onChange(editor.getJSON() as RichNode)})
  useEffect(()=>{editor?.setEditable(!disabled,false)},[editor,disabled])
  function open(type:NonNullable<typeof insert>) {setInsert(type);setError('');dialog.current?.showModal()}
  async function submit(form:HTMLFormElement) {
    if(!editor)return
    const data=new FormData(form), get=(key:string)=>String(data.get(key)||'')
    try {
      if(insert==='citation') {
        const n:RichNode={type:'citation',attrs:{referenceId:get('reference'),mode:get('mode'),quote:get('quote'),location:get('location')}}
        n.attrs!.label=citationText(n,references);editor.chain().focus().insertContent(n as JSONContent).run()
      } else if(insert==='table') {
        const count=Number(get('rows')),cols=Number(get('columns'))
        if(count<2||count>100||cols<1||cols>8)throw new Error('Use de 2 a 100 linhas e de 1 a 8 colunas.')
        editor.chain().focus().insertContent({type:'academicTable',attrs:{title:get('title'),source:get('source'),kind:get('kind')},content:[{type:'table',content:Array.from({length:count},(_,i)=>({type:'tableRow',content:Array.from({length:cols},()=>({type:i===0?'tableHeader':'tableCell',content:[{type:'paragraph'}]}))}))}]}).run()
      } else {
        const file=data.get('file') as File
        if(!file||!['image/png','image/jpeg'].includes(file.type)||file.size>600000)throw new Error('Use PNG ou JPEG de até 600 KB.')
        const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file)})
        // Decode before accepting an uploaded figure, not just its MIME label.
        await createImageBitmap(file)
        editor.chain().focus().insertContent({type:'figure',attrs:{src,title:get('title'),source:get('source')}}).run()
      }
      dialog.current?.close()
    }catch(e){setError(e instanceof Error?e.message:'Não foi possível inserir o conteúdo.')}
  }
  const command=(action:()=>void)=>{if(!disabled)action()}
  return <div className="space-y-3">
    <div role="toolbar" aria-label="Estilos acadêmicos" className="flex flex-wrap gap-2">
      <select aria-label="Estilo do parágrafo" disabled={disabled} className="rounded-lg border border-input bg-background p-2 text-sm" onChange={e=>command(()=>{if(e.target.value==='normal')editor?.chain().focus().setParagraph().run();else if(e.target.value==='quote')editor?.chain().focus().toggleBlockquote().run();else editor?.chain().focus().toggleHeading({level:Number(e.target.value) as 1|2|3}).run()})} defaultValue="normal">
        <option value="normal">Texto normal</option><option value="1">Seção primária</option><option value="2">Seção secundária</option><option value="3">Seção terciária</option><option value="quote">Citação longa</option>
      </select>
      <Button size="sm" variant="outline" disabled={disabled} aria-pressed={editor?.isActive('bold')} onClick={()=>editor?.chain().focus().toggleBold().run()}>Negrito</Button>
      <Button size="sm" variant="outline" disabled={disabled} aria-pressed={editor?.isActive('italic')} onClick={()=>editor?.chain().focus().toggleItalic().run()}>Itálico</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={()=>editor?.chain().focus().toggleBulletList().run()}>Lista</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={()=>editor?.chain().focus().toggleOrderedList().run()}>Lista numerada</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={()=>open('table')}>Tabela / Quadro</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={()=>open('figure')}>Figura</Button>
      <Button size="sm" variant="outline" disabled={disabled||!references.length} onClick={()=>open('citation')}>Citação vinculada</Button>
      <Button size="sm" variant="outline" disabled={disabled} onClick={()=>editor?.chain().focus().insertContent({type:'pageBreak'}).run()}>Quebra de página</Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={()=>editor?.chain().focus().undo().run()}>Desfazer</Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={()=>editor?.chain().focus().redo().run()}>Refazer</Button>
    </div>
    <EditorContent editor={editor}/>
    <p className="text-xs text-muted-foreground">A edição é contínua; a paginação final pode ser conferida em Visualizar PDF. Figuras e citações vinculadas podem ser selecionadas e removidas com Backspace para substituição.</p>
    <dialog ref={dialog} aria-label="Inserir conteúdo acadêmico" className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border bg-card p-5 text-card-foreground backdrop:bg-black/60" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}>
      <form key={insert} className="space-y-3" onSubmit={e=>{e.preventDefault();void submit(e.currentTarget)}}>
        <div className="flex justify-between"><h3 className="font-semibold">Inserir {insert==='citation'?'citação':insert==='figure'?'figura':'tabela ou quadro'}</h3><Button type="button" variant="ghost" onClick={()=>dialog.current?.close()}>Fechar</Button></div>
        {error&&<p role="alert" className="text-destructive">{error}</p>}
        {insert==='citation'?<>
          <label className="block">Referência<select name="reference" required className="report-input">{references.map(r=><option key={r.id} value={r.id}>{r.call} — {r.title}</option>)}</select></label>
          <label className="block">Tipo<select name="mode" className="report-input"><option value="indirect">Indireta</option><option value="short">Direta curta</option><option value="long">Direta longa</option></select></label>
          <label className="block">Trecho / redação manual<textarea name="quote" className="report-input" required/></label>
          <label className="block">Página ou localização (ex.: p. 23; cap. 2)<input name="location" className="report-input"/></label>
        </>:<>
          <label className="block">Título<input name="title" required className="report-input" maxLength={200}/></label>
          <label className="block">Fonte<input name="source" required className="report-input" maxLength={500}/></label>
          {insert==='figure'?<label className="block">Imagem PNG/JPEG (até 600 KB)<input name="file" type="file" required accept="image/png,image/jpeg" className="report-input"/></label>:<>
            <label className="block">Tipo<select name="kind" className="report-input"><option value="table">Tabela — dados numéricos</option><option value="frame">Quadro — informações textuais</option></select></label>
            <label className="block">Linhas<input type="number" name="rows" min="2" max="100" defaultValue="3" className="report-input"/></label>
            <label className="block">Colunas<input type="number" name="columns" min="1" max="8" defaultValue="3" className="report-input"/></label>
          </>}
        </>}
        <Button type="submit">Inserir no documento</Button>
      </form>
    </dialog>
  </div>
}
