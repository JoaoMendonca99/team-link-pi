'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getSupabaseClient } from '@/lib/supabase/client'
import { paragraph, type RichNode } from '@/lib/reports/model'
import type { Workspace } from '@/lib/activities'
type Source={id:string;title:string;detail:string;period?:string}
export function ReportSources({slug,project,members,disabled,onInsert}:{slug:string;project:{id:string;title:string};members:{id:string;name:string}[];disabled:boolean;onInsert:(content:RichNode[],category:string,ids:string[])=>void}) {
 const [category,setCategory]=useState(''),[items,setItems]=useState<Source[]>([]),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[period,setPeriod]=useState(''),[periods,setPeriods]=useState<Workspace['periods']>([]),[format,setFormat]=useState('text'),[confirmed,setConfirmed]=useState(false)
 async function load(value:string){setCategory(value);setSelected([]);setItems([]);setError('');setBusy(true);setConfirmed(false)
  try{
   if(value==='members')setItems(members.map(m=>({id:m.id,title:m.name,detail:'Integrante do projeto'})))
   else if(value==='general'){
    const {data,error}=await getSupabaseClient().from('projects').select('title,description,short_description,category,status').eq('id',project.id).single();if(error)throw error
    setItems(Object.entries(data).filter(([,v])=>v).map(([id,v])=>({id,title:({title:'Nome do projeto',description:'Descrição',short_description:'Descrição curta',category:'Categoria',status:'Status'} as Record<string,string>)[id],detail:String(v)})))
   }else{
    const {data,error}=await getSupabaseClient().rpc('get_activity_workspace',{p_slug:slug});if(error)throw error;const w=data as Workspace;setPeriods(w.periods);setPeriod(w.periods.find(p=>p.is_active)?.id||w.periods[0]?.id||'')
    const people=(ids:string[])=>ids.map(id=>w.members.find(m=>m.id===id)?.name||'Integrante').join(', ')
    if(value==='tasks')setItems(w.tasks.map(t=>({id:t.id,title:t.title,period:t.period_id,detail:[t.description,'Etapa: '+(w.stages.find(s=>s.id===t.stage_id)?.name||''),'Responsáveis: '+people(t.assignees),'Prazo: '+(t.due_at?new Date(t.due_at).toLocaleString('pt-BR'):'Sem prazo')].filter(Boolean).join('\n')})))
    if(value==='goals')setItems(w.goals.map(g=>({id:g.id,title:g.title,period:g.period_id,detail:[g.description,'Responsáveis: '+people(g.owners),g.kind==='numeric'?`${g.actual} de ${g.target} ${g.unit}`:'Meta vinculada às atividades'].join('\n')})))
    if(value==='periods')setItems(w.periods.map(p=>({id:p.id,title:p.name,detail:[p.description,p.starts_on,p.ends_on].filter(Boolean).join('\n')})))
    if(value==='checklist')setItems(w.checklist.map(c=>({id:c.id,title:c.label,period:w.tasks.find(t=>t.id===c.task_id)?.period_id,detail:(c.done?'Concluído':'Pendente')+' — '+(w.tasks.find(t=>t.id===c.task_id)?.title||'')})))
   }
  }catch{setError('Esta fonte não está disponível ou você não tem permissão. O documento pode ser escrito manualmente.')}finally{setBusy(false)}
 }
 const visible=items.filter(item=>!item.period||item.period===period),chosen=visible.filter(item=>selected.includes(item.id))
 const preview=chosen.map(item=>item.title+'\n'+item.detail).join('\n\n')
 function insert(){if(!chosen.length||!confirmed)return;let content:RichNode[]
  if(format==='list')content=[{type:'bulletList',content:chosen.map(item=>({type:'listItem',content:[paragraph(item.title+': '+item.detail)]}))}]
  else if(format==='table'||format==='frame')content=[{type:'academicTable',attrs:{kind:format,title:'Informações selecionadas do projeto',source:'Dados do projeto consultados em '+new Date().toLocaleDateString('pt-BR')},content:[{type:'table',content:[['Registro','Informações'],...chosen.map(i=>[i.title,i.detail])].map((cells,i)=>({type:'tableRow',content:cells.map(text=>({type:i===0?'tableHeader':'tableCell',content:[paragraph(text)]}))}))}]}]
  else content=chosen.flatMap(item=>[paragraph(item.title),...item.detail.split('\n').map(paragraph)])
  onInsert(content,category,chosen.map(i=>i.id));setSelected([]);setConfirmed(false)
 }
 return <div className="space-y-3 text-sm"><h3 className="font-semibold">Adicionar informações do projeto</h3><p className="text-muted-foreground">Escolha registros, confira a prévia e confirme. Será inserida uma cópia dos valores atuais, sem atualização automática.</p><select aria-label="Categoria de dados" className="report-input" disabled={busy||disabled} value={category} onChange={e=>void load(e.target.value)}><option value="" disabled>Selecione uma fonte</option><option value="general">Informações gerais</option><option value="members">Integrantes</option><option value="tasks">Atividades e responsáveis</option><option value="goals">Metas</option><option value="periods">Períodos</option><option value="checklist">Checklists</option></select>{error&&<p role="alert">{error}</p>}{busy&&<p role="status">Carregando fonte…</p>}{['tasks','goals','checklist'].includes(category)&&periods.length>0&&<select aria-label="Período da fonte" className="report-input" value={period} onChange={e=>{setPeriod(e.target.value);setSelected([]);setConfirmed(false)}}>{periods.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}{visible.map(item=><label key={item.id} className="block rounded-lg border p-2"><input type="checkbox" disabled={disabled} checked={selected.includes(item.id)} onChange={e=>{setSelected(e.target.checked?[...selected,item.id]:selected.filter(id=>id!==item.id));setConfirmed(false)}}/> {item.title}</label>)}{category&&!busy&&!visible.length&&!error&&<p>Nenhum registro nesta fonte.</p>}{chosen.length>0&&<><label className="block">Forma de inserção<select className="report-input" value={format} onChange={e=>setFormat(e.target.value)}><option value="text">Texto estruturado</option><option value="list">Lista</option><option value="frame">Quadro</option><option value="table">Tabela</option></select></label><h4 className="font-medium">Prévia dos {chosen.length} registros selecionados</h4><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-xs">{preview}</pre><label className="block"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> Conferi os dados que serão inseridos</label><Button disabled={disabled||!confirmed} size="sm" onClick={insert}>Inserir no documento</Button></>}<p className="text-xs text-muted-foreground">Importação GitHub, cargos detalhados e atualização vinculada de retratos não estão disponíveis nesta versão. Os dados podem ser transcritos manualmente.</p></div>
}
