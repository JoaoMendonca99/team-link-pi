"use client"

import { usePathname } from "next/navigation"

import { ThemeProvider } from "@/components/providers/theme-provider"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { ProjectChatWidget } from "@/components/chat/project-chat-widget"

function normalizePathname(pathname: string | null): string {
  if (!pathname) return ""
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = normalizePathname(usePathname())
  const isMessagesPage = pathname === "/mensagens"
  const hideMarketingFooter = isMessagesPage

  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
        <SiteHeader />
        <div className={hideMarketingFooter ? "flex min-h-0 flex-1 flex-col" : "flex-1"}>
          {children}
        </div>
        {hideMarketingFooter ? null : <SiteFooter />}
      </div>
      {isMessagesPage ? null : <ProjectChatWidget />}
    </ThemeProvider>
  )
}
