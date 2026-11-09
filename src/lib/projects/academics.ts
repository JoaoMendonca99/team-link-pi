import type { Period } from '@/lib/activities'
import type { Report } from '@/lib/reports/model'

export type AcademicDefaults = { institution:string; course:string; city:string; institution_id?:string|null; course_id?:string|null }
export type AcademicPeriod = { academic_year?:number|null; academic_semester?:number|null; discipline?:string|null; advisor?:string|null; institution?:string|null; course?:string|null; city?:string|null; academic_configured?:boolean }
export type AcademicSpace = {context:'academic'|'general'|null;revision:number;defaults:AcademicDefaults;periods:Period[]}
export type PeriodDraft = ReturnType<typeof periodDraft>
export const emptyDefaults:AcademicDefaults={institution:'',course:'',city:''}
export function periodDraft(period?:Period|null) {
 return {id:period?.id,version:period?.version,name:period?.name??'',description:period?.description??'',starts_on:period?.starts_on??'',ends_on:period?.ends_on??'',activate:false,
 academic_year:String(period?.academic_year??''),academic_semester:String(period?.academic_semester??''),discipline:period?.discipline??'',advisor:period?.advisor??'',institution:period?.institution??'',course:period?.course??'',city:period?.city??'',
 discipline_confirmed:Boolean(period?.discipline),advisor_confirmed:Boolean(period?.advisor),academic_configured:Boolean(period?.academic_configured),
 custom_academics:undefined as boolean|undefined,reference_id:undefined as string|undefined,reference_choice:undefined as 'keep'|'edit'|undefined}
}
export const academicLabels={institution:'Instituição',course:'Curso',city:'Cidade',discipline:'Disciplina',advisor:'Professor orientador',year:'Ano',period:'Identificação do período'} as const
export type AcademicValues=Pick<Report['meta'],keyof typeof academicLabels>
export function reportAcademicValues(report:Report):AcademicValues {
 return Object.fromEntries(Object.keys(academicLabels).map(key=>[key,report.meta[key as keyof AcademicValues]||''])) as AcademicValues
}
export function periodDefaultValues(draft:PeriodDraft,defaults:AcademicDefaults):AcademicDefaults {
 if(draft.custom_academics===false)return {institution:defaults.institution,course:defaults.course,city:defaults.city}
 if(draft.id&&draft.academic_configured||draft.custom_academics===true)return {institution:draft.institution,course:draft.course,city:draft.city}
 return {institution:draft.institution||defaults.institution,course:draft.course||defaults.course,city:draft.city||defaults.city}
}
export function hasPeriodExceptions(draft:PeriodDraft,defaults:AcademicDefaults) {
 if(draft.custom_academics!==undefined)return draft.custom_academics
 const values=periodDefaultValues(draft,defaults)
 return (['institution','course','city'] as const).some(key=>values[key]!==defaults[key])
}
export function togglePeriodExceptions(draft:PeriodDraft,defaults:AcademicDefaults,enabled:boolean):PeriodDraft {
 if(!enabled)return {...draft,custom_academics:false}
 const preserve=draft.custom_academics===false||Boolean(draft.id&&draft.academic_configured)||Boolean(draft.reference_choice)
 const values=preserve?{institution:draft.institution,course:draft.course,city:draft.city}:periodDefaultValues(draft,defaults)
 return {...draft,...values,custom_academics:true}
}
export function periodPayload(draft:PeriodDraft,defaults:AcademicDefaults) {
 const {custom_academics,reference_id,reference_choice,academic_configured,...payload}=draft
 void custom_academics;void reference_id;void reference_choice;void academic_configured
 const values=periodDefaultValues(draft,defaults)
 if(!draft.id||!draft.academic_configured)for(const key of ['institution','course','city'] as const)values[key]=values[key]||defaults[key]
 return {...payload,...values,discipline_confirmed:Boolean(draft.discipline.trim()),advisor_confirmed:Boolean(draft.advisor.trim())}
}
function semesterOrder(period:{academic_year?:number|string|null;academic_semester?:number|string|null;name:string}) {
 const year=Number(period.academic_year),semester=Number(period.academic_semester)
 if(year>=1900&&year<=2200&&(semester===1||semester===2))return year*2+semester
 const match=/^(19\d{2}|20\d{2}|21\d{2}|2200)[./-]([12])(?:\D|$)/.exec(period.name.trim())
 return match?Number(match[1])*2+Number(match[2]):null
}
export function previousAcademicPeriod(periods:Period[],draft:PeriodDraft) {
 const target=semesterOrder(draft),dated=periods.map(period=>({period,order:semesterOrder(period)}))
 const candidates=dated.filter(item=>target===null||item.order===null||item.order<target)
 const known=candidates.filter(item=>item.order!==null).sort((a,b)=>b.order!-a.order!)
 const nearest=known.filter(item=>item.order===known[0]?.order)
 const ambiguous=target===null||candidates.some(item=>item.order===null)||nearest.length>1
 return {period:!ambiguous&&nearest.length===1?nearest[0].period:undefined,candidates:candidates.map(item=>item.period),ambiguous}
}
export function keepPeriodInformation(draft:PeriodDraft,space:AcademicSpace,period:Period,choice:'keep'|'edit'):PeriodDraft {
 const values=academicSnapshot(space,period)
 return {...draft,institution:values.institution,course:values.course,city:values.city,discipline:values.discipline,advisor:values.advisor,
  custom_academics:(['institution','course','city'] as const).some(key=>values[key]!==space.defaults[key]),reference_id:period.id,reference_choice:choice}
}
export function academicSnapshot(space:AcademicSpace,period:Period) {
 const base=period.academic_configured?emptyDefaults:space.defaults
 return {institution:period.institution??base.institution,course:period.course??base.course,city:period.city??base.city,
 discipline:period.discipline??'',advisor:period.advisor??'',year:period.academic_year?String(period.academic_year):'',period:period.name}
}
export function applyAcademicSnapshot(report:Report,space:AcademicSpace,period:Period,values=academicSnapshot(space,period),copy=true):Report {
 return {...report,meta:copy?{...report.meta,...values}:report.meta,
 academic:{periodId:period.id,confirmedAt:new Date().toISOString(),periodVersion:period.version,projectRevision:space.revision,snapshot:{...values}}}
}
export function confirmAcademicValues(report:Report,space:AcademicSpace,period:Period,values:AcademicValues):Report {
 if(report.academic?.periodId!==period.id)return applyAcademicSnapshot(report,space,period,values)
 const unchanged=(Object.keys(academicLabels) as (keyof AcademicValues)[]).every(key=>report.academic!.snapshot[key]===values[key])
 return {...report,meta:{...report.meta,...values},academic:{...report.academic,confirmedAt:unchanged?report.academic.confirmedAt:new Date().toISOString(),snapshot:{...values}}}
}
