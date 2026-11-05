'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { taskKind, kinds, type Period, type Workspace } from '@/lib/activities'
import { Dialog } from './workspace-editors'

type Mutation = (action: string, input: Record<string, unknown>) => Promise<string>
const selectClass='block w-full rounded-xl border border-border bg-background p-2 text-foreground'

export function PeriodManager({data,busy,mutate,close}:{data:Workspace;busy:boolean;mutate:Mutation;close:()=>void}) {
  const [editing,setEditing]=useState<Period|null>()
  const [draft,setDraft]=useState({name:'',description:'',starts_on:'',ends_on:'',activate:true})
  const [error,setError]=useState('')
  async function perform(action:string,input:Record<string,unknown>){
    setError('')
    try{await mutate(action,input);setEditing(undefined)}catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o período.')}
  }
  function edit(period:Period|null){
    setEditing(period)
    setDraft({name:period?.name??'',description:period?.description??'',starts_on:period?.starts_on??'',ends_on:period?.ends_on??'',activate:!period})
  }
  return <Dialog title="Gerenciar períodos" busy={busy} close={close}>
    <p className="text-sm text-muted-foreground">Cada período mantém suas próprias atividades, metas e progresso. Ativar um período não transfere nem copia registros.</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <ul className="space-y-2">{data.periods.map(p=><li key={p.id} className="space-y-2 rounded-xl border border-border p-3">
      <p className="break-words font-semibold">{p.name} · {p.is_active?'Ativo':'Histórico'}</p>
      {p.description&&<p className="whitespace-pre-wrap break-words text-sm">{p.description}</p>}
      <p className="text-xs text-muted-foreground">{p.starts_on??'Sem início'} → {p.ends_on??'Sem término'} · {p.task_count} atividades · {p.goal_count} metas</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={()=>edit(p)}>Editar</Button>
        {!p.is_active&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>void perform('activate_period',{id:p.id,version:p.version})}>Definir como ativo</Button>}</div>
    </li>)}</ul>
    <Button disabled={busy} onClick={()=>edit(null)}>Novo período</Button>
    {editing!==undefined&&<form className="space-y-3 rounded-xl border border-border p-3" onSubmit={e=>{e.preventDefault();void perform('save_period',{...draft,id:editing?.id,version:editing?.version})}}>
      <label className="block space-y-1 text-sm">Nome do período<Input required maxLength={160} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} /></label>
      <label className="block space-y-1 text-sm">Descrição do período<Textarea maxLength={4000} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})} /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Data de início<Input type="date" value={draft.starts_on} onChange={e=>setDraft({...draft,starts_on:e.target.value})} /></label>
        <label className="block text-sm">Data de término<Input type="date" min={draft.starts_on||undefined} value={draft.ends_on} onChange={e=>setDraft({...draft,ends_on:e.target.value})} /></label></div>
      {!editing?.is_active&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.activate} onChange={e=>setDraft({...draft,activate:e.target.checked})} />Definir como período ativo</label>}
      <div className="flex gap-2"><Button disabled={busy}>Salvar período</Button><Button type="button" variant="ghost" onClick={()=>setEditing(undefined)}>Cancelar</Button></div>
    </form>}
  </Dialog>
}

