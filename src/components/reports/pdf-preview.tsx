'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
export function PdfPreview({url}:{url:string}) {
 const canvas=useRef<HTMLCanvasElement>(null),[page,setPage]=useState(1),[count,setCount]=useState(0),[failure,setFailure]=useState(''),[busy,setBusy]=useState(true)
 useEffect(()=>{let active=true;let cleanup:(()=>void)|undefined;setBusy(true);setFailure('')
  void import('pdfjs-dist').then(async pdfjs=>{
   pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString()
   const task=pdfjs.getDocument({url,useSystemFonts:true});cleanup=()=>{void task.destroy()}
   const pdf=await task.promise;if(!active)return;setCount(pdf.numPages);const item=await pdf.getPage(Math.min(page,pdf.numPages));if(!active||!canvas.current)return
   const target=canvas.current,context=target.getContext('2d');if(!context)throw new Error('Canvas indisponível')
   const viewport=item.getViewport({scale:1.5});target.width=viewport.width;target.height=viewport.height
   await item.render({canvas:target,canvasContext:context,viewport}).promise
   if(active)setBusy(false)
  }).catch(()=>{if(active){setFailure('Não foi possível exibir a prévia neste navegador. Exporte o PDF para conferi-lo em um leitor.');setBusy(false)}})
  return()=>{active=false;cleanup?.()}
 },[url,page])
 return <div className="mt-3 space-y-3"><div className="flex flex-wrap items-center justify-center gap-3"><Button size="sm" variant="outline" disabled={busy||page<=1} onClick={()=>setPage(p=>p-1)}>Página anterior</Button><span>Página {page} de {count||'…'}</span><Button size="sm" variant="outline" disabled={busy||page>=count} onClick={()=>setPage(p=>p+1)}>Próxima página</Button><a href={url} download="relatorio.pdf" className="text-primary underline">Baixar PDF</a></div>{busy&&<p role="status">Renderizando página…</p>}{failure&&<p role="alert">{failure}</p>}<div className="max-h-[70dvh] overflow-y-auto rounded-lg bg-muted p-2"><canvas ref={canvas} aria-label={'Prévia da página '+page+' do PDF exportado'} className="mx-auto h-auto max-w-full bg-white"/></div><p className="text-xs text-muted-foreground">Prévia renderizada do próprio PDF final. O conteúdo editável e a paginação do Word devem ser conferidos no editor compatível.</p></div>
}
