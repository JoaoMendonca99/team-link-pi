'use client'
import Link from 'next/link'
import {ArrowLeft,ChevronDown,ExternalLink,Settings2} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from '@/components/ui/dropdown-menu'
import {ProjectStatusBadge} from './project-status-badge'
import {useProjectAcademics} from '@/hooks/use-project-academics'
import type {ProjectDisplay} from '@/lib/projects/display'
export function ProjectPanelHeader({project,manager,canManage,pending}:{project:ProjectDisplay;manager:boolean;canManage:boolean;pending:number}){
 const {data}=useProjectAcademics(project.id),period=data?.context==='academic'?data.periods.find(p=>p.is_active):undefined
 const historical=['completed','archived'].includes(project.status)
 return <header className="space-y-4">
  <Link className="inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline" href="/meu-espaco/projetos"><ArrowLeft className="size-4" aria-hidden/>Meus projetos</Link>
  <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0 flex-1 space-y-2"><h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">{project.title}</h1><div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">{period&&<span className="break-words">{[period.discipline,period.name,period.advisor?'Orientador: '+period.advisor:null].filter(Boolean).join(' · ')}</span>}<ProjectStatusBadge status={project.status}/></div>{historical&&<p className="text-sm text-primary">Projeto finalizado — somente leitura</p>}</div>
   <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><Button asChild variant="outline" size="sm"><Link href={'/projetos/'+project.slug}><ExternalLink className="mr-1.5 size-4" aria-hidden/>Página pública</Link></Button>{manager&&<Button asChild variant="outline" size="sm"><Link id="candidaturas" href={'/projetos/'+project.slug+'/painel/candidaturas'}>Candidaturas{pending>0&&<span className="ml-1.5 rounded-full bg-primary/10 px-2 text-primary" aria-label={pending+' pendentes'}>{pending}</span>}</Link></Button>}{canManage&&<DropdownMenu modal={false}><DropdownMenuTrigger asChild><Button variant="outline" size="sm"><Settings2 className="mr-1.5 size-4" aria-hidden/>Gerenciar projeto<ChevronDown className="ml-1 size-4" aria-hidden/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={'/projetos/'+project.slug+'/editar'}>Editar informações</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={'/projetos/'+project.slug+'#equipe-do-projeto'}>Gerenciar equipe</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={'/projetos/'+project.slug+'/editar#project-vacancies'}>Gerenciar vagas</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={'/projetos/'+project.slug+'/editar#project-publishing'}>Configurações do projeto</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>
  </div>
 </header>
}
