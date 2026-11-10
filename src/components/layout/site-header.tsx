"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"
import { Briefcase, Compass, Home, Info, LogOut, Menu, MessageCircle, Moon, LayoutDashboard, Sun, X, CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu"
import { Container } from "@/components/layout/container"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { UserAvatar } from "@/components/team-link/user-avatar"
import { useThemeMode } from "@/components/providers/theme-provider"
import { useProfilePresence } from "@/hooks/use-profile-presence"
import { useSupabaseSession } from "@/hooks/use-supabase-session"
import { cn } from "@/lib/utils"
import { usePendingFriendships } from '@/components/profile/friendships-provider'

const friendshipRequestsHref = '/meu-espaco/amigos?secao=recebidas'

function PendingFriendshipBadge({ count, avatar = false }: { count: number; avatar?: boolean }) {
  if (!count) return null
  return <span aria-label={`${count} solicitações de amizade recebidas pendentes`} className={cn('inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground', avatar && 'absolute -bottom-1 -right-2 ring-2 ring-background')}>{count}</span>
}

const primaryLinks = [
  { href: "/", label: "Início", icon: Home },
  { href: "/explorar", label: "Projetos publicados", icon: Compass },
  { href: "/sobre", label: "Sobre", icon: Info },
  { href: "/ajuda", label: "Ajuda", icon: CircleHelp },
]

function AppearanceChoices() {
  const {darkMode,setTheme}=useThemeMode()
  return <><DropdownMenuLabel>Aparência</DropdownMenuLabel><DropdownMenuRadioGroup aria-label="Aparência" value={darkMode?'dark':'light'} onValueChange={value=>{if(value==='dark'||value==='light')setTheme(value)}}><DropdownMenuRadioItem value="dark"><Moon aria-hidden className="size-4"/> Escuro</DropdownMenuRadioItem><DropdownMenuRadioItem value="light"><Sun aria-hidden className="size-4"/> Claro</DropdownMenuRadioItem></DropdownMenuRadioGroup></>
}
function MobileAppearance() {
  const {darkMode,setTheme}=useThemeMode()
  return <fieldset className="space-y-2 rounded-xl border p-3"><legend className="px-1 text-sm font-semibold">Aparência</legend><div className="flex gap-5 text-sm"><label className="flex items-center gap-2"><input type="radio" name="mobile-theme" checked={darkMode} onChange={()=>setTheme('dark')}/>Escuro</label><label className="flex items-center gap-2"><input type="radio" name="mobile-theme" checked={!darkMode} onChange={()=>setTheme('light')}/>Claro</label></div></fieldset>
}

function HeaderShell({
  fullBleed,
  className,
  children,
}: {
  fullBleed: boolean
  className?: string
  children: React.ReactNode
}) {
  if (fullBleed) {
    return (
      <div className={cn("w-full px-4 sm:px-6 lg:px-8", className)}>
        {children}
      </div>
    )
  }
  return <Container className={className}>{children}</Container>
}

function PresenceNotice({ userId }: { userId: string }) {
  const key = 'team-link:presence-default-notice:' + userId
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try { setVisible(localStorage.getItem(key) !== 'read') }
    catch { setVisible(true) }
  }, [key])

  if (!visible) return null
  return <aside aria-label="Aviso de privacidade" className="border-b border-border bg-muted/60">
    <Container className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
      <p className="min-w-0 flex-1">O status online passou a vir ativado por padrão, inclusive nas contas existentes. Só amigos aceitos podem ver sua presença. <Link href="/meu-espaco/configuracoes#privacidade" className="font-semibold text-primary underline">Alterar em Privacidade</Link></p>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Dispensar aviso de privacidade" onClick={() => {
        try { localStorage.setItem(key, 'read') } catch { /* The dismissal still applies for this session. */ }
        setVisible(false)
      }}><X className="size-4" aria-hidden /></Button>
    </Container>
  </aside>
}

