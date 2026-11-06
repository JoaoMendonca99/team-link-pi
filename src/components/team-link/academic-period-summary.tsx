'use client'
import {useProjectAcademics} from '@/hooks/use-project-academics'
export function AcademicPeriodSummary({projectId}:{projectId:string}) {
 const {data}=useProjectAcademics(projectId),period=data?.periods.find(p=>p.is_active)
 if(data?.context!=='academic'||!period)return null
 return <p className="text-sm text-muted-foreground">Período atual: {period.name}{period.discipline&&' · '+period.discipline}{period.advisor&&' · Orientação: '+period.advisor}</p>
}
