import type { ProjectStatusValue } from '@/types/database'
import type { Vacancy } from '@/components/team-link/recruitment'

export type Opportunity = {id:string;project_id:string;slug:string;title:string;description:string|null;skills:string[];available:number;project_title:string;category:string|null;project_status:ProjectStatusValue}
export type OpportunityPage = {items:Opportunity[];total:number;page:number;size:number}
export type OpportunityFilters = {search:string;category:string;skill:string;skill_name:string;sort:'recent'|'name';page:number}
export type OpportunityPreview = {vacancy:Omit<Vacancy,'legacy'>;member:boolean;vacancies:Vacancy[];project:{id:string;slug:string;title:string;short_description:string|null;description:string|null;category:string|null;secondary_categories:string[];status:ProjectStatusValue;tags:string[];members:{user_id:string;name:string|null;avatar:string|null;display_role:string|null}[]}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function opportunityFilters(params:URLSearchParams):OpportunityFilters {
 const skill=params.get('skill')??''
 const page=Number(params.get('page')??'0')
 return {search:(params.get('q')??'').slice(0,120),category:(params.get('category')??'').slice(0,120),skill:uuid.test(skill)?skill:'',skill_name:uuid.test(skill)?(params.get('skill_name')??'Habilidade selecionada').slice(0,120):'',sort:params.get('sort')==='name'?'name':'recent',page:Number.isInteger(page)?Math.min(10000,Math.max(0,page)):0}
}
export function opportunityParams(filters:OpportunityFilters,vacancy?:string|null){
 const p=new URLSearchParams()
 if(filters.search)p.set('q',filters.search)
 if(filters.category)p.set('category',filters.category)
 if(filters.skill){p.set('skill',filters.skill);p.set('skill_name',filters.skill_name)}
 if(filters.sort!=='recent')p.set('sort',filters.sort)
 if(filters.page)p.set('page',String(filters.page))
 if(vacancy&&uuid.test(vacancy))p.set('vaga',vacancy)
 return p
}
export const opportunityAvailable=(v:Pick<Vacancy,'open'|'available'>)=>v.open&&v.available>0
export const availablePositions=(n:number)=>n===1?'1 posição disponível':`${n} posições disponíveis`
