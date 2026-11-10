'use client'
import Link from 'next/link'
import {useCallback,useEffect,useRef,useState} from 'react'
import {X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Textarea} from '@/components/ui/textarea'
import {UserAvatar} from '@/components/team-link/user-avatar'
import {getSupabaseClient} from '@/lib/supabase/client'
import {lockDialogScroll} from '@/lib/dialog-scroll-lock'
import {activityDate,activityRpc,historyLabels,overdue,priorities} from '@/lib/activities'
import {activityUuid,contextualStage,type ActivityContext} from '@/lib/activity-details'
import {ActivityForm} from './activity-form'
import {ActivityComposer} from './activity-attachments'
import {ActivityDiscussionFeed} from './activity-discussion-feed'

type Props={taskId:string;projectId?:string;slug?:string;userId:string;close:()=>void;onChanged:()=>void;historicalEdit?:boolean;requestTransfer?:()=>void}
export function ActivityDetailsDialog({taskId,projectId,slug,userId,close,onChanged,historicalEdit=false,requestTransfer}:Props){
 const dialog=useRef<HTMLDialogElement>(null),messages=useRef<HTMLDivElement>(null),nearBottom=useRef(true),forceBottom=useRef(true),initial=useRef(true),operation=useRef(false),request=useRef(0)
 const [data,setData]=useState<ActivityContext>(),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 const [tab,setTab]=useState<'details'|'discussion'>('details'),[editing,setEditing]=useState(false),[editDirty,setEditDirty]=useState(false),[historical,setHistorical]=useState(historicalEdit)
 const [draftDirty,setDraftDirty]=useState(false),[reply,setReply]=useState<{id:string;body:string}>(),[check,setCheck]=useState(''),[reason,setReason]=useState(''),[deleting,setDeleting]=useState(false),[discard,setDiscard]=useState<'close'|'edit'|'transfer'|null>(null),[newMessages,setNewMessages]=useState(false)
 const [editingItem,setEditingItem]=useState<{id:string;label:string;version:number}|null>(null)
 const dirty=Boolean(draftDirty||reason.trim()||check.trim()||editDirty||editingItem)
 const load=useCallback(async()=>{
  const version=++request.current
  try{
   if(!activityUuid(taskId)||(projectId&&!activityUuid(projectId)))throw Error('Atividade indisponível.')
   const next=await activityRpc<ActivityContext>('get_activity_dialog',{p_task:taskId,p_project:projectId??null,p_slug:slug??null})
   if(request.current!==version)return
   setData(next);setLoadError('')
  }catch(err){if(request.current===version){setData(undefined);setLoadError(err instanceof Error?err.message:'Não foi possível carregar a atividade.')}}
  finally{if(request.current===version)setLoading(false)}
 },[taskId,projectId,slug])
 const invalidate=useCallback(()=>{request.current++},[])
 useEffect(()=>{void load();return invalidate},[load,invalidate])
 const actualProject=data?.project.id
 useEffect(()=>{
  if(!actualProject)return
  let timer:number|undefined
  const refresh=()=>{if(!document.hidden){window.clearTimeout(timer);timer=window.setTimeout(()=>void load(),200)}}
  const client=getSupabaseClient(),channel=client.channel('activity-dialog:'+taskId+':'+crypto.randomUUID())
  channel.on('postgres_changes',{event:'*',schema:'public',table:'activity_updates',filter:'project_id=eq.'+actualProject},refresh).subscribe()
  const fallback=window.setInterval(refresh,60_000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh)
  return()=>{window.clearTimeout(timer);window.clearInterval(fallback);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);void client.removeChannel(channel)}
 },[load,actualProject,taskId])
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null,element=dialog.current;element?.showModal();const unlock=lockDialogScroll();return()=>{element?.close();unlock();if(previous?.isConnected)previous.focus({preventScroll:true})}},[])
 useEffect(()=>{if(!dirty)return;const protect=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect)},[dirty])
 const latest=(data?.details.comments.at(-1)?.id??'')+':'+(data?.details.history.at(-1)?.id??'')
 useEffect(()=>{if(!latest)return;const element=messages.current;if(!element||!element.clientHeight)return;if(initial.current||forceBottom.current||nearBottom.current){element.scrollTop=element.scrollHeight;initial.current=false;forceBottom.current=false;setNewMessages(false)}else setNewMessages(true)},[latest,tab])
 const task=data?.tasks[0],stage=task&&data?.stages.find(s=>s.id===task.stage_id),period=data?.periods[0]
 const writable=Boolean(data&&!data.projectReadOnly&&(!data.readOnly||data.manager&&historical)),canMove=writable&&data?.permissions.move,canReview=writable&&data?.permissions.review,canCheck=writable&&data?.permissions.check,canPlan=writable&&data?.manager
 function attemptClose(){if(operation.current)return;if(dirty)setDiscard('close');else close()}
 async function perform(action:string,input:Record<string,unknown>,after?:()=>void){
  if(!data||!task||operation.current)return
  operation.current=true;setBusy(true);setError('')
  try{await activityRpc<string>('mutate_activity',{p_project:data.project.id,p_action:action,p_data:{...input,period_id:task.period_id,historical_edit:historical}});after?.();await load();onChanged()}
  catch(err){setError(err instanceof Error?err.message:'Não foi possível concluir.');await load();throw err}
  finally{operation.current=false;setBusy(false)}
 }
 const run=(action:string,input:Record<string,unknown>,after?:()=>void)=>{void perform(action,input,after).catch(()=>{})}
 const input=task?{id:task.id,version:task.version}:{}
 const next=task&&contextualStage(task,stage?.kind),nextStages=next?data?.stages.filter(s=>s.kind===next.kind)??[]:[]
 const checklist=data?.checklist??[]
 function participant(id:string){const person=data?.members.find(p=>p.id===id);return <div key={id} className="flex min-w-0 items-center gap-2"><UserAvatar name={person?.name||'Integrante indisponível'} imageUrl={person?.avatar??undefined} sizeClassName="size-8"/><span className="min-w-0 break-words text-sm">{person?.name||'Integrante indisponível'}</span></div>}
 return <dialog ref={dialog} aria-label={task?.title||'Carregando atividade'} onCancel={event=>{event.preventDefault();attemptClose()}} className="fixed inset-0 m-auto h-[92dvh] max-h-[960px] w-[calc(100%_-_1rem)] max-w-6xl overflow-hidden rounded-2xl border border-card-outline bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/70">
  <div className="flex h-full min-h-0 min-w-0 flex-col">
   <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border p-4 sm:px-6"><div className="min-w-0 space-y-1"><h2 className="break-words text-lg font-semibold sm:text-xl">{task?.title||'Atividade'}</h2>{data&&task&&<><p className="break-words text-xs text-muted-foreground">{data.project.title} · {period?.name||'Período não informado'}</p><p className={'text-xs '+(overdue(task.due_at,stage?.kind==='done')?'text-destructive':'text-muted-foreground')}>{stage?.name} · Prioridade {priorities[task.priority].toLocaleLowerCase('pt-BR')} · {activityDate(task.due_at)}</p></>}</div><Button type="button" variant="ghost" size="icon" disabled={busy} aria-label="Fechar atividade" onClick={attemptClose}><X aria-hidden/></Button></header>
   {discard&&<div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted p-3 text-sm"><p>Há texto ou alterações não salvas. Deseja descartá-los?</p><Button size="sm" onClick={()=>{if(discard==='close')close();else if(discard==='transfer')requestTransfer?.();else{setEditing(false);setEditDirty(false);setDiscard(null)}}}>Descartar alterações</Button><Button size="sm" variant="outline" onClick={()=>setDiscard(null)}>Continuar trabalhando</Button></div>}
   {error&&<p role="alert" className="shrink-0 border-b p-3 text-sm text-destructive">{error}</p>}
   {loading?<p role="status" className="p-6">Carregando atividade e mensagens…</p>:loadError?<div role="alert" className="space-y-3 p-6"><p>{loadError}</p><Button variant="outline" onClick={()=>void load()}>Tentar novamente</Button></div>:data&&task&&<>
    <div role="tablist" aria-label="Áreas da atividade" className="grid shrink-0 grid-cols-2 border-b lg:hidden" onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const target=event.key==='Home'?'details':event.key==='End'?'discussion':tab==='details'?'discussion':'details';setTab(target);dialog.current?.querySelector<HTMLButtonElement>('#activity-tab-'+target)?.focus()}}}>{(['details','discussion'] as const).map(name=><button key={name} type="button" role="tab" id={'activity-tab-'+name} aria-controls={'activity-pane-'+name} aria-selected={tab===name} tabIndex={tab===name?0:-1} className={'min-h-11 px-4 text-sm font-medium '+(tab===name?'border-b-2 border-primary text-primary':'text-muted-foreground')} onClick={()=>setTab(name)}>{name==='details'?'Detalhes':'Discussão'}</button>)}</div>
    <div className="grid min-h-0 min-w-0 flex-1 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
     <section id="activity-pane-discussion" aria-label="Discussão da atividade" className={(tab==='discussion'?'flex':'hidden')+' min-h-0 min-w-0 flex-col lg:flex lg:border-r lg:border-border'}>
      <h3 className="hidden shrink-0 border-b px-4 py-3 font-semibold lg:block">Discussão</h3>
      <div ref={messages} onScroll={event=>{const e=event.currentTarget;nearBottom.current=e.scrollHeight-e.scrollTop-e.clientHeight<70;if(nearBottom.current)setNewMessages(false)}} role="log" aria-label="Mensagens da atividade" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
       <ActivityDiscussionFeed details={data.details} userId={userId} canReply={writable&&data.permissions.comment} onReply={entry=>setReply({id:entry.id,body:entry.body})}/>
      </div>
      {newMessages&&<Button variant="ghost" size="sm" onClick={()=>{if(messages.current)messages.current.scrollTop=messages.current.scrollHeight;setNewMessages(false)}}>Ver mensagens recentes</Button>}
      {writable&&data.permissions.comment?<ActivityComposer taskId={task.id} replyTo={reply} historical={historical} onDirty={setDraftDirty} cancelReply={()=>setReply(undefined)} onSent={async()=>{forceBottom.current=true;await load();onChanged()}}/>:<p className="shrink-0 border-t p-3 text-xs text-muted-foreground">Discussão disponível para consulta. Você não pode enviar mensagens nesta atividade.</p>}
     </section>
     <section id="activity-pane-details" aria-label="Detalhes da atividade" className={(tab==='details'?'block':'hidden')+' min-h-0 min-w-0 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:block'}>
      {data.readOnly&&<div className="rounded-xl border p-3 text-sm"><p>{data.projectReadOnly?'Projeto finalizado':'Período histórico'} · {writable?'Edição habilitada':'Somente consulta'}</p>{data.manager&&!data.projectReadOnly&&<label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={historical} disabled={busy} onChange={e=>setHistorical(e.target.checked)}/>Habilitar edição do histórico</label>}</div>}
      {editing?<ActivityForm data={{...data,readOnly:!writable}} task={task} busy={busy} onDirty={setEditDirty} cancel={()=>{if(editDirty)setDiscard('edit');else setEditing(false)}} save={async values=>{await perform('save_task',values,()=>{setEditing(false);setEditDirty(false)})}}/>:<>
       <section className="space-y-2"><h3 className="font-semibold">Descrição</h3><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{task.description||'Sem descrição.'}</p></section>
       <section className="space-y-2"><h3 className="font-semibold">Responsáveis pela execução</h3><div className="grid gap-2 sm:grid-cols-2">{task.assignees.map(participant)}</div>{!task.assignees.length&&<p className="text-sm text-muted-foreground">Nenhum responsável designado.</p>}</section>
       {data.assigned_by&&<section className="space-y-2"><h3 className="text-sm font-semibold">Designada por</h3><div className="flex items-center gap-2"><UserAvatar name={data.assigned_by.name||'Usuário indisponível'} imageUrl={data.assigned_by.avatar??undefined} sizeClassName="size-7"/><span className="break-words text-sm">{data.assigned_by.name||'Usuário indisponível'}</span></div></section>}
       <section className="space-y-2"><h3 className="text-sm font-semibold">Revisor</h3>{task.reviewer_id?participant(task.reviewer_id):<p className="text-sm text-muted-foreground">Administradores do projeto</p>}{task.requires_review&&<p className="text-xs text-muted-foreground">Revisão obrigatória antes da conclusão.</p>}</section>
       <section className="space-y-3 rounded-xl border p-3"><h3 className="font-semibold">Etapa atual · {stage?.name}</h3><div className="flex flex-wrap gap-2">
        {canMove&&next&&nextStages.map((s,index)=><Button key={s.id} variant={index===0?'default':'outline'} disabled={busy} onClick={()=>run('move',{...input,stage_id:s.id})}>{next.label}{nextStages.length>1?' · '+s.name:''}</Button>)}
        {stage?.kind==='review'&&!canReview&&<p className="text-sm text-muted-foreground">Aguardando a revisão da entrega.</p>}{stage?.kind==='done'&&<p className="text-sm text-muted-foreground">Atividade concluída.</p>}
       </div>{canReview&&stage?.kind==='review'&&<div className="space-y-2"><Textarea aria-label="Justificativa da devolução" placeholder="Justificativa para devolver para ajustes" maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>run('approve',input)}>Aprovar entrega</Button><Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>run('return',{...input,reason},()=>setReason(''))}>Devolver para ajustes</Button></div></div>}
        {canMove&&stage?.kind!=='done'&&<details className="text-sm"><summary className="cursor-pointer text-muted-foreground">{data.manager?'Movimentação administrativa':'Outras etapas permitidas'}</summary><div className="mt-2 flex flex-wrap gap-2">{data.stages.filter(s=>s.id!==task.stage_id&&(!task.requires_review||s.kind!=='done')).map(s=><Button key={s.id} variant="outline" size="sm" disabled={busy} onClick={()=>run('move',{...input,stage_id:s.id})}>{s.name}</Button>)}</div></details>}
        {canPlan&&stage?.kind==='done'&&<details className="text-sm"><summary className="cursor-pointer">Movimentação administrativa</summary><div className="mt-2 flex flex-wrap gap-2">{data.stages.filter(s=>s.id!==task.stage_id).map(s=><Button key={s.id} variant="outline" size="sm" disabled={busy} onClick={()=>run('move',{...input,stage_id:s.id})}>{s.name}</Button>)}</div></details>}
       </section>
       <section className="space-y-2"><h3 className="font-semibold">Checklist</h3><p className="text-xs text-muted-foreground">{checklist.filter(c=>c.done).length} de {checklist.length} itens concluídos</p>{checklist.map(item=><div key={item.id} className="flex min-w-0 items-center gap-1"><label className="flex min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" checked={item.done} disabled={busy||!canCheck} onChange={e=>run('checklist',{...input,item_id:item.id,item_version:item.version,done:e.target.checked})}/><span className="break-words">{item.label}</span></label>{canPlan&&<><Button variant="ghost" size="sm" disabled={busy} aria-label={'Editar item '+item.label} onClick={()=>setEditingItem({id:item.id,label:item.label,version:item.version})}>Editar</Button><Button variant="ghost" size="icon" disabled={busy} aria-label={'Excluir item '+item.label} onClick={()=>run('delete_checklist',{...input,item_id:item.id,item_version:item.version})}><X aria-hidden className="size-4"/></Button></>}</div>)}
        {editingItem&&canPlan&&<form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();run('checklist',{...input,item_id:editingItem.id,item_version:editingItem.version,label:editingItem.label},()=>setEditingItem(null))}}><Input aria-label="Texto do item" maxLength={300} required value={editingItem.label} onChange={e=>setEditingItem({...editingItem,label:e.target.value})}/><Button size="sm" disabled={busy||!editingItem.label.trim()}>Salvar item</Button><Button type="button" size="sm" variant="ghost" onClick={()=>setEditingItem(null)}>Cancelar</Button></form>}
        {canPlan&&<form className="flex gap-2" onSubmit={event=>{event.preventDefault();run('checklist',{...input,label:check},()=>setCheck(''))}}><Input aria-label="Novo item de checklist" maxLength={300} value={check} onChange={e=>setCheck(e.target.value)}/><Button disabled={busy||!check.trim()}>Adicionar item</Button></form>}
       </section>
       {task.goal_id&&<section className="space-y-2"><h3 className="font-semibold">Meta vinculada</h3><p className="break-words text-sm">{data.goals.find(g=>g.id===task.goal_id)?.title||'Meta indisponível'}</p></section>}
       <details className="space-y-2 rounded-xl border p-3"><summary className="cursor-pointer font-semibold">Histórico de alterações</summary><ol className="mt-3 space-y-2">{data.details.history.filter(h=>h.action!=='comment').map(entry=><li key={entry.id} className="space-y-1 border-b pb-2 text-xs"><p className="font-medium">{historyLabels[entry.action]||'Atualização'} · {entry.name||'Usuário indisponível'}</p><time dateTime={entry.created_at} className="text-muted-foreground">{activityDate(entry.created_at)}</time>{entry.details.reason&&<p className="whitespace-pre-wrap break-words">{entry.details.reason}</p>}{entry.action.startsWith('transfer_')&&<p>Transferência entre períodos registrada.</p>}</li>)}</ol></details>
       {canPlan&&<section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Administração</h3><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={()=>setEditing(true)}>Editar atividade</Button>{requestTransfer?<Button variant="outline" disabled={busy} onClick={()=>{if(dirty)setDiscard('transfer');else requestTransfer()}}>Alterar período da atividade</Button>:<Button asChild variant="outline"><Link onClick={event=>{if(dirty){event.preventDefault();setError('Envie ou remova seu rascunho antes de gerenciar o período no projeto.')}}} href={'/projetos/'+encodeURIComponent(data.project.slug)+'/painel/atividades?periodo='+task.period_id+'&atividade='+task.id}>Gerenciar período no projeto</Link></Button>}<Button variant="ghost" disabled={busy} onClick={()=>setDeleting(true)}>Excluir atividade</Button></div>{deleting&&<div role="alert" className="space-y-2 rounded-xl border border-destructive p-3 text-sm"><p>Excluir a atividade, seus comentários e checklist? O registro da exclusão será preservado.</p><Button variant="destructive" disabled={busy} onClick={()=>run('delete_task',input,close)}>Confirmar exclusão</Button><Button variant="ghost" disabled={busy} onClick={()=>setDeleting(false)}>Cancelar</Button></div>}</section>}
      </>}
     </section>
    </div>
   </>}
  </div>
 </dialog>
}
