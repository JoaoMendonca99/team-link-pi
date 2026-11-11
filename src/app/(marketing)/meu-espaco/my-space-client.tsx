'use client'

import Link from 'next/link'
import {WorkspaceLoading} from '@/components/layout/workspace-loading'
import {ActivityDetailsDialog} from '@/components/activities/activity-details-dialog'
import {useActivityLink} from '@/components/activities/activity-link'
import {useEffect,useState} from 'react'
import {ArrowRight,Briefcase,CheckSquare,ClipboardCheck,FileUser,Plus} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {useSupabaseSession} from '@/hooks/use-supabase-session'
import {getSupabaseClient} from '@/lib/supabase/client'
import {priorities} from '@/lib/activities'
import {mapPublicDetailToDisplay, PROJECT_STATUS_LABEL, type ProjectDisplay} from '@/lib/projects/display'
import {initialSpaceFilters,taskHref,toolHref,type MySpace,type SpaceFilters,type SpaceProject,type SpaceTask} from '@/lib/my-space'
import {useWorkspaceCache} from './workspace-shell'
import {RecentVacancies} from '@/components/vacancies/vacancy-exploration'
import {FirstSteps} from '@/components/profile/first-steps'
import {ProjectCard} from '@/components/team-link/project-card'
import {ProjectLogo} from '@/components/team-link/project-logo'
import type {ProjectPublicDetailRow} from '@/types/database'

