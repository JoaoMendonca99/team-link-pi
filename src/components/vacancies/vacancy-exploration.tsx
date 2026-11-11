'use client'

import Link from 'next/link'
import {useCallback,useEffect,useId,useRef,useState} from 'react'
import {usePathname,useRouter,useSearchParams} from 'next/navigation'
import {loadRankedVacancies} from '@/lib/graph/actions'
import {useRecommendationRefresh} from '@/hooks/use-recommendation-refresh'
import {RecommendedBadge} from '@/components/recommendations/recommended-badge'
import {ArrowRight,X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {ConceptChipInput} from '@/components/team-link/concept-chip-input'
import {ApplyButton,VacancySkills,useProjectApplications} from '@/components/team-link/recruitment'
import {UserAvatar} from '@/components/team-link/user-avatar'
import {ProjectSummary} from '@/app/(marketing)/projetos/[id]/_components/project-description'
import {useSupabaseSession} from '@/hooks/use-supabase-session'
import {getSupabaseClient} from '@/lib/supabase/client'
import {projectCategories} from '@/data/mock-projects'
import {PROJECT_STATUS_LABEL} from '@/lib/projects/display'
import {availablePositions,opportunityAvailable,opportunityFilters,opportunityParams,type Opportunity,type OpportunityPage,type OpportunityPreview,type OpportunityFilters} from '@/lib/vacancy-exploration'

const card='min-w-0 rounded-2xl border border-card-outline bg-card p-4 sm:p-5'
function useOpportunities(options:{search?:string;category?:string;skill?:string;sort?:string;page?:number;size:number}) {
 const {user}=useSupabaseSession(),userId=user?.id,key=JSON.stringify(options)
 const [result,setResult]=useState<{key:string;user:string;data:OpportunityPage}>(),[busy,setBusy]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0)
 const refresh=useCallback(()=>setVersion(v=>v+1),[])
 useEffect(()=>{
  if(!userId)return
  const controller=new AbortController()
  setBusy(true);setError('')
  void getSupabaseClient().rpc('explore_project_vacancies',{p_options:JSON.parse(key)}).abortSignal(controller.signal).then(({data,error})=>{
   if(controller.signal.aborted)return
   if(error||!data)setError('Não foi possível carregar as vagas. Tente novamente.')
   else setResult({key,user:userId,data:data as OpportunityPage})
   setBusy(false)
  })
  return()=>controller.abort()
 },[userId,key,version])
 useEffect(()=>{const update=()=>{if(!document.hidden)refresh()};window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);const timer=window.setInterval(update,60_000);return()=>{window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);window.clearInterval(timer)}},[refresh])
 return {data:result?.key===key&&result.user===userId?result.data:undefined,busy,error,refresh}
}

function OpportunityCard({item,onOpen,compact=false}:{item:Opportunity;onOpen:()=>void;compact?:boolean}) {
 return <article className={card+' flex flex-col gap-3'}><div><p className="mb-2 text-xs text-muted-foreground">{item.category||'Sem categoria'} · {PROJECT_STATUS_LABEL[item.project_status]}</p><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-lg font-semibold">{item.title}</h3>{item.recommended&&<RecommendedBadge/>}</div><p className="mt-1 break-words text-sm text-muted-foreground">{item.project_title}</p></div>{!compact&&item.description&&<p className="line-clamp-3 break-words text-sm text-muted-foreground">{item.description}</p>}<VacancySkills skills={item.skills.slice(0,4)} remaining={item.skills.length-4}/><p className="text-sm font-medium text-primary">{availablePositions(item.available)}</p><Button type="button" size="sm" variant="outline" className="mt-auto self-start" aria-label={'Ver detalhes de '+item.title} onClick={onOpen}>Ver detalhes<ArrowRight className="size-4" aria-hidden/></Button></article>
}

