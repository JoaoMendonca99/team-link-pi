"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { Link2, LogOut, Menu, Moon, Sun, X } from "lucide-react"

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
import { useSupabaseSession } from "@/hooks/use-supabase-session"

const primaryLinks = [
  { href: "/", label: "Início" },
  { href: "/explorar", label: "Explorar" },
  { href: "/nova-ideia", label: "Nova Ideia" },
  { href: "/sobre", label: "Sobre" },
  { href: "/ajuda", label: "Ajuda" },
]

export function SiteHeader() {
  const router = useRouter()
  const { darkMode, toggleTheme } = useThemeMode()
  const { isAuthenticated, profile, user, signOut } = useSupabaseSession()
  const [mobileOpen, setMobileOpen] = useState(false)

  const displayName =
    profile?.full_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split("@")[0] ||
    ""
  const displayEmail = profile?.email ?? user?.email ?? ""
  const avatarUrl = profile?.avatar_url ?? undefined

  const closeMobile = useCallback(() => {
    setMobileOpen(false)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

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
      document.body.style.overflow = previousOverflow
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
        <Container className="flex h-[72px] items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 shrink items-center gap-2 font-bold tracking-tight text-foreground">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Link2 className="h-5 w-5" aria-hidden />
          </span>
          <span className="truncate text-lg">Team Link</span>
        </Link>

        <nav aria-label="Principal" className="hidden items-center gap-6 text-sm font-semibold text-foreground/90 lg:flex xl:gap-7">
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

        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-10 w-10"
            aria-label="Alternar tema claro ou escuro"
          >
            {darkMode ? <Sun className="h-5 w-5" aria-hidden /> : <Moon className="h-5 w-5" aria-hidden />}
          </Button>

          <NotificationBell />

          <div className="hidden items-center gap-2 lg:flex">
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex max-w-[14rem] items-center gap-2 rounded-full px-2"
                  >
                    <UserAvatar name={displayName} imageUrl={avatarUrl} sizeClassName="h-9 w-9" />
                    <span className="truncate text-sm font-semibold">{displayName}</span>
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
        </Container>
      </header>

      {mobileOpen ? (
        <div
          id="mobile-nav-panel"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          className="fixed inset-0 z-[100] flex flex-col bg-background backdrop-blur-xl lg:hidden"
        >
          <div className="border-b border-border/70 bg-background">
            <Container className="flex h-[72px] items-center justify-between gap-3">
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
            </Container>
          </div>

          <div className="flex-1 overflow-y-auto bg-background">
            <Container className="flex flex-col gap-8 py-8">
              <nav aria-label="Navegação principal" className="flex flex-col gap-1 text-base font-semibold">
                {primaryLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMobile}
                    className="rounded-xl px-4 py-3 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/45"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="h-px w-full bg-border" />

              {isAuthenticated ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                    <UserAvatar name={displayName} imageUrl={avatarUrl} sizeClassName="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
                    </div>
                  </div>
                  <Button asChild variant="secondary" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/perfil">Perfil</Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/meus-projetos">Meus projetos</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/nova-ideia">Criar ideia</Link>
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
                  <Button asChild variant="ghost" className="w-full font-semibold" onClick={closeMobile}>
                    <Link href="/nova-ideia">Criar ideia</Link>
                  </Button>
                </div>
              )}
            </Container>
          </div>
        </div>
      ) : null}
    </>
  )
}
