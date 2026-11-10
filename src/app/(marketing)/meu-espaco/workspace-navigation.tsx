'use client'
import Link from 'next/link'
import {usePathname} from 'next/navigation'
import {useState} from 'react'
import {Briefcase,CheckSquare,ChevronDown,FileUser,LayoutDashboard,LogOut,Search,MessageCircle,Settings,UserRound,Users} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {internalProject} from '@/lib/workspace-navigation'
import type {useWorkspaceProjects} from '@/hooks/use-workspace-projects'

const groups=[{title:'Principal',items:[{href:'/meu-espaco',label:'Dashboard',icon:LayoutDashboard},{href:'/meu-espaco/projetos',label:'Meus projetos',icon:Briefcase},{href:'/meu-espaco/vagas',label:'Explorar vagas',icon:Search},{href:'/meu-espaco/atividades',label:'Minhas atividades',icon:CheckSquare},{href:'/meu-espaco/candidaturas',label:'Minhas candidaturas',icon:FileUser}]},{title:'Conexões',items:[{href:'/meu-espaco/mensagens',label:'Mensagens',icon:MessageCircle},{href:'/meu-espaco/amigos',label:'Amigos',icon:Users},{href:'/meu-espaco/perfil',label:'Meu perfil',icon:UserRound}]},{title:'Conta',items:[{href:'/meu-espaco/configuracoes',label:'Configurações',icon:Settings}]}]
type Props={collapsed?:boolean;expanded:boolean;onProjects:()=>void;close?:()=>void;count:number;signOut:()=>Promise<void>;projects:ReturnType<typeof useWorkspaceProjects>;onLogout:()=>void;mobile?:boolean}
export function WorkspaceNavigation({collapsed=false,expanded,onProjects,close,count,signOut,projects,onLogout,mobile=false}:Props){
 const pathname=usePathname(),projectRoute=internalProject(pathname),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const items=projects.data?.items??[],current=projects.data?.current
 const visible=current&&!items.some(p=>p.id===current.id)?[current,...items]:items
 const linkClass=(active:boolean)=>'flex min-h-10 min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary '+(collapsed?'justify-center ':'')+(active?'bg-primary/15 text-primary':'text-muted-foreground hover:bg-muted hover:text-foreground')
 return <nav aria-label="Meu Espaço" className="flex min-h-0 flex-1 flex-col gap-4">{groups.map(group=><div key={group.title} className={group.title==='Conta'?'mt-auto':''}>
  <p className={collapsed?'sr-only':'mb-1 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground'}>{group.title}</p><ul className="space-y-1">{group.items.map(item=>{
   const active=item.label==='Meus projetos'?Boolean(projectRoute)||pathname.startsWith(item.href):item.href==='/meu-espaco'?pathname===item.href:pathname.startsWith(item.href)
   const contents=<><item.icon className="size-4 shrink-0" aria-hidden/><span className={collapsed?'sr-only':'min-w-0 flex-1'}>{item.label}</span>{item.label==='Amigos'&&count>0&&<span aria-label={count+' solicitações recebidas'} className={(collapsed?'absolute -right-1 -top-1 ':'')+'rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground'}>{count}</span>}</>
   return <li key={item.href}>{item.label==='Meus projetos'?<><button type="button" className={linkClass(active)+' w-full'} title={collapsed?item.label:undefined} aria-expanded={!collapsed&&expanded} aria-controls={mobile?'mobile-project-submenu':'project-submenu'} onClick={onProjects}>{contents}{!collapsed&&<ChevronDown aria-hidden className={'size-4 shrink-0 transition-transform '+(expanded?'rotate-180':'')}/>}</button>
    {!collapsed&&expanded&&<div id={mobile?'mobile-project-submenu':'project-submenu'} className="ml-4 mt-1 space-y-1 border-l border-border pl-2"><div className="max-h-[min(40dvh,360px)] space-y-1 overflow-y-auto overscroll-contain">
     {projects.busy&&!items.length&&<p role="status" className="p-2 text-xs text-muted-foreground">Carregando projetos…</p>}
     {projects.error&&<div role="alert" className="p-2 text-xs"><p>{projects.error}</p><Button type="button" size="sm" variant="ghost" onClick={()=>void projects.refresh()}>Tentar novamente</Button></div>}
     {!projects.busy&&!projects.error&&!visible.length&&<p className="p-2 text-xs text-muted-foreground">Nenhum painel acessível.</p>}
     {visible.map(p=><Link key={p.id} href={'/projetos/'+encodeURIComponent(p.slug)+'/painel'} title={p.title} onClick={close} aria-current={projectRoute&&(projectRoute.reference===p.slug||projectRoute.reference===p.id)?'page':undefined} className={'block min-w-0 truncate rounded-lg px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary '+(projectRoute&&(projectRoute.reference===p.slug||projectRoute.reference===p.id)?'bg-primary/15 font-semibold text-primary':'text-muted-foreground hover:bg-muted hover:text-foreground')}>{p.title}</Link>)}
     {projects.data?.has_more&&<Button type="button" size="sm" variant="ghost" disabled={projects.busy} onClick={()=>void projects.more()}>Mostrar mais projetos</Button>}
    </div><Link href="/meu-espaco/projetos" onClick={close} className="block rounded-lg px-2 py-2 text-xs font-medium text-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">Ver todos os projetos</Link></div>}
   </>:<Link href={item.href} onClick={close} title={collapsed?item.label:undefined} aria-current={active?'page':undefined} className={linkClass(active)+' relative'}>{contents}</Link>}</li>
  })}</ul></div>)}
  <div className="border-t border-border pt-2"><Button title={collapsed?'Sair':undefined} aria-label="Sair" variant="ghost" disabled={busy} className={'w-full text-destructive hover:bg-destructive/10 hover:text-destructive '+(collapsed?'justify-center px-2':'justify-start')} onClick={async()=>{setBusy(true);setError('');close?.();try{await signOut();onLogout()}catch{setError('Não foi possível sair. Tente novamente.');setBusy(false)}}}><LogOut aria-hidden className="size-4"/><span className={collapsed?'sr-only':''}>{busy?'Saindo…':'Sair'}</span></Button>{error&&<p role="alert" className="text-xs text-destructive">{error}</p>}</div>
 </nav>
}
