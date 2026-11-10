'use client'
import {Button} from '@/components/ui/button'
import {UserAvatar} from '@/components/team-link/user-avatar'
import {activityDate,type Details} from '@/lib/activities'
import {ActivityAttachments} from './activity-attachments'
export function ActivityDiscussionFeed({details,userId,canReply,onReply}:{details:Details;userId:string;canReply:boolean;onReply:(comment:Details['comments'][number])=>void}){
 const events=details.history.filter(h=>['move','approve','return'].includes(h.action))
 const timeline=[...details.comments.map(item=>({type:'comment' as const,item})),...events.map(item=>({type:'event' as const,item}))].sort((a,b)=>Date.parse(a.item.created_at)-Date.parse(b.item.created_at)||String(a.item.id).localeCompare(String(b.item.id)))
 return <>{!timeline.length&&<p className="text-sm text-muted-foreground">Nenhuma mensagem. Use este espaço para conversar sobre a atividade.</p>}{timeline.map(entry=>{
  if(entry.type==='event'){
   const event=entry.item,previousReview=events.some(h=>h.created_at<event.created_at&&h.action==='move'&&h.details.to_kind==='review')
   const label=event.action==='approve'?'aprovou a atividade':event.action==='return'?'solicitou ajustes':event.details.to_kind==='review'?(previousReview?'reenviou a atividade para revisão':'enviou a atividade para revisão'):'alterou a etapa'+(event.details.to_label?' para '+event.details.to_label:'')
   return <article key={'event'+event.id} className="mx-2 rounded-lg border border-dashed p-3 text-xs"><p><strong>{event.name||'Usuário indisponível'}</strong> {label}.</p>{event.details.reason&&<p className="mt-1 whitespace-pre-wrap break-words">Motivo: {event.details.reason}</p>}<time className="text-muted-foreground" dateTime={event.created_at}>{activityDate(event.created_at)}</time></article>
  }
  const comment=entry.item,parent=details.comments.find(c=>c.id===comment.reply_to)
  return <article key={comment.id} id={'activity-message-'+comment.id} className={'flex items-start gap-2 '+(comment.author_id===userId?'ml-4':'mr-4')}><UserAvatar name={comment.name||'Usuário indisponível'} imageUrl={comment.avatar??undefined} sizeClassName="size-7"/><div className={'min-w-0 flex-1 space-y-2 rounded-xl border p-3 '+(comment.author_id===userId?'border-primary/20 bg-primary/10':'border-border bg-muted/30')}><p className="break-words text-xs font-semibold">{comment.name||'Usuário indisponível'}</p>{parent&&<button type="button" className="block w-full rounded border-l-2 border-primary bg-muted p-2 text-left text-xs" onClick={()=>document.getElementById('activity-message-'+parent.id)?.scrollIntoView({block:'nearest'})}><span className="block truncate font-medium">{parent.name||'Usuário indisponível'}</span><span className="block truncate">{parent.body||'Anexos'}</span></button>}{comment.body&&<p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{comment.body}</p>}<ActivityAttachments files={comment.attachments??[]}/><div className="flex flex-wrap items-center justify-between gap-2"><time dateTime={comment.created_at} className="text-[11px] text-muted-foreground">{activityDate(comment.created_at)}</time>{canReply&&<Button type="button" size="sm" variant="ghost" onClick={()=>onReply(comment)}>Responder</Button>}</div></div></article>
 })}</>
}