const card='min-w-0 space-y-4 rounded-2xl border border-card-outline bg-card p-4 sm:p-5'
const selectClass='rounded-xl border border-border bg-background p-2 text-sm text-foreground'
const levels:Record<string,string>={owner:'Líder',manager:'Gestor',reviewer:'Revisor',member:'Membro'}
const tools:Record<string,string>={activities:'Atividades',reports:'Documentação com IA',github:'GitHub',support:'SAC'}
function Pages({offset,total,size,name,onChange}:{offset:number;total:number;size:number;name:string;onChange:(offset:number)=>void}) {
 if(total<=size&&offset===0)return null
 return <nav aria-label={'Paginação de '+name} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{total?Math.min(offset+1,total):0}–{Math.min(offset+size,total)} de {total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={offset===0} onClick={()=>onChange(Math.max(0,offset-size))}>Anterior</Button><Button size="sm" variant="outline" disabled={offset+size>=total} onClick={()=>onChange(offset+size)}>Próxima</Button></div></nav>
}
function ProjectItem({ project: p, display }: { project: SpaceProject; display?: ProjectDisplay }) {
 const historical = p.status === 'completed' || p.status === 'archived'
 const base = '/projetos/' + encodeURIComponent(p.slug)
 const project: ProjectDisplay = display ?? {
  id:p.id,slug:p.slug,title:p.title,shortDescription:p.short_description??'',description:null,category:p.category,
  status:p.status,visibility:'private',openSpots:0,desiredProfile:null,projectUrl:null,createdAt:'',updatedAt:'',
  ownerId:'',ownerName:'',ownerCourse:null,ownerAvatarUrl:null,tags:[],requiredSkills:[],likesCount:0,commentsCount:0,membersCount:0,
 }
 return <ProjectCard project={project} href={base + '/painel'} disableLink={!p.page_access} footer={
  <div className="w-full space-y-2">
   <p className="text-xs text-muted-foreground">
    {p.created?'Criado por mim':'Participo'}{p.participating?' · '+(levels[p.level||'']||'Integrante ativo'):p.created?' · Sem vínculo ativo':''}
    {p.display_role?.trim()?' · '+p.display_role:''}
    {p.period_name?' · '+p.period_name:''}
   </p>
   {historical && p.closed_at && <p className="text-xs text-muted-foreground">Finalizado em {new Date(p.closed_at).toLocaleDateString('pt-BR')}</p>}
   <div className="flex flex-wrap gap-2">
    {p.page_access ? <Button asChild size="sm" variant="outline"><Link href={base}>Página do projeto<ArrowRight aria-hidden /></Link></Button>
      : <p className="text-xs text-muted-foreground">Painel restrito pelas permissões atuais deste projeto.</p>}
   </div>
   {p.modules.length>0&&<nav aria-label={'Ferramentas de '+p.title} className="flex flex-wrap gap-2">
    {p.modules.filter(tool=>tools[tool]).map(tool=><Link key={tool} className="rounded-lg px-2 py-1 text-xs font-medium text-link hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring" href={toolHref(p.slug,tool)}>{tools[tool]}</Link>)}
   </nav>}
  </div>
 } />
}
function TaskRows({tasks,now,empty,open}:{tasks:SpaceTask[];now:number;empty:string;open:(project:string,task:string)=>void}) {
 return tasks.length?<ul className="space-y-3">{tasks.map(t=>{const late=Boolean(t.due_at&&Date.parse(t.due_at)<now);return <li key={t.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border p-3"><div className="min-w-0 flex-1 basis-48"><Link href={taskHref(t)} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();open(t.project_id,t.id)}}} className="break-words font-semibold text-primary hover:underline">{t.title}</Link><p className="break-words text-sm text-muted-foreground">{t.project_title}{t.period_name?' · '+t.period_name:''}</p><p className="mt-1 text-xs text-muted-foreground">{t.stage_name} · Prioridade {priorities[t.priority].toLocaleLowerCase('pt-BR')}</p><p className={'mt-1 text-xs '+(late?'font-medium text-destructive':'text-muted-foreground')}>{t.due_at?(late?'Atrasada · ':'Prazo: ')+new Date(t.due_at).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Sem prazo informado'}</p></div><Button asChild size="sm" variant="outline"><Link href={taskHref(t)} onClick={e=>{if(!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();open(t.project_id,t.id)}}}>{t.reviewable?'Revisar entrega':'Abrir atividade'}</Link></Button></li>})}</ul>:<p className="text-sm text-muted-foreground">{empty}</p>
}

export function MySpaceClient({section='dashboard'}:{section?:'dashboard'|'projects'}) {
 const {user,profile}=useSupabaseSession(),userId=user?.id
 const activityLink=useActivityLink()
 const cache=useWorkspaceCache()
 const [filters,setFilters]=useState<SpaceFilters>(initialSpaceFilters),[search,setSearch]=useState(''),[retry,setRetry]=useState(0)
 const [snapshot,setSnapshot]=useState<{user:string;key:string;data:MySpace}>(),[busy,setBusy]=useState(true),[error,setError]=useState('')
 const key=JSON.stringify(filters),cacheKey=userId+':'+key,cached=cache.get(cacheKey)
 const data=snapshot&&snapshot.user===userId&&snapshot.key===key?snapshot.data:cached?.data
 useEffect(()=>{const timer=window.setTimeout(()=>setFilters(previous=>previous.search===search.trim()?previous:{...previous,search:search.trim(),project_offset:0}),300);return()=>window.clearTimeout(timer)},[search])
 useEffect(()=>{
  if(!userId)return
  let alive=true,sequence=0
  const load=async()=>{const request=++sequence;setBusy(true);try{const {data,error}=await getSupabaseClient().rpc('get_my_space',{p_options:JSON.parse(key)});if(error||!data)throw error||new Error('Dados indisponíveis');if(alive&&request===sequence){if(cache.size>=24&&!cache.has(cacheKey))cache.delete(cache.keys().next().value!);cache.set(cacheKey,{data:data as MySpace,at:Date.now()});setSnapshot({user:userId,key,data:data as MySpace});setError('')}}catch{if(alive&&request===sequence)setError('Não foi possível carregar Meu Espaço. Tente novamente.')}finally{if(alive&&request===sequence)setBusy(false)}}
  const existing=cache.get(cacheKey)
  if(!retry&&existing&&Date.now()-existing.at<60_000){setSnapshot({user:userId,key,data:existing.data});setBusy(false);setError('')}else void load()
  const refresh=()=>{if(!document.hidden)void load()};window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);const timer=window.setInterval(refresh,60_000)
  return()=>{alive=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
 },[userId,key,retry,cache,cacheKey])
 const detailsKey = section === 'projects' && userId && data?.projects.length
  ? userId + ':' + data.projects.map(project => project.id).join(',') : ''
 const [details, setDetails] = useState<{ key:string; items:Map<string, ProjectDisplay> }>()
 useEffect(() => {
  if (!detailsKey) return
  const abort = new AbortController()
  const ids = detailsKey.slice(detailsKey.indexOf(':') + 1).split(',')
  void getSupabaseClient().from('project_public_details').select('*').in('id',ids).abortSignal(abort.signal)
   .then(({data,error}) => {
    if (!error && !abort.signal.aborted) {
     setDetails({key:detailsKey,items:new Map(((data??[]) as ProjectPublicDetailRow[]).map(row=>[row.id,mapPublicDetailToDisplay(row)]))})
    }
   })
  return () => abort.abort()
 },[detailsKey])
 const update=(patch:Partial<SpaceFilters>)=>setFilters(previous=>({...previous,...patch}))
 const now=data?Date.parse(data.as_of):Date.now()
 const summary=[{key:'projects',label:'Projetos ativos',href:'/meu-espaco/projetos',icon:Briefcase},{key:'tasks',label:'Minhas atividades',href:'/meu-espaco/atividades',icon:CheckSquare},{key:'applications',label:'Candidaturas pendentes',href:'/meu-espaco/candidaturas?status=active',icon:FileUser},{key:'reviews',label:'Aguardando minha revisão',href:'/meu-espaco/atividades?revisoes=1#aguardando-revisao',icon:ClipboardCheck}] as const
 const title=section==='projects'?'Meus projetos':'Dashboard'
 return <div className="min-w-0 space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div className="space-y-2">{section==='dashboard'&&<p className="text-sm text-muted-foreground">Olá{profile?.full_name?.trim()?', '+profile.full_name.trim().split(' ')[0]:''}.</p>}<h1 className="text-2xl font-bold sm:text-3xl">{title}</h1><p className="text-sm text-muted-foreground">{section==='dashboard'?'Seus projetos, atividades e atualizações em um só lugar.':'Projetos criados e participações ativas, sem duplicação.'}</p></div><Button asChild><Link href="/nova-ideia"><Plus aria-hidden className="size-4"/>Criar projeto</Link></Button></header>
 {busy&&!data&&<WorkspaceLoading shell={false}/>}
 {busy&&data&&<p role="status" className="text-sm text-muted-foreground">{data?'Atualizando…':'Carregando seus projetos e pendências…'}</p>}{error&&<div role="alert" className="space-y-2 rounded-xl border border-destructive p-3 text-sm"><p>{error}{data?' Os dados exibidos são da última consulta.':''}</p><Button size="sm" variant="outline" onClick={()=>setRetry(v=>v+1)}>Tentar novamente</Button></div>}
 {section==='dashboard'&&<><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{summary.map(item=><Link key={item.key} href={item.href} className={card+' transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary'}><span className="flex items-center gap-2 text-xs text-muted-foreground"><item.icon className="size-4 shrink-0 text-primary" aria-hidden/>{item.label}</span><strong className="block text-3xl">{data?data.counts[item.key]:'—'}</strong></Link>)}</div><p className="text-xs text-muted-foreground">Contadores consideram períodos ativos e suas permissões.</p>{data&&<><section className={card} aria-labelledby="attention-title"><h2 id="attention-title" className="text-lg font-semibold">Precisa da minha atenção</h2><TaskRows open={activityLink.open} tasks={data.attention} now={now} empty="Nenhuma ação urgente no momento."/></section><div className="grid min-w-0 items-start gap-4 xl:grid-cols-2"><section className={card}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Projetos recentes</h2><Link className="text-sm font-medium text-primary hover:underline" href="/meu-espaco/projetos">Ver todos</Link></div>{data.projects.slice(0,3).map(project=><div key={project.id} className="min-w-0 rounded-xl border border-border p-3"><div className="flex items-center gap-2"><ProjectLogo projectId={project.id} title={project.title} className="!size-9 text-xs"/><h3 className="break-words font-semibold">{project.title}</h3></div><p className="my-2 text-xs text-muted-foreground">{PROJECT_STATUS_LABEL[project.status]}{project.period_name?' · '+project.period_name:''}</p>{(project.page_access||project.modules.length>0)&&<Link className="text-sm text-primary hover:underline" href={project.page_access?'/projetos/'+project.slug+'/painel':toolHref(project.slug,project.modules[0])}>Abrir projeto</Link>}</div>)}{!data.projects.length&&<div className="space-y-3"><p className="text-sm text-muted-foreground">Você ainda não tem projetos ou participações ativas.</p><Button asChild variant="outline"><Link href="/explorar">Explorar projetos</Link></Button></div>}</section><section className={card}><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Próximas atividades</h2><Link className="text-sm font-medium text-primary hover:underline" href="/meu-espaco/atividades">Ver todas</Link></div><TaskRows open={activityLink.open} tasks={data.tasks.filter(task=>!data.attention.some(urgent=>urgent.id===task.id)).slice(0,3)} now={now} empty="Nenhuma atividade pendente. Tudo em dia!"/></section></div></>}</>}
 {section==='dashboard'&&userId&&<FirstSteps key={userId} userId={userId}/>}
 {section==='dashboard'&&<RecentVacancies/>}
 {section==='projects'&&<><nav aria-label="Situação dos projetos" className="flex gap-2">{([['active','Ativos'],['closed','Histórico']] as const).map(([value,label])=><Button key={value} variant={filters.project_status===value?'default':'outline'} aria-pressed={filters.project_status===value} onClick={()=>update({project_status:value,project_offset:0})}>{label}</Button>)}</nav> <section id="meus-projetos" aria-label="Meus projetos" className="scroll-mt-24 space-y-4"><div className="workspace-filters"><label>Buscar projetos<Input aria-label="Buscar projetos pelo nome" maxLength={120} placeholder="Buscar pelo nome" className="w-full sm:max-w-xs" value={search} onChange={e=>setSearch(e.target.value)}/></label><label className="text-sm"><span>Relação com os projetos</span><select aria-label="Relação com os projetos" className={selectClass} value={filters.projects} onChange={e=>update({projects:e.target.value as SpaceFilters['projects'],project_offset:0})}><option value="all">Todos</option><option value="created">Criados por mim</option><option value="participating">Participo</option></select></label></div>{data&&<><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.projects.map(p=><ProjectItem key={p.id} project={p} display={details?.key===detailsKey?details.items.get(p.id):undefined}/>)}</div>{!data.projects.length&&<p className="text-sm text-muted-foreground">Nenhum projeto neste filtro. Projetos criados e participações ativas aparecerão aqui, sem duplicação.</p>}<Pages name="projetos" total={data.project_total} size={12} offset={filters.project_offset} onChange={project_offset=>update({project_offset})}/></>}</section>
</>}
 {activityLink.selection&&userId&&<ActivityDetailsDialog key={activityLink.key} taskId={activityLink.selection.task} projectId={activityLink.selection.project} slug={activityLink.selection.slug} userId={userId} close={activityLink.close} onChanged={()=>{cache.clear();setRetry(v=>v+1)}}/>}
 </div>
}