export function SiteHeader({ fullBleed = false, workspace = false }: { fullBleed?: boolean; workspace?: boolean }) {
  const router = useRouter()
  const pathname=usePathname()
  const mobilePanel=useRef<HTMLDivElement>(null)
  const { isAuthenticated, profile, user, signOut } = useSupabaseSession()
  useProfilePresence(user?.id)
  const pendingFriendships = usePendingFriendships()
  const [mobileOpen, setMobileOpen] = useState(false)

  const displayName =
    profile?.full_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    ""
  const displayEmail = user?.email ?? ""
  const avatarUrl = profile?.avatar_url ?? undefined

  const closeMobile = useCallback(() => {
    setMobileOpen(false)
  }, [])
  useEffect(() => { if(workspace)closeMobile() },[workspace,closeMobile])

  useEffect(() => {
    if (!mobileOpen) return

    // Lock the viewport without making the body a scroll container for the sticky header.
    const viewport = document.documentElement
    const { overflow, scrollbarGutter } = viewport.style
    if (viewport.clientWidth < window.innerWidth) {
      viewport.style.scrollbarGutter = "stable"
    }
    viewport.style.overflow = "hidden"

    const previousFocus=document.activeElement as HTMLElement|null
    const focusable=()=>Array.from(mobilePanel.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])')??[]).filter(element=>!(element instanceof HTMLInputElement&&element.type==='radio')||element.checked)
    focusable()[0]?.focus({preventScroll:true})
    function handleKeyDown(event: KeyboardEvent) {
      if(event.key==='Tab'){const list=focusable(),first=list[0],last=list.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}
      if (event.key === "Escape") {
        closeMobile()
      }
    }

    const desktopQuery = window.matchMedia("(min-width: 1024px)")
    function handleBreakpointChange(event: MediaQueryListEvent) {
      if (event.matches) {
        closeMobile()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    desktopQuery.addEventListener("change", handleBreakpointChange)
    return () => {
      previousFocus?.focus({preventScroll:true})
      viewport.style.overflow = overflow
      viewport.style.scrollbarGutter = scrollbarGutter
      window.removeEventListener("keydown", handleKeyDown)
      desktopQuery.removeEventListener("change", handleBreakpointChange)
    }
  }, [closeMobile, mobileOpen])

  useEffect(() => { const otherMenu=(event:Event)=>{if((event as CustomEvent).detail!=='header')closeMobile()};window.addEventListener('team-link:navigation-open',otherMenu);return()=>window.removeEventListener('team-link:navigation-open',otherMenu) },[closeMobile])

  async function handleSignOut() {
    closeMobile()
    await signOut()
    router.replace("/")
  }

  return (
    <>
      <header className={cn(!workspace && 'dark team-link-header', workspace && 'h-16', 'text-foreground sticky top-0 z-[60] w-full border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75')}>
        <HeaderShell fullBleed={fullBleed} className={cn('flex min-w-0 items-center justify-between gap-2 sm:gap-3', workspace ? 'h-full' : 'h-[72px]')}>
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4 lg:gap-6">
            {workspace && <Button type="button" variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Menu do Meu Espaço" aria-haspopup="dialog" aria-controls="workspace-navigation" onClick={() => window.dispatchEvent(new Event('team-link:workspace-toggle'))}><Menu className="size-5" aria-hidden /></Button>}
            <Link
              href="/"
              className="flex min-w-0 shrink items-center gap-2 font-bold tracking-tight text-foreground"
            >
              <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="shrink-0" />
              <span className="truncate text-base sm:text-lg">Team Link</span>
            </Link>

            {!workspace && <nav
              aria-label="Principal"
              className="hidden items-center gap-4 text-sm font-semibold text-foreground/90 lg:flex xl:gap-5"
            >
              {primaryLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap transition-colors hover:text-primary focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                >
                  {item.label}
                </Link>
              ))}
            </nav>}
            {workspace && <span className="hidden border-l border-border pl-4 text-xs font-medium text-muted-foreground sm:inline">Meu Espaço</span>}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">


          {isAuthenticated&&!workspace&&<Button asChild size="sm" className="hidden rounded-xl font-semibold lg:inline-flex"><Link href="/meu-espaco" aria-current={pathname.startsWith('/meu-espaco')?'page':undefined}><LayoutDashboard className="size-4" aria-hidden/>Meu Espaço</Link></Button>}
          <div id="chat-launcher-slot" className="flex shrink-0 items-center" />
          <NotificationBell />

          <div className={cn('items-center gap-2', workspace ? 'flex' : 'hidden lg:flex')}>
            {isAuthenticated ? (
              <DropdownMenu key="account" modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={workspace ? 'Menu da conta' : undefined}
                    className="flex items-center gap-2 rounded-full px-2"
                  >
                    <span className="relative shrink-0"><UserAvatar name={displayName} imageUrl={avatarUrl} sizeClassName="h-9 w-9" /><PendingFriendshipBadge count={pendingFriendships} avatar /></span>
                    <span className={cn('max-w-32 truncate text-sm font-semibold xl:max-w-48', workspace && 'hidden sm:inline')}>{displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={14}
                  collisionPadding={16}
                  forceMount
                  className="z-[70] w-64 rounded-2xl border border-border/70 bg-popover/95 p-2 shadow-2xl shadow-black/15 backdrop-blur-xl dark:shadow-black/40"
                >
                  <div className="flex items-center gap-3 px-2 py-2">
                    <UserAvatar name={displayName} imageUrl={avatarUrl} sizeClassName="h-10 w-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
                    </div>
                  </div>
                  <DropdownMenuSeparator className="my-1.5" />
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    <Link href="/meu-espaco/perfil">Perfil</Link>
                  </DropdownMenuItem>
                  {!workspace && <><DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"><Link href="/meu-espaco">Meu Espaço</Link></DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    <Link href="/meu-espaco/projetos">Meus projetos</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    <Link href="/meu-espaco/mensagens">Mensagens</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium">
                    <Link href={friendshipRequestsHref} className="flex items-center justify-between gap-2">Solicitações de amizade <PendingFriendshipBadge count={pendingFriendships} /></Link>
                  </DropdownMenuItem></>}
                  <DropdownMenuItem asChild><Link href="/meu-espaco/configuracoes">Configurações</Link></DropdownMenuItem>
                  {workspace && <><DropdownMenuSeparator /><AppearanceChoices /></>}
                  <DropdownMenuSeparator className="my-1.5" />
                  <DropdownMenuItem
                    variant="destructive"
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
                    onSelect={(event) => {
                      event.preventDefault()
                      void handleSignOut()
                    }}
                  >
                    Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <DropdownMenu key="appearance" modal={false}><DropdownMenuTrigger asChild><Button variant="ghost" className="font-semibold">Aparência</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><AppearanceChoices/></DropdownMenuContent></DropdownMenu>
                <Button variant="ghost" asChild className="font-semibold">
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button asChild className="font-semibold">
                  <Link href="/cadastro">Cadastrar</Link>
                </Button>
              </>
            )}
          </div>

          {!workspace && <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative lg:hidden"
            onClick={() => { window.dispatchEvent(new CustomEvent('team-link:navigation-open', {detail:'header'})); setMobileOpen(true) }}
            aria-label="Abrir menu de navegação"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
          >
            <Menu className="h-5 w-5" aria-hidden />
            <PendingFriendshipBadge count={pendingFriendships} avatar />
          </Button>}
          </div>
        </HeaderShell>
      </header>
      {user && !fullBleed && <PresenceNotice key={user.id} userId={user.id} />}

      {mobileOpen && !workspace ? (
        <div
          ref={mobilePanel}
          id="mobile-nav-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className="fixed inset-0 z-[100] flex flex-col bg-background backdrop-blur-xl lg:hidden"
        >
          <div className="dark team-link-header text-foreground border-b border-border/70 bg-background">
            <HeaderShell fullBleed={fullBleed} className="flex h-[72px] items-center justify-between gap-3">
              <Link
                href="/"
                onClick={closeMobile}
                className="flex min-w-0 shrink items-center gap-2 font-bold tracking-tight text-foreground"
              >
                <Image src="/icons/icon-192.png" alt="" width={36} height={36} className="shrink-0" />
                <span className="truncate text-lg">Team Link</span>
              </Link>
              <div className="flex shrink-0 items-center gap-1">

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={closeMobile}
                  aria-label="Fechar menu"
                  className="h-10 w-10"
                >
                  <X className="h-5 w-5" aria-hidden />
                </Button>
              </div>
            </HeaderShell>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background">
            <HeaderShell fullBleed={fullBleed} className="flex flex-col gap-4 py-5">
              <nav aria-label="Navegação principal" className="flex flex-col gap-1 text-base font-semibold">
                {primaryLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobile}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                  >
                    <item.icon className="size-4 text-muted-foreground" aria-hidden /> {item.label}
                  </Link>
                ))}
              </nav>

              <div className="h-px w-full bg-border" />

              {isAuthenticated ? (
                <div className="flex flex-col gap-3">
                  <Button asChild className="w-full font-semibold"><Link href="/meu-espaco" onClick={closeMobile} aria-current={pathname.startsWith('/meu-espaco')?'page':undefined}><LayoutDashboard aria-hidden/>Meu Espaço</Link></Button>

                <Link href="/meu-espaco/perfil" onClick={closeMobile} className="flex items-center gap-3 rounded-2xl border border-card-outline bg-card p-3 hover:bg-muted">
                  <span className="relative shrink-0"><UserAvatar name={displayName} imageUrl={avatarUrl} sizeClassName="h-12 w-12 shrink-0" /><PendingFriendshipBadge count={pendingFriendships} avatar /></span>
                  <span className="min-w-0 break-words text-sm font-semibold">Perfil · {displayName}</span>
                </Link>

                  <Button asChild variant="secondary" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/meu-espaco/projetos"><Briefcase aria-hidden /> Meus projetos</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/meu-espaco/mensagens"><MessageCircle aria-hidden /> Mensagens</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href={friendshipRequestsHref}>Solicitações de amizade <PendingFriendshipBadge count={pendingFriendships} /></Link>
                  </Button>
                  <Button asChild variant="secondary"><Link href="/meu-espaco/configuracoes" onClick={closeMobile}>Configurações</Link></Button>
                  <div className="h-px bg-border"/>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      void handleSignOut()
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" aria-hidden />
                    Sair
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <Button asChild variant="outline" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/login">Entrar</Link>
                  </Button>
                  <Button asChild className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/cadastro">Cadastrar</Link>
                  </Button>
                </div>
              )}
              {!isAuthenticated&&<MobileAppearance/>}
            </HeaderShell>
          </div>
        </div>
      ) : null}
    </>
  )
}
