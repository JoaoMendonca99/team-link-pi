'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X, ArrowUp, ArrowDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { lockDialogScroll } from '@/lib/dialog-scroll-lock'
import { activityDate, activityRpc, goalProgress, historyLabels, isoDateTime, kinds, localDateTime, priorities, taskKind, type Details, type Goal, type Person, type Stage, type Task, type Workspace } from '@/lib/activities'

type Mutation = (action: string, input: Record<string, unknown>) => Promise<string>
export function Dialog({ title, busy, close, children }: { title: string; busy: boolean; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el=ref.current
    el?.showModal()
    const unlock=lockDialogScroll()
    return ()=>{el?.close();unlock()}
  }, [])
  return <dialog ref={ref} aria-label={title} onCancel={(event)=>{event.preventDefault();if(!busy)close()}}
    className="fixed inset-0 m-auto max-h-[88dvh] w-[calc(100%_-_1rem)] max-w-3xl overflow-hidden rounded-3xl border border-card-outline bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/70">
    <div className="flex max-h-[88dvh] min-w-0 flex-col"><header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4 sm:p-6"><h2 className="break-words text-xl font-semibold">{title}</h2>
      <Button type="button" size="icon" variant="ghost" disabled={busy} aria-label="Fechar" className="shrink-0" onClick={close}><X aria-hidden /></Button></header>
    <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>
    </div>
  </dialog>
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1 text-sm font-medium"><span>{label}</span>{children}</label>
}
const selectClass='block w-full rounded-xl border border-border bg-background p-2 text-foreground'
function PeoplePicker({ members, selected, change }: { members: Person[]; selected: string[]; change: (ids: string[]) => void }) {
  return <fieldset className="max-h-40 space-y-2 overflow-y-auto rounded-xl border border-border p-3"><legend className="px-1 text-sm font-medium">Responsáveis</legend>
    {members.map((person)=><label key={person.id} className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={selected.includes(person.id)} onChange={(event)=>change(event.target.checked?[...selected,person.id]:selected.filter((id)=>id!==person.id))} />
      <UserAvatar name={person.name||'Integrante'} imageUrl={person.avatar??undefined} sizeClassName="size-6" />{person.name||'Integrante'}
    </label>)}
  </fieldset>
}
function useDetails(project: string, task: string | undefined, goal: string | undefined, revision: number) {
  const [details,setDetails]=useState<Details>()
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!task&&!goal)return
    let active=true
    void activityRpc<Details>('get_activity_details',{p_project:project,p_task:task??null,p_goal:goal??null})
      .then((value)=>{if(active){setDetails(value);setError('')}}).catch(()=>{if(active)setError('Não foi possível carregar o histórico.')})
    return ()=>{active=false}
  },[project,task,goal,revision])
  return {details,error}
}
function History({ details, periods }: { details?: Details; periods: Workspace['periods'] }) {
  return <section className="space-y-2"><h3 className="font-semibold">Histórico</h3>
    {!details?<p role="status" className="text-sm">Carregando histórico…</p>:<ol className="space-y-2">{details.history.map((entry)=><li key={entry.id} className="rounded-xl border border-border p-2 text-xs">
      <p className="font-semibold">{historyLabels[entry.action]||'Atualização'} · {entry.name||'Usuário indisponível'}</p>
      <time dateTime={entry.created_at} className="text-muted-foreground">{activityDate(entry.created_at)}</time>
      {entry.action.startsWith('transfer_')&&entry.details.from&&<p>Origem: {periods.find(p=>p.id===entry.details.from)?.name||'Período indisponível'} · Destino: {periods.find(p=>p.id===entry.details.to)?.name||'Período indisponível'}{entry.details.mode==='unlink'?' · Vínculos removidos':''}</p>}
      {entry.details.reason&&<p className="mt-1 whitespace-pre-wrap break-words">{entry.details.reason}</p>}
    </li>)}</ol>}
  </section>
}