export function VacancyPreview({id,onClose,onChanged}:{id:string;onClose:()=>void;onChanged:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),tabButtons=useRef<(HTMLButtonElement|null)[]>([]),prefix=useId()
 const {user,loading:sessionLoading}=useSupabaseSession(),userId=user?.id
 const [data,setData]=useState<OpportunityPreview|null>(),[busy,setBusy]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0),[tab,setTab]=useState(0),[target,setTarget]=useState<string|null>(null)
 const reload=useCallback(async()=>{setVersion(v=>v+1);onChanged()},[onChanged])
 const applications=useProjectApplications(data?.project.id,userId)
 useEffect(()=>{
  const el=dialog.current,previous=document.activeElement as HTMLElement|null,viewport=document.documentElement
  const {overflow,scrollbarGutter}=viewport.style
  if(viewport.clientWidth<innerWidth)viewport.style.scrollbarGutter='stable'
  viewport.style.overflow='hidden';el?.showModal()
  return()=>{el?.close();viewport.style.overflow=overflow;viewport.style.scrollbarGutter=scrollbarGutter;if(previous?.isConnected)previous.focus({preventScroll:true});else document.querySelector<HTMLInputElement>('input[aria-label="Buscar vagas, habilidades ou projetos"]')?.focus({preventScroll:true})}
 },[])
 useEffect(()=>{
  if(!userId){setBusy(false);return}
  const controller=new AbortController();setBusy(true);setError('')
  void getSupabaseClient().rpc('preview_project_vacancy',{p_vacancy:id}).abortSignal(controller.signal).then(({data,error})=>{
   if(controller.signal.aborted)return
   if(error)setError('Não foi possível atualizar esta oportunidade.')
   else setData(data as OpportunityPreview|null)
   setBusy(false)
  })
  return()=>controller.abort()
 },[id,userId,version])
 useEffect(()=>{const update=()=>{if(!document.hidden)setVersion(v=>v+1)};window.addEventListener('focus',update);const timer=window.setInterval(update,30_000);return()=>{window.removeEventListener('focus',update);window.clearInterval(timer)}},[])
 const available=data&&opportunityAvailable(data.vacancy)
 return <dialog ref={dialog} aria-labelledby={prefix+'-title'} onCancel={e=>{e.preventDefault();onClose()}} onKeyDown={e=>{
   if(e.key!=='Tab')return
   const elements=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],textarea:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(el=>el.tabIndex>=0&&el.getClientRects().length>0)
   const first=elements[0],last=elements.at(-1)
   if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus({preventScroll:true})}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus({preventScroll:true})}
  }} onClick={e=>{if(e.target===e.currentTarget){const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)onClose()}}} className="fixed inset-0 m-auto open:flex max-h-[94dvh] w-[calc(100%_-_1rem)] max-w-3xl flex-col overflow-hidden rounded-2xl border border-card-outline bg-card text-card-foreground shadow-2xl backdrop:bg-black/65 sm:max-h-[88dvh]">
  <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4 sm:p-5"><div className="min-w-0"><h2 id={prefix+'-title'} className="break-words text-xl font-bold">{data?.vacancy.title||'Detalhes da oportunidade'}</h2>{data&&<p className="mt-1 break-words text-sm text-muted-foreground">{data.project.title}</p>}</div><Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Fechar detalhes da vaga" onClick={onClose}><X aria-hidden/></Button></header>
  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
   {busy&&<p role="status" className="text-sm text-muted-foreground">{data?'Atualizando oportunidade…':'Carregando oportunidade…'}</p>}
   {error&&<div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button size="sm" variant="outline" onClick={()=>setVersion(v=>v+1)}>Tentar novamente</Button></div>}
   {!user&&!sessionLoading&&<Button asChild><Link href={'/login?next='+encodeURIComponent('/meu-espaco/vagas?vaga='+id)}>Entrar para ver a oportunidade</Link></Button>}
   {data===null&&!error&&<p role="status">Esta oportunidade não está mais disponível.</p>}
   {data&&<><div role="tablist" aria-label="Informações da oportunidade" className="flex gap-2 border-b pb-3">{['Sobre a vaga','Sobre o projeto'].map((label,index)=><button key={label} ref={el=>{tabButtons.current[index]=el}} type="button" role="tab" id={prefix+'-tab-'+index} aria-controls={prefix+'-panel-'+index} aria-selected={tab===index} tabIndex={tab===index?0:-1} className={'min-h-10 rounded-xl px-3 py-2 text-sm font-semibold '+(tab===index?'bg-primary text-primary-foreground':'bg-muted text-muted-foreground hover:text-foreground')} onClick={()=>setTab(index)} onKeyDown={e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-index;setTab(next);tabButtons.current[next]?.focus()}}}>{label}</button>)}</div>
   <div role="tabpanel" tabIndex={0} id={prefix+'-panel-'+tab} aria-labelledby={prefix+'-tab-'+tab} className="min-w-0 space-y-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
    {tab===0?<><p role="status" className="text-sm font-medium text-primary">{available?availablePositions(data.vacancy.available)+' · Aberta':'Vaga indisponível para novas candidaturas.'}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{data.vacancy.description||'Nenhuma descrição informada.'}</p><VacancySkills skills={data.vacancy.skills}/>
     {data.member?<p className="text-sm text-muted-foreground">Você já participa deste projeto. Use Meus projetos para acessar as ferramentas autorizadas.</p>:<ApplyButton key={data.project.id} projectId={data.project.id} title={data.project.title} vacancies={data.vacancies} userId={userId} canApply={Boolean(available)&&!error} isVisitor={!user} applications={applications} target={target} setTarget={setTarget} embedded label="Candidatar-se" initialVacancy={id} onRefresh={reload}/>}
    </>:<><h3 className="break-words text-lg font-semibold">{data.project.title}</h3><p className="text-sm text-muted-foreground">{[data.project.category,...(data.project.secondary_categories??[])].filter(Boolean).join(' · ')} · {PROJECT_STATUS_LABEL[data.project.status]}</p>{data.project.short_description&&<ProjectSummary text={data.project.short_description}/>}<ProjectSummary text={data.project.description||'Nenhuma descrição informada.'}/><VacancySkills skills={data.project.tags} label="Tags do projeto"/>{data.project.members.length>0&&<section className="space-y-3" aria-label="Equipe pública"><h3 className="font-semibold">Equipe</h3><ul className="grid gap-3 sm:grid-cols-2">{data.project.members.map(m=><li key={m.user_id}><Link href={'/usuarios/'+m.user_id} className="flex min-w-0 items-center gap-2 rounded-xl border p-2 hover:bg-muted"><UserAvatar name={m.name||'Integrante'} imageUrl={m.avatar??undefined} sizeClassName="size-8 shrink-0"/><span className="min-w-0 break-words text-sm">{m.name||'Integrante'}{m.display_role&&<small className="block text-muted-foreground">{m.display_role}</small>}</span></Link></li>)}</ul></section>}</>}
    <Button asChild variant="outline"><Link href={'/projetos/'+data.project.slug}>Ver projeto completo<ArrowRight className="size-4" aria-hidden/></Link></Button>
   </div></>}
  </div>
 </dialog>
}