export function PeriodTransfer({data,source,initial,busy,mutate,close,completed}:{data:Workspace;source:string;initial:{task?:string;goal?:string};busy:boolean;mutate:Mutation;close:()=>void;completed:()=>void}) {
  const [search,setSearch]=useState('')
  const [status,setStatus]=useState('all')
  const [selected,setSelected]=useState<string[]>(initial.task?[initial.task]:[])
  const [destination,setDestination]=useState('')
  const [goal,setGoal]=useState('')
  const [mode,setMode]=useState('with_tasks')
  const [confirmed,setConfirmed]=useState(false)
  const [error,setError]=useState('')
  const movingGoal=data.goals.find(g=>g.id===initial.goal)
  const sourceId=movingGoal?.period_id??data.tasks.find(t=>t.id===initial.task)?.period_id??source
  const list=data.tasks.filter(t=>t.period_id===sourceId&&(!initial.task||t.id===initial.task)&&t.title.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR'))&&(status==='all'||taskKind(t,data.stages)===status))
  const chosen=data.tasks.filter(t=>selected.includes(t.id)&&t.period_id===sourceId)
  const linked=movingGoal?data.tasks.filter(t=>t.goal_id===movingGoal.id).length:chosen.filter(t=>t.goal_id).length
  const selectionVersion=JSON.stringify({tasks:chosen.map(t=>[t.id,t.version]),goal:movingGoal&&[movingGoal.id,movingGoal.version],linked})
  useEffect(()=>{setConfirmed(false)},[selectionVersion])
  async function submit(){
    setError('')
    try{
      if(movingGoal)await mutate('transfer_goal',{id:movingGoal.id,version:movingGoal.version,period_id:destination,mode,linked_count:linked,confirmed})
      else await mutate('transfer_tasks',{tasks:chosen.map(t=>({id:t.id,version:t.version})),period_id:destination,goal_id:goal,linked_count:linked,confirmed})
      completed()
    }catch(e){setConfirmed(false);setError(e instanceof Error?e.message:'Não foi possível transferir os registros.')}
  }
  return <Dialog title={movingGoal?'Alterar período da meta':'Organizar atividades por período'} busy={busy} close={close}>
    <p className="text-sm">Origem: {data.periods.find(p=>p.id===sourceId)?.name}. Status, responsáveis, comentários e checklists serão preservados.</p>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {!movingGoal&&<>
      {!initial.task&&<div className="grid gap-2 sm:grid-cols-2"><Input aria-label="Filtrar atividades para transferência" placeholder="Buscar atividade" value={search} onChange={e=>setSearch(e.target.value)} />
        <select aria-label="Status para transferência" className={selectClass} value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos os estados</option>{Object.entries(kinds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div>}
      {!initial.task&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={list.length>0&&list.every(t=>selected.includes(t.id))} onChange={e=>{setSelected(e.target.checked?[...new Set([...selected,...list.map(t=>t.id)])]:selected.filter(id=>!list.some(t=>t.id===id)));setConfirmed(false)}} />Selecionar todas as {list.length} atividades filtradas</label>}
      <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-border p-3">{list.map(t=><label key={t.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={selected.includes(t.id)} onChange={e=>{setSelected(e.target.checked?[...selected,t.id]:selected.filter(id=>id!==t.id));setConfirmed(false)}} /><span className="min-w-0 break-words">{t.title} · {kinds[taskKind(t,data.stages)??'todo']}{t.goal_id?' · Meta vinculada':''}</span></label>)}{!list.length&&<p className="text-sm">Nenhuma atividade neste filtro.</p>}</div>
      <p className="text-sm">{chosen.length} atividades selecionadas, incluindo seleções fora do filtro atual.</p>
    </>}
    {movingGoal&&<p className="break-words font-semibold">{movingGoal.title}</p>}
    <label className="block space-y-1 text-sm">Período de destino<select className={selectClass} value={destination} onChange={e=>{setDestination(e.target.value);setGoal('');setConfirmed(false)}}><option value="">Escolha um período</option>{data.periods.filter(p=>p.id!==sourceId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {movingGoal?<label className="block space-y-1 text-sm">Atividades vinculadas<select className={selectClass} value={mode} onChange={e=>{setMode(e.target.value);setConfirmed(false)}}><option value="with_tasks">Mover a meta e suas {linked} atividades</option><option value="unlink">Mover somente a meta e remover {linked} vínculos</option></select></label>:<>
      <p className="text-sm text-muted-foreground">{linked} vínculos com metas do período original serão removidos. Escolha uma meta compatível de destino ou mantenha as atividades sem meta.</p>
      <label className="block space-y-1 text-sm">Meta no destino<select className={selectClass} value={goal} onChange={e=>{setGoal(e.target.value);setConfirmed(false)}}><option value="">Desvincular / sem meta</option>{data.goals.filter(g=>g.period_id===destination).map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
    </>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />Confirmo a transferência de {movingGoal?'1 meta'+(mode==='with_tasks'?' e '+linked+' atividades':' e a remoção de '+linked+' vínculos'):chosen.length+' atividades'} para o período escolhido, incluindo alterações no histórico.</label>
    <div className="flex flex-wrap gap-2"><Button disabled={busy||!destination||!confirmed||(!movingGoal&&!chosen.length)} onClick={()=>void submit()}>Confirmar transferência</Button><Button variant="ghost" disabled={busy} onClick={close}>Cancelar</Button></div>
  </Dialog>
}
