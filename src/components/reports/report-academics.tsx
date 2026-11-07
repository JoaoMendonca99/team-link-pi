'use client'

import {useState,type ReactNode} from 'react'
import {Button} from '@/components/ui/button'
import {useProjectAcademics} from '@/hooks/use-project-academics'
import {academicLabels,academicSnapshot,applyAcademicSnapshot,confirmAcademicValues,reportAcademicValues,type AcademicValues} from '@/lib/projects/academics'
import type {Report} from '@/lib/reports/model'

type Props={projectId:string;body:Report;disabled:boolean;onChange:(body:Report)=>void;onContinue?:(body:Report)=>Promise<boolean>;children?:ReactNode;advanced?:ReactNode}
export function ReportAcademics({projectId,body,disabled,onChange,onContinue,children,advanced}:Props) {
 const {data:space,error,reload}=useProjectAcademics(projectId)
 const [selection,setSelection]=useState<string>(),[editing,setEditing]=useState(false)
 const [pending,setPending]=useState<{id:string;values:AcademicValues;fields:string[]}>()
 const periodId=selection??body.academic?.periodId??space?.periods.find(p=>p.is_active)?.id??'manual'
 const period=space?.periods.find(p=>p.id===periodId)
 const current=reportAcademicValues(body),hasValues=Object.values(current).some(value=>Boolean(value.trim()))
 const values=body.academic||hasValues||!period||!space?current:academicSnapshot(space,period)
 const displayed=pending?.values??values
 const keys=Object.keys(academicLabels) as (keyof AcademicValues)[]
 function manual(){const next={...body};delete next.academic;setSelection('manual');setPending(undefined);setEditing(true);onChange(next)}
 function accept(id:string,incoming:AcademicValues){const chosen=space?.periods.find(p=>p.id===id);if(!chosen||!space)return;setSelection(id);setPending(undefined);onChange(applyAcademicSnapshot(body,space,chosen,incoming))}
 function choose(id:string){
  if(id==='manual'){manual();return}
  const chosen=space?.periods.find(p=>p.id===id);if(!chosen||!space)return
  const incoming=academicSnapshot(space,chosen)
  const fields=keys.filter(key=>current[key]!==incoming[key]&&(Boolean(current[key].trim())||Boolean(body.academic))).map(key=>academicLabels[key])
  if(fields.length){setPending({id,values:incoming,fields});return}
  accept(id,incoming)
 }
 function editValues(next:AcademicValues){onChange(period&&space?confirmAcademicValues(body,space,period,next):{...body,meta:{...body.meta,...next}})}
 function prepared(){return period&&space?confirmAcademicValues(body,space,period,values):body}
 return <div className="space-y-4">
  <section aria-label="Informações acadêmicas do relatório" className="min-w-0 space-y-4 rounded-xl border bg-muted/30 p-4">
   <label className="block text-sm">Período acadêmico<select disabled={disabled} className="report-input" value={pending?.id??periodId} onChange={e=>choose(e.target.value)}><option value="manual">Preencher manualmente</option>{space?.periods.map(p=><option key={p.id} value={p.id}>{p.name}{p.is_active?' · Ativo':''}</option>)}{!space&&body.academic&&<option value={body.academic.periodId}>{body.academic.snapshot.period||'Período vinculado'}</option>}</select></label>
   {error&&<p role="status" className="text-sm text-muted-foreground">{error} As informações do documento foram preservadas.</p>}
   {!space&&!error&&<p role="status" className="text-xs text-muted-foreground">Consultando períodos. O preenchimento manual continua disponível.</p>}
   {pending&&<div role="alert" className="space-y-3 rounded-lg border border-primary/40 p-3 text-sm"><p>Ao utilizar este período, serão atualizados: {pending.fields.join(', ')}. Título e autores serão preservados.</p><div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={disabled} onClick={()=>accept(pending.id,pending.values)}>Usar dados do período</Button><Button type="button" size="sm" variant="outline" disabled={disabled} onClick={()=>accept(pending.id,current)}>Manter campos do documento</Button><Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={()=>setPending(undefined)}>Cancelar troca</Button></div></div>}
   {editing||periodId==='manual'?<div className="grid min-w-0 gap-3 sm:grid-cols-2">{keys.map(key=><label key={key} className="block min-w-0 text-sm" htmlFor={'report-meta-'+key}>{academicLabels[key]}<input id={'report-meta-'+key} disabled={disabled||Boolean(pending)} maxLength={500} className="report-input" value={displayed[key]} onChange={e=>editValues({...values,[key]:e.target.value})}/></label>)}</div>:<dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">{keys.map(key=><div key={key} className="min-w-0"><dt className="text-xs text-muted-foreground">{academicLabels[key]}</dt><dd className="break-words">{displayed[key]||'Pendente'}</dd></div>)}</dl>}
   {periodId!=='manual'&&<Button data-report-academic-edit type="button" size="sm" variant="outline" disabled={disabled||Boolean(pending)} onClick={()=>setEditing(value=>!value)}>{editing?'Concluir edição':'Editar informações'}</Button>}
   <p className="text-xs text-muted-foreground">Estas informações pertencem ao documento. Editá-las não altera o projeto nem os outros relatórios.</p>
   <details><summary className="cursor-pointer text-sm font-medium">Opções avançadas</summary><div className="mt-3 space-y-3">
    {body.academic&&<p className="text-xs text-muted-foreground">Retrato de {body.academic.snapshot.period||'período vinculado'}, confirmado em {body.academic.confirmedAt?new Date(body.academic.confirmedAt).toLocaleString('pt-BR'):'data não registrada'}. A origem não reescreve este documento.</p>}
    <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={disabled||!period} onClick={()=>choose(periodId)}>Atualizar sugestões do período</Button><Button type="button" size="sm" variant="outline" disabled={disabled||!(pending?.id||period)} onClick={()=>accept(pending?.id||periodId,current)}>Vincular sem substituir campos</Button>{body.academic&&<Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={manual}>Desvincular período e preservar campos</Button>}<Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={()=>void reload()}>Reconsultar dados</Button></div>
    {(editing||periodId==='manual')&&advanced}
   </div></details>
  </section>
  {children}
  <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" className="h-auto min-h-10 max-w-full whitespace-normal" disabled={disabled||Boolean(pending)} onClick={()=>{const next=prepared();onChange(next);if(onContinue)void onContinue(next)}}>{onContinue?(body.assistant?.furthest||0)>=3?'Continuar para Dados':'Utilizar informações e continuar':'Aplicar informações ao documento'}</Button></div>
 </div>
}
