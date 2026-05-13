"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Link2, Menu, Moon, Sun, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Container } from "@/components/layout/container"
import { UserAvatar } from "@/components/team-link/user-avatar"
import { cn } from "@/lib/utils"
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

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [mobileOpen])

  function closeMobile() {
    setMobileOpen(false)
  }

  async function handleSignOut() {
    await signOut()
    router.replace("/")
  }

  return (
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

      <div
        className={cn(
          "fixed inset-0 z-[100] transition-opacity lg:hidden",
          mobileOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className="absolute inset-0 cursor-pointer bg-background/80 backdrop-blur-sm"
          aria-label="Fechar menu"
          onClick={closeMobile}
        />
        <div
          id="mobile-nav-panel"
          className={cn(
            "absolute right-0 top-0 flex h-full w-[min(92vw,22rem)] flex-col gap-6 border-l border-border bg-card p-6 shadow-2xl transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "translate-x-full",
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Menu</p>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" onClick={toggleTheme} aria-label="Alternar tema">
                {darkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </Button>
              <Button type="button" variant="ghost" size="icon" onClick={closeMobile} aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          <nav aria-label="Mobile" className="flex flex-col gap-1 text-base font-semibold">
            {primaryLinks.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-xl px-3 py-3 hover:bg-muted" onClick={closeMobile}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-4">
            {isAuthenticated ? (
              <>
                <div className="flex items-center gap-3 px-2">
                  <UserAvatar name={displayName} imageUrl={avatarUrl} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
                  </div>
                </div>
                <Button asChild variant="secondary" className="font-semibold" onClick={closeMobile}>
                  <Link href="/perfil">Perfil</Link>
                </Button>
                <Button asChild variant="secondary" className="font-semibold" onClick={closeMobile}>
                  <Link href="/meus-projetos">Meus projetos</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="font-semibold"
                  onClick={() => {
                    closeMobile()
                    void handleSignOut()
                  }}
                >
                  Sair
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="secondary" className="w-full font-semibold" onClick={closeMobile}>
                  <Link href="/login">Entrar</Link>
                </Button>
                <Button asChild className="w-full font-semibold" onClick={closeMobile}>
                  <Link href="/cadastro">Cadastrar</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