export function ActivityEditor({data,task,userId,revision,busy,mutate,close,requestTransfer}:{
 data:Workspace;task?:Task;userId:string;revision:number;busy:boolean;mutate:Mutation;close:()=>void;requestTransfer:()=>void
}) {
 const [editing,setEditing]=useState(!task)
 const writable=!data.readOnly
 const [draft,setDraft]=useState(()=>({
   id:task?.id,version:task?.version,title:task?.title??'',description:task?.description??'',
   stage_id:task?.stage_id??data.stages.find((stage)=>stage.kind==='todo')?.id??data.stages[0]?.id??'',
   assignees:task?.assignees??[],due_at:localDateTime(task?.due_at??null),priority:task?.priority??'medium',
   goal_id:task?.goal_id??'',reviewer_id:task?.reviewer_id??'',requires_review:task?.requires_review??false,
 }))
 const [error,setError]=useState('')
 const [comment,setComment]=useState('')
 const [check,setCheck]=useState('')
 const [reason,setReason]=useState('')
 const [confirmDelete,setConfirmDelete]=useState(false)
 const {details,error:detailError}=useDetails(data.project.id,task?.id,undefined,revision)
 const current=data.tasks.find((item)=>item.id===task?.id)
 const assigned=Boolean(current?.assignees.includes(userId))
 const ownLevel=data.members.find((person)=>person.id===userId)?.level
 const review=writable&&(data.manager||(current?.reviewer_id===userId&&ownLevel==='reviewer'))
 const canComment=writable&&(data.manager||assigned||ownLevel==='reviewer')
 const canCheck=writable&&(data.manager||assigned)
 async function perform(action:string,input:Record<string,unknown>,after?:()=>void){
   setError('')
   try{await mutate(action,input);after?.()}catch(err){setError(err instanceof Error?err.message:'Falha ao atualizar')}
 }
 return <Dialog title={task?'Detalhes da atividade':'Nova atividade'} busy={busy} close={close}>
   <p className="text-sm text-muted-foreground">Período: {data.periods.find(p=>p.id===data.selectedPeriod)?.name}{data.readOnly?' · Somente consulta':''}</p>
   {(error||detailError)&&<p role="alert" className="text-sm text-destructive">{error||detailError}</p>}
   {editing ? <form className="space-y-4" onSubmit={(event)=>{event.preventDefault();void perform('save_task',{...draft,due_at:isoDateTime(draft.due_at)},close)}}>
     <Field label="Título"><Input required maxLength={160} value={draft.title} onChange={(event)=>setDraft({...draft,title:event.target.value})} /></Field>
     <Field label="Descrição"><Textarea maxLength={8000} value={draft.description} onChange={(event)=>setDraft({...draft,description:event.target.value})} /></Field>
     <div className="grid gap-3 sm:grid-cols-2">
       <Field label="Status"><select className={selectClass} value={draft.stage_id} disabled={Boolean(task)} onChange={(event)=>setDraft({...draft,stage_id:event.target.value})}>{data.stages.map((stage)=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field>
       <Field label="Prioridade"><select className={selectClass} value={draft.priority} onChange={(event)=>setDraft({...draft,priority:event.target.value as Task['priority']})}>{Object.entries(priorities).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
       <Field label="Prazo"><Input type="datetime-local" value={draft.due_at} onChange={(event)=>setDraft({...draft,due_at:event.target.value})} /></Field>
       <Field label="Meta vinculada"><select className={selectClass} value={draft.goal_id} onChange={(event)=>setDraft({...draft,goal_id:event.target.value})}><option value="">Sem meta</option>{data.goals.map((goal)=><option key={goal.id} value={goal.id}>{goal.title}</option>)}</select></Field>
     </div>
     <PeoplePicker members={data.members} selected={draft.assignees} change={(assignees)=>setDraft({...draft,assignees})} />
     <Field label="Revisor responsável"><select className={selectClass} value={draft.reviewer_id} onChange={(event)=>setDraft({...draft,reviewer_id:event.target.value})}><option value="">Administradores do projeto</option>{data.members.filter((person)=>['owner','manager','reviewer'].includes(person.level)).map((person)=><option key={person.id} value={person.id}>{person.name||'Integrante'}</option>)}</select></Field>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.requires_review} onChange={(event)=>setDraft({...draft,requires_review:event.target.checked})} />Exigir revisão antes da conclusão</label>
     <Button disabled={busy||!writable||!draft.stage_id}>Salvar atividade</Button>
     {task&&writable&&<div className="space-y-2"><p className="text-xs text-muted-foreground">A transferência mantém os dados já salvos. Salve suas alterações antes de transferir.</p><Button type="button" variant="outline" disabled={busy} onClick={requestTransfer}>Alterar período da atividade</Button></div>}
   </form>:current&&<>
     <h3 className="break-words font-semibold">{current.title}</h3>
     <p className="whitespace-pre-wrap break-words text-sm">{current.description||'Sem descrição.'}</p>
     <p className="text-sm">{priorities[current.priority]} · {activityDate(current.due_at)}</p>
     <p className="text-sm">Responsáveis: {current.assignees.map((id)=>data.members.find((person)=>person.id===id)?.name||'Integrante indisponível').join(', ')||'Nenhum'}</p>
     <p className="text-sm">Revisor: {data.members.find((person)=>person.id===current.reviewer_id)?.name||'Administradores do projeto'}{current.requires_review?' · Revisão obrigatória':''}</p>
     {current.goal_id&&<p className="text-sm">Meta: {data.goals.find((goal)=>goal.id===current.goal_id)?.title}</p>}
     {writable&&(data.manager||assigned)&&<Field label="Alterar etapa"><select className={selectClass} disabled={busy} value={current.stage_id}
       onChange={(event)=>void perform('move',{id:current.id,version:current.version,stage_id:event.target.value})}>
       {data.stages.map((stage)=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field>}
     {review&&taskKind(current,data.stages)==='review'&&<section className="space-y-2 rounded-xl border border-primary/30 p-3">
       <h3 className="font-semibold">Revisar entrega</h3>
       <Textarea aria-label="Justificativa da devolução" maxLength={2000} value={reason} onChange={(event)=>setReason(event.target.value)} placeholder="Justificativa para devolver" />
       <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void perform('approve',{id:current.id,version:current.version})}>Aprovar entrega</Button>
         <Button disabled={busy||!reason.trim()} variant="outline" onClick={()=>void perform('return',{id:current.id,version:current.version,reason},()=>setReason(''))}>Devolver entrega</Button></div>
     </section>}
     {data.manager&&writable&&<div className="flex flex-wrap gap-2">
       <Button variant="outline" disabled={busy} onClick={()=>{setDraft({...current,due_at:localDateTime(current.due_at),goal_id:current.goal_id??'',reviewer_id:current.reviewer_id??''});setEditing(true)}}>Editar atividade</Button>
       <Button variant="outline" disabled={busy} onClick={requestTransfer}>Alterar período da atividade</Button>
       <Button variant="ghost" disabled={busy} onClick={()=>setConfirmDelete(true)}>Excluir atividade</Button>
     </div>}
     {confirmDelete&&<div className="space-y-2 rounded-xl border border-destructive p-3"><p className="text-sm">Excluir esta atividade e seus comentários e itens? O registro da exclusão permanecerá no histórico do projeto.</p>
       <Button variant="destructive" disabled={busy} onClick={()=>void perform('delete_task',{id:current.id,version:current.version},close)}>Confirmar exclusão</Button>
       <Button variant="ghost" onClick={()=>setConfirmDelete(false)}>Cancelar</Button></div>}
     <section className="space-y-2"><h3 className="font-semibold">Checklist</h3>
       {data.checklist.filter((item)=>item.task_id===current.id).map((item)=><div key={item.id} className="flex items-center gap-2 text-sm">
         <label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={item.done} disabled={busy||!canCheck}
           onChange={(event)=>void perform('checklist',{id:current.id,version:current.version,item_id:item.id,item_version:item.version,done:event.target.checked})} /><span className="break-words">{item.label}</span></label>
         {canCheck&&<Button size="icon" variant="ghost" aria-label={'Excluir item '+item.label} disabled={busy}
           onClick={()=>void perform('delete_checklist',{id:current.id,version:current.version,item_id:item.id,item_version:item.version})}><X aria-hidden /></Button>}
       </div>)}
       {canCheck&&<form className="flex gap-2" onSubmit={(event)=>{event.preventDefault();void perform('checklist',{id:current.id,version:current.version,label:check},()=>setCheck(''))}}>
         <Input aria-label="Novo item de checklist" maxLength={300} value={check} onChange={(event)=>setCheck(event.target.value)} /><Button disabled={busy||!check.trim()}>Adicionar item</Button>
       </form>}
     </section>
     <section className="space-y-3"><h3 className="font-semibold">Comentários</h3>
       {details?.comments.map((entry)=><article key={entry.id} className="space-y-1 rounded-xl border border-border p-3">
         {entry.author_id?<Link href={'/usuarios/'+entry.author_id} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
           <UserAvatar name={entry.name||'Usuário'} imageUrl={entry.avatar??undefined} sizeClassName="size-7" />{entry.name||'Usuário'}</Link>:<p className="text-sm">Usuário indisponível</p>}
         <p className="whitespace-pre-wrap break-words text-sm">{entry.body}</p><time className="text-xs text-muted-foreground" dateTime={entry.created_at}>{activityDate(entry.created_at)}</time>
       </article>)}
       {canComment&&<form className="space-y-2" onSubmit={(event)=>{event.preventDefault();void perform('comment',{id:current.id,body:comment},()=>setComment(''))}}>
         <Textarea aria-label="Comentário na atividade" maxLength={4000} value={comment} onChange={(event)=>setComment(event.target.value)} />
         <Button disabled={busy||!comment.trim()}>Comentar</Button>
       </form>}
     </section>

   </>}
 </Dialog>
}

export function GoalEditor({data,goal,revision,busy,mutate,close,openTask,requestTransfer}:{
 data:Workspace;goal?:Goal;revision:number;busy:boolean;mutate:Mutation;close:()=>void;openTask:(id:string)=>void;requestTransfer:()=>void
}) {
 const [editing,setEditing]=useState(!goal)
 const writable=!data.readOnly
 const [draft,setDraft]=useState(()=>({id:goal?.id,version:goal?.version,title:goal?.title??'',description:goal?.description??'',
   due_at:localDateTime(goal?.due_at??null),owners:goal?.owners??[],kind:goal?.kind??'tasks',target:String(goal?.target??1),actual:String(goal?.actual??0),unit:goal?.unit??''}))
 const [error,setError]=useState('')
 const [confirmDelete,setConfirmDelete]=useState(false)
 const current=data.goals.find((item)=>item.id===goal?.id)
 const progress=current?goalProgress(current,data.tasks,data.stages):null
 const {details,error:detailsError}=useDetails(data.project.id,undefined,goal?.id,revision)
 async function perform(action:string,input:Record<string,unknown>){
   setError('')
   try{await mutate(action,input);close()}catch(err){setError(err instanceof Error?err.message:'Falha ao salvar')}
 }
 return <Dialog title={goal?'Detalhes da meta':'Nova meta'} busy={busy} close={close}>
   <p className="text-sm text-muted-foreground">Período: {data.periods.find(p=>p.id===data.selectedPeriod)?.name}{data.readOnly?' · Somente consulta':''}</p>
   {(error||detailsError)&&<p role="alert" className="text-sm text-destructive">{error||detailsError}</p>}
   {editing?<form className="space-y-4" onSubmit={(event)=>{event.preventDefault();void perform('save_goal',{...draft,due_at:isoDateTime(draft.due_at),target:Number(draft.target),actual:Number(draft.actual)})}}>
     <Field label="Nome da meta"><Input required maxLength={160} value={draft.title} onChange={(event)=>setDraft({...draft,title:event.target.value})} /></Field>
     <Field label="Descrição"><Textarea maxLength={8000} value={draft.description} onChange={(event)=>setDraft({...draft,description:event.target.value})} /></Field>
     <Field label="Prazo"><Input type="datetime-local" value={draft.due_at} onChange={(event)=>setDraft({...draft,due_at:event.target.value})} /></Field>
     <PeoplePicker members={data.members} selected={draft.owners} change={(owners)=>setDraft({...draft,owners})} />
     <Field label="Tipo de medição"><select className={selectClass} value={draft.kind} onChange={(event)=>setDraft({...draft,kind:event.target.value as Goal['kind']})}>
       <option value="tasks">Baseada em atividades</option><option value="numeric">Numérica</option></select></Field>
     {draft.kind==='numeric'&&<div className="grid gap-3 sm:grid-cols-3">
       <Field label="Quantidade desejada"><Input type="number" required min="0.000001" step="any" value={draft.target} onChange={(event)=>setDraft({...draft,target:event.target.value})} /></Field>
       <Field label="Quantidade realizada"><Input type="number" required min={0} step="any" value={draft.actual} onChange={(event)=>setDraft({...draft,actual:event.target.value})} /></Field>
       <Field label="Unidade"><Input maxLength={80} value={draft.unit} onChange={(event)=>setDraft({...draft,unit:event.target.value})} /></Field>
     </div>}
     <Button disabled={busy||!writable}>Salvar meta</Button>
     {goal&&writable&&<div className="space-y-2"><p className="text-xs text-muted-foreground">A transferência mantém os dados já salvos. Salve suas alterações antes de transferir.</p><Button type="button" variant="outline" disabled={busy} onClick={requestTransfer}>Alterar período da meta</Button></div>}
   </form>:current&&progress&&<>
     <h3 className="break-words font-semibold">{current.title}</h3><p className="whitespace-pre-wrap break-words text-sm">{current.description||'Sem descrição.'}</p>
     <p className="text-sm">{activityDate(current.due_at)} · {progress.percent===100?'Concluída':'Em andamento'}</p>
     <p className="text-sm">{progress.percent}% · {progress.actual}/{progress.total} {current.kind==='numeric'?current.unit:'atividades'}</p>
     <progress max={100} value={progress.percent} aria-label="Progresso da meta" className="h-3 w-full accent-primary" />
     <p className="text-sm">Responsáveis: {current.owners.map((id)=>data.members.find((person)=>person.id===id)?.name||'Integrante indisponível').join(', ')||'Nenhum'}</p>
     {data.manager&&writable&&<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>{setDraft({...current,due_at:localDateTime(current.due_at),target:String(current.target),actual:String(current.actual)});setEditing(true)}}>Editar meta</Button>
       <Button variant="outline" disabled={busy} onClick={requestTransfer}>Alterar período da meta</Button>
       <Button variant="ghost" disabled={busy} onClick={()=>setConfirmDelete(true)}>Excluir meta</Button></div>}
     {confirmDelete&&<div className="space-y-2"><p className="text-sm">Excluir a meta? As atividades vinculadas serão preservadas.</p>
       <Button variant="destructive" disabled={busy} onClick={()=>void perform('delete_goal',{id:current.id,version:current.version})}>Confirmar exclusão</Button><Button variant="ghost" onClick={()=>setConfirmDelete(false)}>Cancelar</Button></div>}
     <section className="space-y-2"><h3 className="font-semibold">Atividades vinculadas</h3>{data.tasks.filter((item)=>item.goal_id===current.id).map((item)=>
       <button type="button" key={item.id} className="block w-full break-words rounded-xl border border-border p-2 text-left text-sm hover:bg-muted" onClick={()=>openTask(item.id)}>{item.title}</button>)}</section>
     <History details={details} periods={data.periods} />
   </>}
 </Dialog>
}

export function StageEditor({data,busy,mutate,close}:{data:Workspace;busy:boolean;mutate:Mutation;close:()=>void}) {
 const [editing,setEditing]=useState<Stage|null>()
 const [draft,setDraft]=useState({id:undefined as string|undefined,version:undefined as number|undefined,name:'',kind:'todo',position:0})
 const [removing,setRemoving]=useState<Stage>()
 const [destination,setDestination]=useState('')
 const [error,setError]=useState('')
 async function perform(action:string,input:Record<string,unknown>){
   setError('')
   try{await mutate(action,input);setEditing(undefined);setRemoving(undefined)}catch(err){setError(err instanceof Error?err.message:'Falha ao atualizar')}
 }
 function edit(stage:Stage|null){
   setEditing(stage);setRemoving(undefined)
   setDraft(stage?{...stage}:{id:undefined,version:undefined,name:'',kind:'todo',position:Math.max(-1,...data.stages.map((item)=>item.position))+1})
 }
 function reorder(index:number,offset:number){
   const stages=[...data.stages]
   const [moved]=stages.splice(index,1);stages.splice(index+offset,0,moved)
   void perform('reorder_stages',{stages:stages.map((stage)=>({id:stage.id,version:stage.version}))})
 }
 return <Dialog title="Gerenciar etapas" busy={busy} close={close}>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   <p className="text-sm text-muted-foreground">O estado de cada etapa determina os indicadores e as regras de revisão. Etapas com atividades precisam ser esvaziadas antes de alterar seu estado.</p>
   <ul className="space-y-2">{data.stages.map((stage,index)=><li key={stage.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-2">
     <span className="break-words text-sm">{stage.name} · {kinds[stage.kind]}</span>
     <div className="flex gap-1">
       <Button size="icon" variant="ghost" aria-label={'Mover '+stage.name+' para a esquerda'} disabled={busy||index===0} onClick={()=>reorder(index,-1)}><ArrowUp aria-hidden /></Button>
       <Button size="icon" variant="ghost" aria-label={'Mover '+stage.name+' para a direita'} disabled={busy||index===data.stages.length-1} onClick={()=>reorder(index,1)}><ArrowDown aria-hidden /></Button>
       <Button size="sm" variant="outline" disabled={busy} onClick={()=>edit(stage)}>Editar</Button>
       <Button size="sm" variant="ghost" disabled={busy} onClick={()=>{setRemoving(stage);setEditing(undefined);setDestination('')}}>Excluir</Button>
     </div>
   </li>)}</ul>
   <Button disabled={busy} onClick={()=>edit(null)}>Nova etapa</Button>
   {editing!==undefined&&<form className="space-y-3 rounded-xl border border-border p-3" onSubmit={(event)=>{event.preventDefault();void perform('save_stage',draft)}}>
     <Field label="Nome da etapa"><Input required maxLength={100} value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})} /></Field>
     <Field label="Estado semântico"><select className={selectClass} value={draft.kind} onChange={(event)=>setDraft({...draft,kind:event.target.value})}>{Object.entries(kinds).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></Field>
     <Button disabled={busy}>Salvar etapa</Button>
   </form>}
   {removing&&<div className="space-y-3 rounded-xl border border-destructive p-3">
     <p className="text-sm">Excluir {removing.name}? Escolha para onde mover suas atividades. Cada estado precisa manter pelo menos uma etapa.</p>
     <Field label="Etapa de destino"><select className={selectClass} value={destination} onChange={(event)=>setDestination(event.target.value)}><option value="">Sem destino</option>{data.stages.filter((stage)=>stage.id!==removing.id).map((stage)=><option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></Field>
     <Button variant="destructive" disabled={busy} onClick={()=>void perform('delete_stage',{id:removing.id,version:removing.version,target_id:destination})}>Confirmar exclusão</Button>
   </div>}
 </Dialog>
}
