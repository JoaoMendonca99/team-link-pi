'use client'
import {useRef,useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Textarea} from '@/components/ui/textarea'
import {UserAvatar} from '@/components/team-link/user-avatar'
import {isoDateTime,localDateTime,priorities,type Task,type Workspace} from '@/lib/activities'

const selectClass='block w-full rounded-xl border border-border bg-background p-2 text-foreground'
export function ActivityForm({data,task,busy,save,cancel,onDirty}:{data:Workspace;task?:Task;busy:boolean;save:(input:Record<string,unknown>)=>Promise<void>;cancel?:()=>void;onDirty?:(dirty:boolean)=>void}){
 const [draft,setDraft]=useState(()=>({id:task?.id,version:task?.version,title:task?.title??'',description:task?.description??'',stage_id:task?.stage_id??data.stages.find(s=>s.kind==='todo')?.id??'',assignees:task?.assignees??[],due_at:localDateTime(task?.due_at??null),priority:task?.priority??'medium',goal_id:task?.goal_id??'',reviewer_id:task?.reviewer_id??'',requires_review:task?.requires_review??false}))
 const [error,setError]=useState(''),saving=useRef(false)
 function change(patch:Partial<typeof draft>){setDraft(value=>({...value,...patch}));onDirty?.(true)}
 return <form className="space-y-4" onSubmit={async event=>{event.preventDefault();if(saving.current||busy)return;saving.current=true;setError('');try{await save({...draft,due_at:isoDateTime(draft.due_at)});onDirty?.(false)}catch(err){setError(err instanceof Error?err.message:'Não foi possível salvar.')}finally{saving.current=false}}}>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <label className="block space-y-1 text-sm">Título<Input required maxLength={160} value={draft.title} onChange={e=>change({title:e.target.value})}/></label>
  <label className="block space-y-1 text-sm">Descrição<Textarea maxLength={8000} value={draft.description} onChange={e=>change({description:e.target.value})}/></label>
  <div className="grid gap-3 sm:grid-cols-2">
   <label className="block space-y-1 text-sm">Status<select className={selectClass} value={draft.stage_id} disabled={Boolean(task)} onChange={e=>change({stage_id:e.target.value})}>{data.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label className="block space-y-1 text-sm">Prioridade<select className={selectClass} value={draft.priority} onChange={e=>change({priority:e.target.value as Task['priority']})}>{Object.entries(priorities).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
   <label className="block space-y-1 text-sm">Prazo<Input type="datetime-local" value={draft.due_at} onChange={e=>change({due_at:e.target.value})}/></label>
   <label className="block space-y-1 text-sm">Meta vinculada<select className={selectClass} value={draft.goal_id} onChange={e=>change({goal_id:e.target.value})}><option value="">Sem meta</option>{data.goals.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
  </div>
  <fieldset className="max-h-40 space-y-2 overflow-y-auto rounded-xl border p-3"><legend className="px-1 text-sm">Responsáveis</legend>{data.members.map(person=><label key={person.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.assignees.includes(person.id)} onChange={e=>change({assignees:e.target.checked?[...draft.assignees,person.id]:draft.assignees.filter(id=>id!==person.id)})}/><UserAvatar name={person.name||'Integrante'} imageUrl={person.avatar??undefined} sizeClassName="size-6"/>{person.name||'Integrante'}</label>)}</fieldset>
  <label className="block space-y-1 text-sm">Revisor responsável<select className={selectClass} value={draft.reviewer_id} onChange={e=>change({reviewer_id:e.target.value})}><option value="">Administradores do projeto</option>{data.members.filter(p=>['owner','manager','reviewer'].includes(p.level)).map(p=><option key={p.id} value={p.id}>{p.name||'Integrante'}</option>)}</select></label>
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.requires_review} onChange={e=>change({requires_review:e.target.checked})}/>Exigir revisão antes da conclusão</label>
  <div className="flex flex-wrap gap-2"><Button disabled={busy||data.readOnly||!draft.stage_id}>Salvar atividade</Button>{cancel&&<Button type="button" variant="outline" disabled={busy} onClick={cancel}>Cancelar edição</Button>}</div>
 </form>
}
