'use client'

import Link from 'next/link'
import {WorkspaceLoading} from '@/components/layout/workspace-loading'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { PanelLeftClose,PanelLeftOpen,X } from 'lucide-react'
import {WorkspaceNavigation} from './workspace-navigation'
import {useWorkspaceProjects} from '@/hooks/use-workspace-projects'
import {internalProject,sidebarPreferenceKey} from '@/lib/workspace-navigation'
import { Button } from '@/components/ui/button'
import { usePendingFriendships } from '@/components/profile/friendships-provider'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { MySpace } from '@/lib/my-space'

type CacheEntry = { data: MySpace; at: number }
const Cache = createContext<Map<string, CacheEntry> | null>(null)
export function useWorkspaceCache() { return useContext(Cache)! }

const navigationEvent='team-link:navigation-open'

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter()
  const { user, loading, signOut } = useSupabaseSession()
  const userId=user?.id
  const hadSession = useRef(false)
  const projectRoute=internalProject(pathname),reference=projectRoute?.reference??null
  const projects=useWorkspaceProjects(user?.id,reference),count=usePendingFriendships()
  const [preference,setPreference]=useState<{user:string;collapsed:boolean}>(),[projectsOpen,setProjectsOpen]=useState(false)
  const collapsed=preference?.user===user?.id&&preference?.collapsed===true
  useEffect(()=>{if(!userId)return;let value=false;try{value=localStorage.getItem(sidebarPreferenceKey(userId))==='collapsed'}catch{}setPreference({user:userId,collapsed:value})},[userId])
  useEffect(()=>{if(reference)setProjectsOpen(true)},[reference])
  function setCollapsed(value:boolean){if(!user)return;setPreference({user:user.id,collapsed:value});try{localStorage.setItem(sidebarPreferenceKey(user.id),value?'collapsed':'expanded')}catch{}}
  function toggleProjects(mobile=false){if(collapsed&&!mobile){setCollapsed(false);setProjectsOpen(true)}else setProjectsOpen(value=>!value)}
  const navProps={count,projects,signOut,expanded:projectsOpen,onLogout:()=>router.replace('/')}

  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const cache = useRef(new Map<string, CacheEntry>())
  const cacheUser = useRef(user?.id)
  if (cacheUser.current !== user?.id) { cache.current.clear(); cacheUser.current = user?.id }
  useEffect(() => {
    if (loading) return
    if (user) { hadSession.current = true; return }
    if (!hadSession.current) router.replace('/login?next=' + encodeURIComponent(pathname + (params.size ? '?' + params.toString() : '')))
  }, [loading, user, pathname, params, router])
  useEffect(() => { setOpen(false) }, [pathname, params])
  useEffect(() => {
    const close = () => setOpen(false)
    const toggle = () => setOpen(value => !value)
    const otherMenu = (event: Event) => { if ((event as CustomEvent).detail !== 'workspace') close() }
    const desktop = matchMedia('(min-width: 1024px)')
    const resized = () => { if (desktop.matches) close() }
    window.addEventListener(navigationEvent, otherMenu)
    window.addEventListener('team-link:workspace-toggle', toggle)
    desktop.addEventListener('change', resized)
    return () => { window.removeEventListener(navigationEvent, otherMenu); window.removeEventListener('team-link:workspace-toggle', toggle); desktop.removeEventListener('change', resized) }
  }, [])
  useEffect(() => {
    if (!open) return
    const element = dialog.current, previous = document.activeElement as HTMLElement | null
    const viewport = document.documentElement, { overflow, scrollbarGutter } = viewport.style
    window.dispatchEvent(new CustomEvent(navigationEvent, { detail: 'workspace' }))
    if (viewport.clientWidth < innerWidth) viewport.style.scrollbarGutter = 'stable'
    viewport.style.overflow = 'hidden'
    element?.showModal()
    return () => { element?.close(); viewport.style.overflow = overflow; viewport.style.scrollbarGutter = scrollbarGutter; previous?.focus({ preventScroll: true }) }
  }, [open])
  if (loading||(user&&preference?.user!==user.id)) return <WorkspaceLoading />
  if (!user) return <div className="space-y-4 p-8"><h1 className="text-2xl font-bold">Entre para acessar Meu Espaço</h1><Button asChild><Link href={'/login?next=' + encodeURIComponent(pathname)}>Entrar</Link></Button></div>
  const messages = pathname === '/meu-espaco/mensagens'
  return <Cache.Provider value={cache.current}><div style={{'--workspace-sidebar-width':collapsed?'72px':'240px'} as React.CSSProperties} className="mx-auto grid w-full min-w-0 max-w-[1600px] motion-safe:transition-[grid-template-columns] motion-safe:duration-150 lg:grid-cols-[var(--workspace-sidebar-width)_minmax(0,1fr)]">
    <aside id="workspace-sidebar" aria-label="Menu lateral do Meu Espaço" className={'sticky top-[var(--site-header-height)] hidden h-[calc(100dvh-var(--site-header-height))] min-w-0 self-start workspace-scroll overflow-y-auto overscroll-contain border-r border-border bg-card/40 lg:flex lg:flex-col '+(collapsed?'p-2':'p-3')}>
     <div className={'mb-3 flex items-center '+(collapsed?'justify-center':'justify-between gap-2 px-2')}>
      {!collapsed&&<p className="text-base font-bold">Meu Espaço</p>}
      <Button type="button" variant="ghost" size="icon" className="shrink-0" title={collapsed?'Expandir menu lateral':'Recolher menu lateral'} aria-label={collapsed?'Expandir menu lateral':'Recolher menu lateral'} aria-expanded={!collapsed} aria-controls="workspace-sidebar" onClick={()=>setCollapsed(!collapsed)}>{collapsed?<PanelLeftOpen className="size-4" aria-hidden/>:<PanelLeftClose className="size-4" aria-hidden/>}</Button>
     </div><WorkspaceNavigation {...navProps} collapsed={collapsed} onProjects={()=>toggleProjects()}/>
    </aside>
    <div className="min-w-0">
      <main id="workspace-content" className={projectRoute ? 'min-w-0 pb-16' : messages ? 'workspace-messages flex h-[calc(100dvh-var(--site-header-height))] min-h-0 min-w-0 flex-col' : 'min-w-0 space-y-6 p-4 pb-24 sm:p-6 sm:pb-24 xl:p-8 xl:pb-24'}>
       {projectRoute&&!/\/painel\/?$/.test(pathname)&&<nav aria-label="Caminho do projeto" className="flex min-w-0 flex-wrap items-center gap-2 border-b px-4 py-3 text-xs text-muted-foreground sm:px-6 lg:px-8"><Link href="/meu-espaco/projetos" className="text-primary hover:underline">Meus projetos</Link><span aria-hidden>/</span>{projects.data?.current&&<><Link href={'/projetos/'+encodeURIComponent(projects.data.current.slug)} title={projects.data.current.title} className="max-w-64 truncate text-primary hover:underline">{projects.data.current.title}</Link><span aria-hidden>/</span></>}<span>{projectRoute.editing?'Editar projeto':pathname.endsWith('/atividades')?'Atividades':pathname.endsWith('/relatorios')?'Documentação com IA':pathname.endsWith('/candidaturas')?'Candidaturas':'Painel'}</span></nav>}
       {children}</main>
    </div>
    <dialog ref={dialog} id="workspace-navigation" aria-label="Navegação do Meu Espaço" onCancel={event => { event.preventDefault(); setOpen(false) }} onClick={event => {
      if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false) }
    }} className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[min(280px,90vw)] max-w-none workspace-scroll overflow-y-auto border-r border-border bg-card p-4 text-card-foreground shadow-xl backdrop:bg-black/60">
      <div className="mb-6 flex items-center justify-between gap-3"><strong>Meu Espaço</strong><Button size="icon" variant="ghost" aria-label="Fechar navegação do Meu Espaço" onClick={() => setOpen(false)}><X aria-hidden /></Button></div><div className="flex min-h-[calc(100dvh-104px)] flex-col"><WorkspaceNavigation {...navProps} mobile onProjects={()=>toggleProjects(true)} close={() => setOpen(false)} /></div>
    </dialog>
  </div></Cache.Provider>
}
