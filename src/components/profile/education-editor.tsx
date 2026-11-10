'use client'

import { useState } from 'react'
import { Plus, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InstitutionPicker } from '@/components/team-link/institution-picker'
import { CoursePicker } from '@/components/team-link/course-picker'
import { educationDraft,educationStatus,sameEducation,educationValidation,changeCurrentEducation,type EducationDraft,type LegacyEducation } from '@/lib/education'

type Props={value:EducationDraft[];onChange:(rows:EducationDraft[])=>void;primary:string|null;onPrimary:(id:string|null)=>void;disabled?:boolean;legacy?:LegacyEducation|null;resolvedLegacyId?:string|null;onResolveLegacy?:(id:string|null)=>void;onEditing?:(editing:boolean)=>void}
function CurrentStudy({value,onChange,disabled}:{value:boolean|null;onChange:(value:boolean)=>void;disabled?:boolean}){
  return <div className="space-y-1"><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={value===true} aria-checked={value===null?'mixed':value} ref={node=>{if(node)node.indeterminate=value===null}} disabled={disabled} onChange={e=>onChange(e.target.checked)}/>Cursando atualmente</label>
    {value===null&&<p className="text-xs text-muted-foreground">Situação anterior não informada. <button type="button" disabled={disabled} className="underline" onClick={()=>onChange(false)}>Confirmar que não estou cursando</button></p>}</div>
}
export function EducationEditor({value,onChange,primary,onPrimary,disabled,legacy,resolvedLegacyId,onResolveLegacy,onEditing}:Props){
  const [draft,setDraft]=useState<EducationDraft|null>(null),[fromLegacy,setFromLegacy]=useState(false),[error,setError]=useState('')
  function start(row?:EducationDraft,old?:LegacyEducation){setDraft(row?{...row,institution:{...row.institution},course:{...row.course}}:educationDraft(undefined,old));setFromLegacy(Boolean(old));setError('');onEditing?.(true)}
  function close(){setDraft(null);setError('');setFromLegacy(false);onEditing?.(false)}
  function confirm(){
    if(!draft)return
    if(!(draft.institution.id||draft.institution.name.trim())||!(draft.course.id||draft.course.name.trim())){setError('Informe instituição e curso para confirmar a formação.');return}
    if(draft.current===null&&draft.origin!=='legacy'){setError('Confirme se está cursando atualmente ou se não está cursando.');return}
    const invalid=educationValidation(draft);if(invalid){setError(invalid);return}
    const duplicate=value.some(row=>row.id!==draft.id&&sameEducation(row,draft))
    if(duplicate&&!draft.duplicateAck){setError('Já existe uma formação com este par. Confirme se representa outro episódio.');return}
    onChange(value.some(row=>row.id===draft.id)?value.map(row=>row.id===draft.id?draft:row):[...value,draft])
    if(fromLegacy)onResolveLegacy?.(draft.id)
    close()
  }
  const duplicate=draft&&value.some(row=>row.id!==draft.id&&sameEducation(row,draft))
  return <section className="min-w-0 space-y-3" aria-label="Formação acadêmica">
    <div><h2 className="font-semibold">Formação acadêmica</h2><p className="text-sm text-muted-foreground">Adicione seus cursos atuais ou anteriores. O preenchimento é opcional.</p></div>
    {legacy&&!value.some(row=>row.id===resolvedLegacyId)&&<div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"><p>Há uma informação acadêmica anterior incompleta, preservada para você completar se desejar.</p><Button type="button" size="sm" variant="outline" disabled={disabled||Boolean(draft)} onClick={()=>start(undefined,legacy)}>Completar formação anterior</Button></div>}
    {value.length>1&&<div className="space-y-1"><label className="block text-sm">Formação principal nos resumos<select aria-label="Formação principal nos resumos" disabled={disabled} value={primary??''} onChange={e=>onPrimary(e.target.value||null)} className="mt-1 min-h-10 w-full rounded-xl border bg-background p-2 text-foreground"><option value="">Não destacar uma formação</option>{value.map(row=><option key={row.id} value={row.id}>{row.course.name} · {row.institution.name}</option>)}</select></label><p className="text-xs text-muted-foreground">Todas aparecem no perfil. A escolha afeta apenas os resumos antigos.</p></div>}
    {!value.length&&!draft&&<p className="text-sm text-muted-foreground">Nenhuma formação cadastrada.</p>}
    <ul className="grid min-w-0 gap-3">{value.map((row,index)=><li key={row.id} className="min-w-0 space-y-2 rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words font-semibold">{row.course.name}</p><p className="break-words text-sm text-muted-foreground">{row.institution.name}</p></div><div className="flex shrink-0 gap-1"><Button type="button" size="icon" variant="ghost" aria-label={'Editar formação '+(index+1)} disabled={disabled||Boolean(draft)} onClick={()=>start(row)}><Pencil className="size-4" aria-hidden/></Button><Button type="button" size="icon" variant="ghost" aria-label={'Remover formação '+(index+1)} disabled={disabled||Boolean(draft)} onClick={()=>{onChange(value.filter(v=>v.id!==row.id));if(primary===row.id)onPrimary(null);if(resolvedLegacyId===row.id)onResolveLegacy?.(null)}}><X className="size-4" aria-hidden/></Button></div></div>
      <CurrentStudy value={row.current} disabled={disabled||Boolean(draft)} onChange={current=>start(changeCurrentEducation(row,current))}/>
      <p className="text-xs text-muted-foreground">{educationStatus(row.current,row.ending)}{row.institution.id&&row.course.id?' · Instituição e curso padronizados':''}</p>
    </li>)}</ul>
    {draft&&<div role="group" aria-label="Dados da formação" className="min-w-0 space-y-4 rounded-2xl border border-primary/30 bg-muted/15 p-4">
      <InstitutionPicker label="Faculdade ou universidade" value={draft.institution} onChange={institution=>setDraft({...draft,institution})}/>
      <CoursePicker label="Curso" value={draft.course} onChange={course=>setDraft({...draft,course})}/>
      <label className="block space-y-1 text-sm">Data de início<Input placeholder="MM/AAAA" inputMode="numeric" maxLength={7} value={draft.start} onChange={e=>setDraft({...draft,start:e.target.value})}/></label>
      <CurrentStudy value={draft.current} disabled={disabled} onChange={current=>setDraft(changeCurrentEducation(draft,current))}/>
      {draft.current===true?<label className="block space-y-1 text-sm">Previsão de conclusão<Input placeholder="MM/AAAA" inputMode="numeric" maxLength={7} value={draft.forecast} onChange={e=>setDraft({...draft,forecast:e.target.value})}/></label>:draft.current===false?<>
       <label className="block space-y-1 text-sm">{draft.ending==='concluido'?'Data de conclusão':'Data de término/interrupção'}<Input placeholder="MM/AAAA" inputMode="numeric" maxLength={7} value={draft.end} onChange={e=>setDraft({...draft,end:e.target.value})}/></label>
       <label className="block space-y-1 text-sm">Situação acadêmica<select className="min-h-10 w-full rounded-xl border bg-background p-2 text-foreground" value={draft.ending} onChange={e=>setDraft({...draft,ending:e.target.value as EducationDraft['ending']})}><option value="">{draft.requireEnding?'Selecione a situação':'Situação não informada'}</option><option value="concluido">Concluído</option><option value="interrompido">Interrompido ou trancado</option></select></label>
      </>:null}
      <p className="text-xs text-muted-foreground">Datas opcionais em MM/AAAA. Previsão e término efetivo são informações separadas.</p>
      {duplicate&&<label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.duplicateAck===true} onChange={e=>setDraft({...draft,duplicateAck:e.target.checked})}/>É outro episódio de formação na mesma instituição e curso.</label>}
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={disabled} onClick={confirm}>Confirmar formação</Button><Button type="button" variant="outline" disabled={disabled} onClick={close}>Cancelar formação</Button></div>
    </div>}
    {!draft&&<Button type="button" variant="outline" disabled={disabled||value.length>=20} onClick={()=>start()}><Plus className="size-4" aria-hidden/>Adicionar formação</Button>}
  </section>
}
