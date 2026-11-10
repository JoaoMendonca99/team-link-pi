'use client'
import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import {X} from 'lucide-react'
import {Container} from '@/components/layout/container'
import {Button} from '@/components/ui/button'
import {DocumentationLibrary} from './documentation-library'
import {LegacyDocuments} from './legacy-documents'
import {useSupabaseSession} from '@/hooks/use-supabase-session'
import {getSupabaseClient} from '@/lib/supabase/client'
import {buildAiPrompt,kindLabels,missingAcademic,type DocumentationData,type DocumentKind} from '@/lib/documentation'
import {saveBlob,type ReferenceDocument} from '@/lib/project-documents'
import type {ReportRow} from '@/lib/reports/model'
export async function documentationRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const result=await getSupabaseClient().rpc(name,args);if(result.error){console.error('documentation.rpc',{operation:name,code:result.error.code});throw Error(result.error.code==='P0001'?result.error.message:'Não foi possível carregar a documentação.')}return result.data as T}
export function DocumentationClient({slug}:{slug:string}){
 const {user,loading}=useSupabaseSession()
 return user?<Preparation key={user.id+slug} slug={slug}/>:<Container className="py-8"><p>{loading?'Carregando…':'Entre na sua conta para acessar a documentação.'}</p></Container>
}
function Preparation({slug}:{slug:string}){
 const [data,setData]=useState<DocumentationData>(),[documents,setDocuments]=useState<ReferenceDocument[]>([]),[legacy,setLegacy]=useState<Omit<ReportRow,'body'>[]>([]),[selected,setSelected]=useState<string[]>([]),[kind,setKind]=useState<DocumentKind>('academic'),[period,setPeriod]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[opened,setOpened]=useState(false)
 const dialog=useRef<HTMLDialogElement>(null),initialized=useRef(false),sequence=useRef(0),acting=useRef(false)
 const library=useCallback(async()=>{const result=await getSupabaseClient().from('reference_documents').select('*').order('builtin',{ascending:false}).order('name');if(result.error)throw Error('Não foi possível carregar a biblioteca.');const docs=result.data as ReferenceDocument[],first=!initialized.current;initialized.current=true;setDocuments(docs);setSelected(ids=>first?docs.filter(d=>d.builtin).map(d=>d.id):ids.filter(id=>docs.some(d=>d.id===id&&d.status!=='rejected')))},[])
 useEffect(()=>{let alive=true;void Promise.all([documentationRpc<DocumentationData>('get_documentation_data',{p_slug:slug,p_period:null}),documentationRpc<{documents:Omit<ReportRow,'body'>[]}>('get_report_workspace',{p_slug:slug}),library()]).then(([next,space])=>{if(alive){setData(next);setLegacy(space.documents)}}).catch(e=>{if(alive)setError((e as Error).message)});return()=>{alive=false}},[slug,library])
 useEffect(()=>{if(opened)dialog.current?.showModal();else dialog.current?.close()},[opened])
 async function refresh(nextPeriod=period){const request=++sequence.current,next=await documentationRpc<DocumentationData>('get_documentation_data',{p_slug:slug,p_period:nextPeriod||null});if(request===sequence.current)setData(next);return next}
 async function act(run:()=>Promise<void>){if(acting.current)return;acting.current=true;setBusy(true);setError('');setNotice('');try{await run()}catch(e){setError((e as Error).message)}finally{acting.current=false;setBusy(false)}}
 const chosen=documents.filter(d=>selected.includes(d.id)&&d.status!=='rejected')
 async function exportPackage(zip:boolean){await act(async()=>{const next=await refresh(),exports=await import('@/lib/documentation-export'),font=await exports.loadDocumentationFont();const blob=zip?await exports.createDocumentationZip(next,kind,chosen,font):exports.createDataPdf(next,kind,font).output('blob');saveBlob(blob,zip?'TeamLink_Documentacao_IA.zip':'01_Dados_do_Projeto.pdf');setNotice(zip?'Pacote ZIP gerado no seu dispositivo.':'PDF de dados gerado no seu dispositivo.')})}
 return <Container className="space-y-6 py-6">
  <Link href={'/projetos/'+slug+'/painel'} className="text-sm text-primary hover:underline">← Voltar ao painel</Link>
  <header className="flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm text-muted-foreground">{data?.project.title}</p><h1 className="text-2xl font-semibold">Documentação com IA</h1></div><Button disabled={!data||busy} onClick={()=>setOpened(true)}>Gerar PDF para IA</Button></header>
  <section className="space-y-3 rounded-2xl border border-card-outline bg-card p-5"><h2 className="font-semibold">Dados reais, prontos para sua IA</h2><p className="text-sm text-muted-foreground">Prepare um PDF dos dados autorizados do projeto, selecione orientações acadêmicas e leve o pacote ZIP ao ChatGPT, Gemini ou à IA de sua preferência. O Team Link não gera o relatório final e não envia seus dados a serviços de IA.</p>{data&&<p className="text-sm">{data.tasks.length} atividades do período · {data.members.length} vínculos na equipe · {data.goals.length} metas</p>}{data&&['completed','archived'].includes(data.project.status)&&<p className="text-sm text-primary">Projeto histórico · exportação para consulta, sem modificar os dados.</p>}</section>
  {error&&!opened&&<p role="alert" className="text-sm text-destructive">{error}</p>}{!data&&!error&&<p role="status">Carregando dados autorizados…</p>}
  {data&&<LegacyDocuments documents={legacy}/>}
  <dialog ref={dialog} aria-label="Preparar pacote para IA" onCancel={e=>{e.preventDefault();if(!busy)setOpened(false)}} className="report-dialog max-h-[92dvh] w-[calc(100%_-_1rem)] max-w-3xl overflow-y-auto">
   <div className="flex items-center justify-between gap-2"><h2 className="text-xl font-semibold">Preparar pacote para IA</h2><Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Fechar preparação" onClick={()=>setOpened(false)}><X/></Button></div>
   <p className="my-3 text-sm text-muted-foreground">Escolha o documento, confira as ausências e selecione referências. Nenhum texto manual é obrigatório.</p>
   <div className="space-y-4">
    <label className="block text-sm">Documento solicitado<select className="report-input" disabled={busy} value={kind} onChange={e=>setKind(e.target.value as DocumentKind)}>{Object.entries(kindLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    <label className="block text-sm">Período dos dados<select className="report-input" value={period} disabled={busy} onChange={e=>{const value=e.target.value;setPeriod(value);void act(async()=>{await refresh(value)})}}><option value="">Período ativo</option>{data?.periods.map(p=><option key={p.id} value={p.id}>{p.name}{p.is_active?' · Ativo':''}</option>)}</select></label>
    {data&&<section className="rounded-xl border p-3 text-sm"><h3 className="font-medium">Informações a confirmar</h3><p className="mt-1 text-muted-foreground">{missingAcademic(data).length?'Ausentes: '+missingAcademic(data).join(', ')+'.':'Dados acadêmicos básicos registrados.'} A IA deverá perguntar sobre objetivos, métodos, resultados e bibliografia que não estejam documentados.</p></section>}
    <DocumentationLibrary documents={documents} selected={selected} onSelect={setSelected} onUploaded={library} disabled={busy}/>
    <section className="rounded-xl border p-3 text-sm"><h3 className="font-medium">Arquivos do pacote</h3><ul className="mt-2 list-inside list-disc space-y-1 break-words"><li>01_Dados_do_Projeto.pdf</li>{chosen.some(d=>d.builtin)&&<li>02_Guia_ABNT.pdf</li>}{chosen.filter(d=>!d.builtin).map(d=><li key={d.id}>03_Documentos_de_Referencia/{d.filename||d.name}</li>)}<li>04_Prompt_IA.txt</li></ul><p className="mt-2 text-xs text-muted-foreground">O guia é uma síntese própria baseada nas normas e nas <a className="underline" href="https://biblioteca.ufes.br/normalizacao" target="_blank" rel="noreferrer">orientações atuais da UFES</a>. Nenhuma norma protegida é redistribuída.</p></section>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p role="status" className="text-sm text-primary">{notice}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy||!data} onClick={()=>void exportPackage(true)}>{busy?'Preparando…':'Baixar pacote ZIP'}</Button><Button variant="outline" disabled={busy||!data} onClick={()=>void exportPackage(false)}>Baixar só o PDF de dados</Button><Button variant="outline" disabled={busy||!data} onClick={()=>void act(async()=>{const next=await refresh();await navigator.clipboard.writeText(buildAiPrompt(next,kind,chosen));setNotice('Prompt copiado.')})}>Copiar prompt</Button></div>
   </div>
  </dialog>
 </Container>
}
