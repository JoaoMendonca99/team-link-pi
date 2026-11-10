'use client'
import {useEffect,useRef,useState} from 'react'
import Image from 'next/image'
import {Paperclip,X} from 'lucide-react'
import {unzipSync} from 'fflate'
import {Button} from '@/components/ui/button'
import {Textarea} from '@/components/ui/textarea'
import {acceptedFiles,inspectFile} from '../../../supabase/functions/_shared/file-validation'
import {documentAction,readDocument,saveBlob,type Evidence} from '@/lib/project-documents'
import {sendOnEnter} from '@/lib/chat/keyboard'

export function ActivityComposer({taskId,replyTo,historical,onSent,onDirty,cancelReply}:{taskId:string;replyTo?:{id:string;body:string};historical:boolean;onSent:()=>Promise<void>;onDirty:(dirty:boolean)=>void;cancelReply:()=>void}){
 const [body,setBody]=useState(''),[files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[previews,setPreviews]=useState<string[]>([])
 const input=useRef<HTMLInputElement>(null),operation=useRef<string|undefined>(undefined),sending=useRef(false),adding=useRef(false)
 useEffect(()=>{operation.current=undefined},[replyTo?.id,historical])
 useEffect(()=>{onDirty(Boolean(body.trim()||files.length))},[body,files,onDirty])
 useEffect(()=>{const urls=files.map(f=>f.type.startsWith('image/')?URL.createObjectURL(f):'');setPreviews(urls);return()=>urls.forEach(url=>{if(url)URL.revokeObjectURL(url)})},[files])
 function changed(){operation.current=undefined;setError('')}
 async function add(incoming:File[]){
  if(sending.current||adding.current)return
  if(files.length+incoming.length>5){setError('Cada mensagem pode ter até 5 anexos. Envie os demais em outra mensagem.');return}
  adding.current=true;setBusy(true);setError('')
  try{for(const f of incoming)await inspectFile(f,false,unzipSync);setFiles(old=>[...old,...incoming]);changed()}catch(e){setError((e as Error).message)}finally{adding.current=false;setBusy(false)}
 }
 async function send(){
  if(busy||sending.current||!body.trim()&&!files.length)return
  sending.current=true;setBusy(true);setError('');operation.current??=crypto.randomUUID()
  try{
   // Replies and files use one atomic server operation; text-only keeps the established mutation.
   if(files.length){
    const form=new FormData();form.set('scope','activity');form.set('task_id',taskId);form.set('client_id',operation.current);form.set('body',body.trim());form.set('historical_edit',String(historical));if(replyTo)form.set('reply_to',replyTo.id);files.forEach(f=>form.append('files',f))
    await documentAction(form)
   }else{
    const client=(await import('@/lib/supabase/client')).getSupabaseClient()
    const result=await client.rpc('send_activity_discussion',{p_task:taskId,p_body:body.trim(),p_client:operation.current,p_reply:replyTo?.id??null,p_historical:historical})
    if(result.error)throw Error(result.error.code==='P0001'?result.error.message:'Não foi possível enviar a mensagem.')
   }
   setBody('');setFiles([]);operation.current=undefined;cancelReply();await onSent()
  }catch(e){setError((e as Error).message)}finally{sending.current=false;setBusy(false)}
 }
 return <form className="shrink-0 space-y-2 border-t p-3" onSubmit={e=>{e.preventDefault();void send()}} onDragOver={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault()}} onDrop={e=>{if(e.dataTransfer.files.length){e.preventDefault();void add(Array.from(e.dataTransfer.files))}}}>
  {replyTo&&<div className="flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted p-2 text-xs"><p className="min-w-0 flex-1 truncate">Respondendo: {replyTo.body||'Anexos'}</p><Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Cancelar resposta" onClick={()=>{cancelReply();changed()}}><X className="size-4"/></Button></div>}
  {files.length>0&&<ul className="flex max-h-32 flex-wrap gap-2 overflow-y-auto" aria-label="Anexos selecionados">{files.map((file,index)=><li key={index} className="flex max-w-full items-center gap-2 rounded-lg border p-1 text-xs">{previews[index]&&<Image unoptimized width={40} height={40} alt="Prévia do anexo" src={previews[index]} className="size-10 rounded object-cover"/>}<span className="max-w-40 truncate">{file.name}</span><Button type="button" size="icon" variant="ghost" disabled={busy} aria-label={'Remover '+file.name} onClick={()=>{setFiles(old=>old.filter((_,i)=>i!==index));changed()}}><X className="size-4"/></Button></li>)}</ul>}
  <Textarea aria-label="Mensagem sobre a atividade" placeholder="Escreva uma mensagem ou anexe evidências…" maxLength={4000} rows={2} value={body} disabled={busy} onChange={e=>{setBody(e.target.value);changed()}} onPaste={e=>{const images=Array.from(e.clipboardData.files).filter(f=>f.type.startsWith('image/'));if(images.length){e.preventDefault();void add(images)}}} onKeyDown={e=>sendOnEnter(e,!busy&&Boolean(body.trim()||files.length),()=>e.currentTarget.form?.requestSubmit())}/>
  <input ref={input} type="file" multiple accept={acceptedFiles} hidden disabled={busy} onChange={e=>{void add(Array.from(e.target.files??[]));e.target.value=''}}/>
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  <div className="flex flex-wrap items-center justify-between gap-2"><Button type="button" size="sm" variant="outline" disabled={busy||files.length>=5} onClick={()=>input.current?.click()}><Paperclip className="mr-1 size-4"/>Anexar {files.length}/5</Button><p className="text-[11px] text-muted-foreground">Até 10 MB cada · Enter envia</p><Button type="submit" size="sm" disabled={busy||!body.trim()&&!files.length}>{busy?'Enviando…':'Enviar'}</Button></div>
 </form>
}

function EvidenceItem({file}:{file:Evidence}){
 const [preview,setPreview]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expanded,setExpanded]=useState(false),dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(!file.mime.startsWith('image/'))return;let alive=true,url='';void readDocument('activity',file.id).then(blob=>{if(alive){url=URL.createObjectURL(blob);setPreview(url)}}).catch(()=>{if(alive)setError('Não foi possível carregar a imagem.')});return()=>{alive=false;if(url)URL.revokeObjectURL(url)}},[file.id,file.mime])
 useEffect(()=>{if(expanded)dialog.current?.showModal();else dialog.current?.close()},[expanded])
 async function download(){setBusy(true);setError('');try{saveBlob(await readDocument('activity',file.id),file.filename)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 return <div className="min-w-0 space-y-1 rounded-lg border border-border p-2">
  {preview&&<button type="button" aria-label={'Ampliar '+file.filename} className="block w-full" onClick={()=>setExpanded(true)}><Image unoptimized width={640} height={480} src={preview} alt={file.filename} className="h-auto max-h-48 max-w-full rounded object-contain"/></button>}
  <p className="break-words text-xs [overflow-wrap:anywhere]">{file.filename} · {(file.size/1024).toFixed(0)} KB · {file.mime.split('/').at(-1)==='vnd.openxmlformats-officedocument.wordprocessingml.document'?'DOCX':file.mime.split('/').at(-1)?.toUpperCase()}</p><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>void download()}>Baixar arquivo</Button>{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  <dialog ref={dialog} aria-label={file.filename} onCancel={e=>{e.preventDefault();e.stopPropagation();setExpanded(false)}} onClick={e=>{if(e.target===e.currentTarget)setExpanded(false)}} className="fixed inset-0 m-auto max-h-[94dvh] w-[96vw] max-w-5xl overflow-auto rounded-xl border bg-card p-3 text-foreground backdrop:bg-black/80"><div className="mb-2 flex items-center justify-between gap-2"><p className="min-w-0 break-words text-sm">{file.filename}</p><Button type="button" size="icon" variant="ghost" aria-label="Fechar imagem" onClick={()=>setExpanded(false)}><X/></Button></div>{expanded&&preview&&<Image unoptimized width={1600} height={1200} src={preview} alt={file.filename} className="mx-auto h-auto max-h-[78dvh] max-w-full object-contain"/>}</dialog>
 </div>
}
export function ActivityAttachments({files}:{files:Evidence[]}){return <div className="grid min-w-0 gap-2">{files.map(file=><EvidenceItem key={file.id} file={file}/>)}</div>}
