'use client'
import {useRef,useState} from 'react'
import {unzipSync} from 'fflate'
import {Button} from '@/components/ui/button'
import {documentAction,readDocument,saveBlob,type ReferenceDocument} from '@/lib/project-documents'
import {inspectFile} from '../../../supabase/functions/_shared/file-validation'
export function DocumentationLibrary({documents,selected,onSelect,onUploaded,disabled}:{documents:ReferenceDocument[];selected:string[];onSelect:(ids:string[])=>void;onUploaded:()=>Promise<void>;disabled:boolean}){
 const [search,setSearch]=useState(''),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[file,setFile]=useState<File|null>(null),[authorized,setAuthorized]=useState(false)
 const [meta,setMeta]=useState({name:'',description:'',document_type:'Orientações',institution:'',version:'1'}),operation=useRef<string|undefined>(undefined)
 const busy=disabled||uploading
 async function upload(){
  if(!file||!authorized||!meta.name.trim()||busy)return
  setUploading(true);setError('');setNotice('')
  try{await inspectFile(file,true,unzipSync);operation.current??=crypto.randomUUID();const form=new FormData();form.set('scope','reference');form.set('client_id',operation.current);form.set('metadata',JSON.stringify({...meta,name:meta.name.trim(),distribution_authorized:true}));form.append('files',file);await documentAction(form);operation.current=undefined;setFile(null);setAuthorized(false);setNotice('Documento recebido. Ele permanece privado até revisão e publicação pela administração do Team Link.');await onUploaded()}catch(e){setError((e as Error).message)}finally{setUploading(false)}
 }
 async function download(document:ReferenceDocument){setError('');try{if(document.builtin){const exports=await import('@/lib/documentation-export');saveBlob(exports.createAbntGuide(await exports.loadDocumentationFont()).output('blob'),'Guia_ABNT_TeamLink.pdf')}else saveBlob(await readDocument('reference',document.id),document.filename||document.name)}catch(e){setError((e as Error).message)}}
 return <section aria-label="Biblioteca compartilhada" className="space-y-4 rounded-xl border border-card-outline p-4">
  <div><h3 className="font-semibold">Biblioteca compartilhada</h3><p className="text-xs text-muted-foreground">Documentos publicados estão disponíveis em todos os projetos. Seus envios pendentes são visíveis somente para você e a administração.</p></div>
  <label className="block text-sm">Buscar documento<input type="search" className="report-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nome do documento"/></label>
  <div className="max-h-72 space-y-2 overflow-y-auto">{documents.filter(d=>d.name.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))).map(document=><article key={document.id} className="rounded-xl border p-3 text-sm"><div className="flex items-start gap-2"><input aria-label={'Incluir '+document.name} type="checkbox" className="mt-1 size-4" disabled={busy||document.status==='rejected'} checked={selected.includes(document.id)} onChange={e=>onSelect(e.target.checked?[...selected,document.id]:selected.filter(id=>id!==document.id))}/><div className="min-w-0 flex-1"><p className="break-words font-medium">{document.name}{document.builtin?' · Padrão do sistema':''}</p><p className="text-xs text-muted-foreground">{document.document_type} · v{document.version}{document.institution?' · '+document.institution:''} · {document.status==='published'?'Publicado':document.status==='pending'?'Aguardando revisão':'Não publicado'}</p><p className="mt-1 break-words text-xs text-muted-foreground">{document.description}</p>{document.review_note&&<p className="text-xs">Revisão: {document.review_note}</p>}<p className="mt-1 text-[11px] text-muted-foreground">Incluído em {new Date(document.created_at).toLocaleDateString('pt-BR')}{document.size?' · '+Math.ceil(document.size/1024)+' KB':''}</p></div>{<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={()=>void download(document)}>Baixar</Button>}</div></article>)}</div>
  <details><summary className="cursor-pointer text-sm font-medium text-primary">Enviar documento de referência</summary><div className="mt-3 space-y-3">
   <p className="text-xs text-muted-foreground">PDF ou DOCX, até 10 MB. A administração avalia conteúdo, distribuição e segurança antes de publicar globalmente. O envio não concede permissão de aprovação.</p>
   {Object.entries({name:'Nome',description:'Descrição',document_type:'Tipo de documento',institution:'Instituição (opcional)',version:'Versão'}).map(([key,label])=><label key={key} className="block text-sm">{label}<input className="report-input" value={meta[key as keyof typeof meta]} maxLength={key==='description'?2000:key==='name'?180:80} disabled={busy} onChange={e=>{setMeta({...meta,[key]:e.target.value});operation.current=undefined}}/></label>)}
   <input aria-label="Arquivo de referência" key={file?'selected':'empty'} type="file" accept=".pdf,.docx" disabled={busy} className="w-full text-sm" onChange={e=>{setFile(e.target.files?.[0]??null);operation.current=undefined}}/>
   {file&&<p className="break-words text-xs">Selecionado: {file.name}</p>}
   <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={authorized} disabled={busy} onChange={e=>setAuthorized(e.target.checked)}/>Tenho autorização para compartilhar este material e confirmo que ele não contém dados privados ou normas protegidas sem licença de distribuição.</label>
   <Button type="button" disabled={busy||!file||!authorized||!meta.name.trim()} onClick={()=>void upload()}>{uploading?'Enviando…':'Enviar para avaliação'}</Button>
  </div></details>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-sm text-primary">{notice}</p>}
 </section>
}
