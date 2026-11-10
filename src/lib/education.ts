import type { CatalogSelection } from '@/components/team-link/catalog-picker'

export type Education = {
  id: string; instituicao_id: string|null; instituicao_manual: string|null; curso_id:string|null; curso_manual:string|null
  cursando_atualmente:boolean|null; origem?:'user'|'legacy';posicao?:number; institution_name?:string; institution_acronym?:string|null; course_name?:string
  institution_catalog?:{nome:string;sigla?:string|null}|null; course_catalog?:{nome:string}|null
  inicio_mes?:string|null;previsao_conclusao_mes?:string|null;termino_mes?:string|null;situacao_final?:EducationEnding|null;situacao?:string
}
export type EducationEnding='concluido'|'interrompido'
export type LegacyEducation = { university:string|null;institution_id:string|null;course:string|null;course_id:string|null }
export type EducationState = {revision:number;primary_id:string|null;formations:Education[];legacy:LegacyEducation|null}
export type EducationDraft = {id:string;institution:CatalogSelection;course:CatalogSelection;current:boolean|null;origin?:'user'|'legacy';duplicateAck?:boolean;start:string;forecast:string;end:string;ending:EducationEnding|'';requireEnding?:boolean}
export function educationLabels(row:Education){return {institution:row.institution_name??row.institution_catalog?.nome??row.instituicao_manual??'',course:row.course_name??row.course_catalog?.nome??row.curso_manual??'',acronym:row.institution_acronym??row.institution_catalog?.sigla}}
export function educationDraft(row?:Education,legacy?:LegacyEducation):EducationDraft {
  const labels=row&&educationLabels(row)
  return {id:row?.id??crypto.randomUUID(),institution:{id:row?.instituicao_id??legacy?.institution_id??null,name:labels?.institution??legacy?.university??''},
    course:{id:row?.curso_id??legacy?.course_id??null,name:labels?.course??legacy?.course??''},current:row?row.cursando_atualmente:legacy?null:false,origin:row?.origem,
    start:displayEducationMonth(row?.inicio_mes),forecast:displayEducationMonth(row?.previsao_conclusao_mes),end:displayEducationMonth(row?.termino_mes),ending:row?.situacao_final??'',requireEnding:row?Boolean(row.situacao_final):!legacy}
}
export const educationStatus=(current:boolean|null,ending?:EducationEnding|null|'')=>current===true?'Cursando atualmente':current===false&&ending==='concluido'?'Concluído':current===false&&ending==='interrompido'?'Interrompido/Trancado':'Situação não informada'
/** Months have no day precision. PostgreSQL uses day 01 only as a storage convention. */
export function displayEducationMonth(value?:string|null){return value?value.slice(5,7)+'/'+value.slice(0,4):''}
export function parseEducationMonth(value:string){
 if(!value.trim())return null
 if(!/^(0[1-9]|1[0-2])\/(?!0000)\d{4}$/.test(value.trim()))throw new Error('Informe as datas no formato MM/AAAA, com mês e ano válidos.')
 const [month,year]=value.trim().split('/');return year+'-'+month
}
export function educationValidation(row:EducationDraft){
 try{
  const start=parseEducationMonth(row.start),forecast=parseEducationMonth(row.forecast),end=parseEducationMonth(row.end)
  if(start&&((forecast&&forecast<start)||(end&&end<start)))return 'A previsão e o término não podem ser anteriores ao início.'
  if(row.current===false&&row.requireEnding&&!row.ending)return 'Escolha se a formação foi concluída ou interrompida/trancada.'
  return ''
 }catch(error){return (error as Error).message}
}
export function changeCurrentEducation(row:EducationDraft,current:boolean):EducationDraft{return {...row,current,ending:current?row.ending:'',requireEnding:!current}}
export function educationDateLabel(row:Education){
 const start=displayEducationMonth(row.inicio_mes),end=displayEducationMonth(row.cursando_atualmente===true?row.previsao_conclusao_mes:row.termino_mes)
 return [start?(end?start:'Início: '+start):'',end?(row.cursando_atualmente===true?'Previsão: ':'')+end:''].filter(Boolean).join(' — ')
}
const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR')
export function sameEducation(a:EducationDraft,b:EducationDraft){
  const same=(a:CatalogSelection,b:CatalogSelection)=>a.id&&b.id?a.id===b.id:normalized(a.name)===normalized(b.name)
  return same(a.institution,b.institution)&&same(a.course,b.course)
}
export function educationPayload(rows:EducationDraft[]){return rows.map(row=>({id:row.id,instituicao_id:row.institution.id,instituicao_manual:row.institution.id?null:row.institution.name.trim(),curso_id:row.course.id,curso_manual:row.course.id?null:row.course.name.trim(),cursando_atualmente:row.current,duplicate_ack:row.duplicateAck===true,inicio_mes:parseEducationMonth(row.start),previsao_conclusao_mes:parseEducationMonth(row.forecast),termino_mes:parseEducationMonth(row.end),situacao_final:row.ending||null}))}
export const EDUCATION_PROFILE_EMBED='educations:usuario_formacoes!usuario_formacoes_user_id_fkey(id,posicao,instituicao_id,instituicao_manual,curso_id,curso_manual,cursando_atualmente,inicio_mes,previsao_conclusao_mes,termino_mes,situacao_final,situacao,institution_catalog:instituicoes_ensino(nome,sigla),course_catalog:cursos(nome))'
