"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Briefcase, Compass, Home, Info, Link2, LogOut, Menu, MessageCircle, Moon, Plus, Sun, X, CircleHelp } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Container } from "@/components/layout/container"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { UserAvatar } from "@/components/team-link/user-avatar"
import { useThemeMode } from "@/components/providers/theme-provider"
import { useProfilePresence } from "@/hooks/use-profile-presence"
import { useSupabaseSession } from "@/hooks/use-supabase-session"
import { cn } from "@/lib/utils"

const primaryLinks = [
  { href: "/", label: "Início", icon: Home },
  { href: "/explorar", label: "Explorar", icon: Compass },
  { href: "/nova-ideia", label: "Nova Ideia", icon: Plus },
  { href: "/sobre", label: "Sobre", icon: Info },
  { href: "/ajuda", label: "Ajuda", icon: CircleHelp },
]

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
      <p className="min-w-0 flex-1">O status online passou a vir ativado por padrão, inclusive nas contas existentes. Só amigos aceitos podem ver sua presença. <Link href="/perfil/editar#profile-presence" className="font-semibold text-primary underline">Alterar em Privacidade</Link></p>
      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Dispensar aviso de privacidade" onClick={() => {
        try { localStorage.setItem(key, 'read') } catch { /* The dismissal still applies for this session. */ }
        setVisible(false)
      }}><X className="size-4" aria-hidden /></Button>
    </Container>
  </aside>
}

export function SiteHeader({ fullBleed = false }: { fullBleed?: boolean }) {
  const router = useRouter()
  const { darkMode, toggleTheme } = useThemeMode()
  const { isAuthenticated, profile, user, signOut } = useSupabaseSession()
  useProfilePresence(user?.id)
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

  useEffect(() => {
    if (!mobileOpen) return

    // Lock the viewport without making the body a scroll container for the sticky header.
    const viewport = document.documentElement
    const { overflow, scrollbarGutter } = viewport.style
    if (viewport.clientWidth < window.innerWidth) {
      viewport.style.scrollbarGutter = "stable"
    }
    viewport.style.overflow = "hidden"

    function handleKeyDown(event: KeyboardEvent) {
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
      viewport.style.overflow = overflow
      viewport.style.scrollbarGutter = scrollbarGutter
      window.removeEventListener("keydown", handleKeyDown)
      desktopQuery.removeEventListener("change", handleBreakpointChange)
    }
  }, [closeMobile, mobileOpen])

  async function handleSignOut() {
    closeMobile()
    await signOut()
    router.replace("/")
  }

  return (
    <>
      <header className="sticky top-0 z-[60] w-full border-b border-border/70 bg-background/85 backdrop-blur-xl supports-[backdrop-filter]:bg-background/75">
        <HeaderShell fullBleed={fullBleed} className="flex h-[72px] min-w-0 items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4 lg:gap-6">
            <Link
              href="/"
              className="flex min-w-0 shrink items-center gap-2 font-bold tracking-tight text-foreground"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary sm:h-10 sm:w-10">
                <Link2 className="h-5 w-5" aria-hidden />
              </span>
              <span className="truncate text-base sm:text-lg">Team Link</span>
            </Link>

            <nav
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
            </nav>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 sm:h-10 sm:w-10"
            aria-label="Alternar tema claro ou escuro"
          >
            {darkMode ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
          </Button>

          <NotificationBell />

          <div className="hidden items-center gap-2 lg:flex">
            {isAuthenticated ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex items-center gap-2 rounded-full px-2"
                  >
                    <UserAvatar name={displayName} imageUrl={avatarUrl} sizeClassName="h-9 w-9" />
                    <span className="whitespace-nowrap text-sm font-semibold">{displayName}</span>
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
                    <Link href="/perfil">Perfil</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    <Link href="/meus-projetos">Meus projetos</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    asChild
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium"
                  >
                    <Link href="/mensagens">Mensagens</Link>
                  </DropdownMenuItem>
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
                <Button variant="ghost" asChild className="font-semibold">
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button asChild className="font-semibold">
                  <Link href="/cadastro">Cadastrar</Link>
                </Button>
              </>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu de navegação"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav-panel"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
          </div>
        </HeaderShell>
      </header>
      {user && !fullBleed && <PresenceNotice key={user.id} userId={user.id} />}

      {mobileOpen ? (
        <div
          id="mobile-nav-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className="fixed inset-0 z-[100] flex flex-col bg-background backdrop-blur-xl lg:hidden"
        >
          <div className="border-b border-border/70 bg-background">
            <HeaderShell fullBleed={fullBleed} className="flex h-[72px] items-center justify-between gap-3">
              <Link
                href="/"
                onClick={closeMobile}
                className="flex min-w-0 shrink items-center gap-2 font-bold tracking-tight text-foreground"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                  <Link2 className="h-5 w-5" aria-hidden />
                </span>
                <span className="truncate text-lg">Team Link</span>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  aria-label="Alternar tema claro ou escuro"
                  className="h-10 w-10"
                >
                  {darkMode ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
                </Button>
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
              {isAuthenticated && (
                <Link href="/perfil" onClick={closeMobile} className="flex items-center gap-3 rounded-2xl border border-card-outline bg-card p-3 hover:bg-muted">
                  <UserAvatar name={displayName} imageUrl={avatarUrl} sizeClassName="h-12 w-12 shrink-0" />
                  <span className="min-w-0 break-words text-sm font-semibold">{displayName}</span>
                </Link>
              )}
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
                  <Button asChild variant="secondary" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/meus-projetos"><Briefcase aria-hidden /> Meus projetos</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/mensagens"><MessageCircle aria-hidden /> Mensagens</Link>
                  </Button>
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
            </HeaderShell>
          </div>
        </div>
      ) : null}
    </>
  )
}
