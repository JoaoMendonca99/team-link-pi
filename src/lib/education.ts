import type { CatalogSelection } from '@/components/team-link/catalog-picker'

export type Education = {
  id: string; instituicao_id: string|null; instituicao_manual: string|null; curso_id:string|null; curso_manual:string|null
  cursando_atualmente:boolean|null; origem?:'user'|'legacy';posicao?:number; institution_name?:string; institution_acronym?:string|null; course_name?:string
  institution_catalog?:{nome:string;sigla?:string|null}|null; course_catalog?:{nome:string}|null
}
export type LegacyEducation = { university:string|null;institution_id:string|null;course:string|null;course_id:string|null }
export type EducationState = {revision:number;primary_id:string|null;formations:Education[];legacy:LegacyEducation|null}
export type EducationDraft = {id:string;institution:CatalogSelection;course:CatalogSelection;current:boolean|null;origin?:'user'|'legacy';duplicateAck?:boolean}
export function educationLabels(row:Education){return {institution:row.institution_name??row.institution_catalog?.nome??row.instituicao_manual??'',course:row.course_name??row.course_catalog?.nome??row.curso_manual??'',acronym:row.institution_acronym??row.institution_catalog?.sigla}}
export function educationDraft(row?:Education,legacy?:LegacyEducation):EducationDraft {
  const labels=row&&educationLabels(row)
  return {id:row?.id??crypto.randomUUID(),institution:{id:row?.instituicao_id??legacy?.institution_id??null,name:labels?.institution??legacy?.university??''},
    course:{id:row?.curso_id??legacy?.course_id??null,name:labels?.course??legacy?.course??''},current:row?row.cursando_atualmente:legacy?null:false,origin:row?.origem}
}
export const educationStatus=(current:boolean|null)=>current===null?'Situação não informada':current?'Cursando atualmente':'Não cursando atualmente'
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR')
export function sameEducation(a:EducationDraft,b:EducationDraft){
  const same=(a:CatalogSelection,b:CatalogSelection)=>a.id&&b.id?a.id===b.id:normalized(a.name)===normalized(b.name)
  return same(a.institution,b.institution)&&same(a.course,b.course)
}
export function educationPayload(rows:EducationDraft[]){return rows.map(row=>({id:row.id,instituicao_id:row.institution.id,instituicao_manual:row.institution.id?null:row.institution.name.trim(),curso_id:row.course.id,curso_manual:row.course.id?null:row.course.name.trim(),cursando_atualmente:row.current,duplicate_ack:row.duplicateAck===true}))}
export const EDUCATION_PROFILE_EMBED='educations:usuario_formacoes!usuario_formacoes_user_id_fkey(id,posicao,instituicao_id,instituicao_manual,curso_id,curso_manual,cursando_atualmente,institution_catalog:instituicoes_ensino(nome,sigla),course_catalog:cursos(nome))'
