'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Briefcase, CheckSquare, FileUser, LayoutDashboard, LogOut, Menu, MessageCircle, Settings, UserRound, Users, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePendingFriendships } from '@/components/profile/friendships-provider'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { MySpace } from '@/lib/my-space'

type CacheEntry = { data: MySpace; at: number }
const Cache = createContext<Map<string, CacheEntry> | null>(null)
export function useWorkspaceCache() { return useContext(Cache)! }

const groups = [
  { title: 'Principal', items: [
    { href: '/meu-espaco', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/meu-espaco/projetos', label: 'Meus projetos', icon: Briefcase },
    { href: '/meu-espaco/atividades', label: 'Minhas atividades', icon: CheckSquare },
    { href: '/meu-espaco/candidaturas', label: 'Minhas candidaturas', icon: FileUser },
  ] },
  { title: 'Conexões', items: [
    { href: '/meu-espaco/mensagens', label: 'Mensagens', icon: MessageCircle },
    { href: '/meu-espaco/amigos', label: 'Amigos', icon: Users },
    { href: '/meu-espaco/perfil', label: 'Meu perfil', icon: UserRound },
  ] },
  { title: 'Conta', items: [{ href: '/meu-espaco/configuracoes', label: 'Configurações', icon: Settings }] },
]
const navigationEvent = 'team-link:navigation-open'

function WorkspaceNavigation({ close }: { close?: () => void }) {
  const pathname = usePathname(), router = useRouter()
  const count = usePendingFriendships()
  const { signOut } = useSupabaseSession()
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <nav aria-label="Meu Espaço" className="flex min-h-0 flex-1 flex-col gap-6">
    {groups.map(group => <div key={group.title} className={group.title === 'Conta' ? 'mt-auto' : ''}>
      <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{group.title}</p>
      <ul className="space-y-1">{group.items.map(item => {
        const active = item.href === '/meu-espaco' ? pathname === item.href : pathname.startsWith(item.href)
        return <li key={item.href}><Link href={item.href} onClick={close} aria-current={active ? 'page' : undefined}
          className={'flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary ' + (active ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
          <item.icon className="size-4 shrink-0" aria-hidden /><span className="min-w-0 flex-1">{item.label}</span>
          {item.label === 'Amigos' && count > 0 && <span aria-label={count + ' solicitações recebidas'} className="rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">{count}</span>}
        </Link></li>
      })}</ul>
    </div>)}
    <div className="border-t border-border pt-3"><Button variant="ghost" disabled={busy} className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={async () => {
      setBusy(true); setError(''); close?.()
      try { await signOut(); router.replace('/') } catch { setError('Não foi possível sair. Tente novamente.'); setBusy(false) }
    }}><LogOut aria-hidden className="size-4" />{busy ? 'Saindo…' : 'Sair'}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}</div>
  </nav>
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(), params = useSearchParams(), router = useRouter()
  const { user, loading } = useSupabaseSession()
  const hadSession = useRef(false)
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
    const otherMenu = (event: Event) => { if ((event as CustomEvent).detail !== 'workspace') close() }
    const desktop = matchMedia('(min-width: 1024px)')
    const resized = () => { if (desktop.matches) close() }
    window.addEventListener(navigationEvent, otherMenu)
    desktop.addEventListener('change', resized)
    return () => { window.removeEventListener(navigationEvent, otherMenu); desktop.removeEventListener('change', resized) }
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
  if (loading) return <p role="status" className="p-8">Carregando Meu Espaço…</p>
  if (!user) return <div className="space-y-4 p-8"><h1 className="text-2xl font-bold">Entre para acessar Meu Espaço</h1><Button asChild><Link href={'/login?next=' + encodeURIComponent(pathname)}>Entrar</Link></Button></div>
  const label = groups.flatMap(group => group.items).find(item => item.href === pathname || (item.href !== '/meu-espaco' && pathname.startsWith(item.href)))?.label || 'Meu Espaço'
  const messages = pathname === '/meu-espaco/mensagens'
  return <Cache.Provider value={cache.current}><div className="mx-auto grid w-full min-w-0 max-w-[1600px] lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="sticky top-[72px] hidden h-[calc(100dvh-72px)] min-w-0 self-start overflow-y-auto overscroll-contain border-r border-border bg-card/40 p-4 lg:flex lg:flex-col"><p className="mb-6 px-3 text-lg font-bold">Meu Espaço</p><WorkspaceNavigation /></aside>
    <div className="min-w-0">
      <div className="sticky top-[72px] z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 lg:hidden"><span className="text-sm font-semibold">{label}</span><Button size="sm" variant="outline" aria-haspopup="dialog" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(true)}><Menu aria-hidden className="size-4" />Menu do Meu Espaço</Button></div>
      <main id="workspace-content" className={messages ? 'workspace-messages flex h-[calc(100dvh-128px)] min-h-0 min-w-0 flex-col lg:h-[calc(100dvh-72px)]' : 'min-w-0 space-y-6 p-4 pb-24 sm:p-6 sm:pb-24 xl:p-8 xl:pb-24'}>{children}</main>
    </div>
    <dialog ref={dialog} id="workspace-navigation" aria-label="Navegação do Meu Espaço" onCancel={event => { event.preventDefault(); setOpen(false) }} onClick={event => {
      if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setOpen(false) }
    }} className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-dvh w-[min(280px,90vw)] max-w-none overflow-y-auto border-r border-border bg-card p-4 text-card-foreground shadow-xl backdrop:bg-black/60">
      <div className="mb-6 flex items-center justify-between gap-3"><strong>Meu Espaço</strong><Button size="icon" variant="ghost" aria-label="Fechar navegação do Meu Espaço" onClick={() => setOpen(false)}><X aria-hidden /></Button></div><div className="flex min-h-[calc(100dvh-104px)] flex-col"><WorkspaceNavigation close={() => setOpen(false)} /></div>
    </dialog>
  </div></Cache.Provider>
}
