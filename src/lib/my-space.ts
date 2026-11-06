import type {Kind,Priority} from './activities'
import type {ProjectStatusValue} from '@/types/database'
export type SpaceProject={id:string;slug:string;title:string;short_description:string|null;category:string|null;status:ProjectStatusValue;created:boolean;participating:boolean;level:string|null;display_role:string|null;period_id:string|null;period_name:string|null;project_context:string|null;page_access:boolean;modules:string[]}
export type SpaceTask={id:string;project_id:string;title:string;priority:Priority;due_at:string|null;period_id:string|null;period_name:string|null;kind:Kind;stage_name:string;project_title:string;slug:string;assigned:boolean;reviewable:boolean}
export type SpaceApplication={id:string;project_id:string;project_title:string;slug:string;created_at:string;decided_at:string|null;status:'pending'|'review'|'approved'|'rejected'|'canceled';decision_reason:string|null;page_access:boolean;vacancies:{id:string;title:string;approved:boolean;rejected:boolean}[]}
export type MySpace={as_of:string;counts:{projects:number;tasks:number;applications:number;reviews:number};project_total:number;projects:SpaceProject[];task_total:number;tasks:SpaceTask[];review_total:number;reviews:SpaceTask[];application_total:number;applications:SpaceApplication[];attention:SpaceTask[]}
export type SpaceFilters={search:string;projects:'all'|'created'|'participating';project_status:'all'|'active'|'closed';tasks:'all'|'doing'|'review'|'late';applications:'all'|'pending'|'approved'|'rejected'|'canceled';project_offset:number;task_offset:number;application_offset:number;review_offset:number}
export const initialSpaceFilters:SpaceFilters={search:'',projects:'all',project_status:'all',tasks:'all',applications:'all',project_offset:0,task_offset:0,application_offset:0,review_offset:0}
export const taskHref=(task:SpaceTask)=>'/projetos/'+encodeURIComponent(task.slug)+'/painel/atividades?atividade='+encodeURIComponent(task.id)+(task.period_id?'&periodo='+encodeURIComponent(task.period_id):'')
export const applicationHref=(id:string)=>'/perfil?aba=candidaturas&candidatura='+encodeURIComponent(id)
export function toolHref(slug:string,tool:string) {
 const base='/projetos/'+encodeURIComponent(slug)+'/painel'
 return tool==='activities'?base+'/atividades':tool==='reports'?base+'/relatorios':base+'?ferramenta='+encodeURIComponent(tool)
}
export const spaceApplicationStatuses={pending:'Pendente',review:'Em análise',approved:'Aprovada',rejected:'Recusada',canceled:'Cancelada'}