export function ExploreVacancies() {
 const router=useRouter(),pathname=usePathname(),params=useSearchParams(),filters=opportunityFilters(new URLSearchParams(params.toString()))
 const [search,setSearch]=useState(filters.search),[selected,setSelected]=useState<string|null>(params.get('vaga'))
 const filterKey=JSON.stringify(filters)
 const {user}=useSupabaseSession()
 const request=useCallback((token:string)=>loadRankedVacancies(token,JSON.parse(filterKey) as OpportunityFilters),[filterKey])
 const {data,busy,error,refresh}=useRecommendationRefresh(user?.id,(user?.id??'')+':vacancies:'+filterKey,request)
 const filterRef=useRef(filters)
 useEffect(()=>{filterRef.current=JSON.parse(filterKey)},[filterKey])
 const update=useCallback((patch:Partial<OpportunityFilters>)=>{const f={...filterRef.current,...patch};filterRef.current=f;router.replace(pathname+(opportunityParams(f).size?'?'+opportunityParams(f):''),{scroll:false})},[router,pathname])
 useEffect(()=>{setSearch(filters.search)},[filters.search])
 useEffect(()=>{if(search===filters.search)return;const timer=window.setTimeout(()=>update({search:search.trim(),page:0}),350);return()=>window.clearTimeout(timer)},[search,filters.search,update])
 useEffect(()=>{setSelected(params.get('vaga'))},[params])
 function open(id:string){setSelected(id);router.replace(pathname+'?'+opportunityParams(filters,id),{scroll:false})}
 function close(){setSelected(null);router.replace(pathname+(opportunityParams(filters).size?'?'+opportunityParams(filters):''),{scroll:false})}
 return <div className="min-w-0 space-y-6"><header className="space-y-2"><h1 className="text-2xl font-bold sm:text-3xl">Explorar vagas</h1><p className="text-sm text-muted-foreground">Encontre oportunidades para colaborar em projetos.</p></header><section aria-label="Pesquisar oportunidades" className={card+' space-y-4'}><label className="block space-y-2 text-sm"><span>Buscar oportunidades</span><Input aria-label="Buscar vagas, habilidades ou projetos" placeholder="Buscar vagas, habilidades ou projetos..." maxLength={120} value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="workspace-filters workspace-filters--vacancies"><label className="text-sm leading-5"><span>Categoria</span><select value={filters.category} onChange={e=>update({category:e.target.value,page:0})} className="h-11 w-full rounded-xl border bg-background p-2 text-foreground"><option value="">Todas</option>{projectCategories.map(c=><option key={c} value={c}>{c}</option>)}</select></label><ConceptChipInput label="Habilidade desejada" className="[&_label]:leading-5" optional maxItems={1} maxLength={120} allowProposals={false} value={filters.skill?[{id:filters.skill,label:filters.skill_name}]:[]} onChange={choices=>update({skill:choices[0]?.id??'',skill_name:choices[0]?.label??'',page:0})} helperText="Selecione um conceito. A busca textual também inclui habilidades antigas."/><label className="text-sm leading-5"><span>Ordenação</span><select className="h-11 w-full rounded-xl border bg-background p-2 text-foreground" value={filters.sort} onChange={e=>update({sort:e.target.value as OpportunityFilters['sort'],page:0})}><option value="recommended">Recomendados primeiro</option><option value="recent">Mais recentes</option><option value="name">Nome da vaga</option></select></label></div><Button type="button" size="sm" variant="ghost" onClick={()=>{setSearch('');update({search:'',category:'',skill:'',skill_name:'',sort:'recommended',page:0})}}>Limpar filtros</Button></section>
 {busy&&!data&&<p role="status" className="text-sm text-muted-foreground">Carregando vagas…</p>}{data?.rankingFailed&&<p role="status" className="text-xs text-muted-foreground">As vagas estão disponíveis. Não foi possível atualizar as sugestões.</p>}{error&&<div role="alert" className={card+' space-y-2'}><p className="text-sm">{error}</p><Button variant="outline" onClick={refresh}>Tentar novamente</Button></div>}
 {data&&<><p role="status" className="text-sm text-muted-foreground">{data.total} oportunidade(s) disponível(is).</p><div className="grid min-w-0 items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">{data.items.map(item=><OpportunityCard key={item.id} item={item} onOpen={()=>open(item.id)}/>)}</div>{!data.items.length&&<p className={card+' text-sm text-muted-foreground'}>Nenhuma vaga encontrada com estes filtros.</p>}<nav aria-label="Paginação de vagas" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>Página {data.page+1} · {data.total?data.page*data.size+1:0}–{Math.min((data.page+1)*data.size,data.total)} de {data.total}</span><div className="flex gap-2"><Button variant="outline" disabled={!filters.page||busy} onClick={()=>update({page:filters.page-1})}>Anterior</Button><Button variant="outline" disabled={(filters.page+1)*data.size>=data.total||busy} onClick={()=>update({page:filters.page+1})}>Próxima</Button></div></nav></>}
 {selected&&<VacancyPreview key={selected} id={selected} onClose={close} onChanged={refresh}/>}
 </div>
}

export function RecentVacancies() {
 const {data,busy,error,refresh}=useOpportunities({size:3}),[selected,setSelected]=useState<string|null>(null)
 return <section className={card+' space-y-4'} aria-labelledby="recent-vacancies"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="recent-vacancies" className="text-lg font-semibold">Vagas abertas recentemente</h2><Link href="/meu-espaco/vagas" className="text-sm font-medium text-primary hover:underline">Ver todas as vagas</Link></div>{busy&&!data&&<p role="status" className="text-sm text-muted-foreground">Carregando oportunidades…</p>}{error&&<div role="alert"><p className="text-sm">{error}</p><Button size="sm" variant="outline" onClick={refresh}>Tentar novamente</Button></div>}{data&&!data.items.length&&<p className="text-sm text-muted-foreground">Nenhuma vaga aberta em outros projetos no momento.</p>}<div className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">{data?.items.map(item=><OpportunityCard key={item.id} item={item} compact onOpen={()=>setSelected(item.id)}/>)}</div>{selected&&<VacancyPreview key={selected} id={selected} onClose={()=>setSelected(null)} onChanged={refresh}/>}</section>
}
