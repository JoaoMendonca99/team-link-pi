import type { Period } from '@/lib/activities'
import type { Report } from '@/lib/reports/model'

export type AcademicDefaults = { institution:string; course:string; city:string }
export type AcademicPeriod = { academic_year?:number|null; academic_semester?:number|null; discipline?:string|null; advisor?:string|null; institution?:string|null; course?:string|null; city?:string|null; academic_configured?:boolean }
export type AcademicSpace = {context:'academic'|'general'|null;revision:number;defaults:AcademicDefaults;periods:Period[]}
export type PeriodDraft = ReturnType<typeof periodDraft>
export const emptyDefaults:AcademicDefaults={institution:'',course:'',city:''}
export function periodDraft(period?:Period|null) {
 return {id:period?.id,version:period?.version,name:period?.name??'',description:period?.description??'',starts_on:period?.starts_on??'',ends_on:period?.ends_on??'',activate:false,
 academic_year:String(period?.academic_year??''),academic_semester:String(period?.academic_semester??''),discipline:period?.discipline??'',advisor:period?.advisor??'',institution:period?.institution??'',course:period?.course??'',city:period?.city??'',
 discipline_confirmed:Boolean(period?.discipline),advisor_confirmed:Boolean(period?.advisor)}
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
