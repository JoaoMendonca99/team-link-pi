"use client"

import {MotionConfig} from 'framer-motion'
import {WorkspaceLoading} from '@/components/layout/workspace-loading'
import {Suspense} from 'react'
import {WorkspaceShell} from '@/app/(marketing)/meu-espaco/workspace-shell'
import {isInternalWorkspace} from '@/lib/workspace-navigation'
import { usePathname } from "next/navigation"

import { ThemeProvider } from "@/components/providers/theme-provider"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { ProjectChatWidget } from "@/components/chat/project-chat-widget"
import { PushSettings } from '@/components/notifications/push-settings'
import { FriendshipsProvider } from '@/components/profile/friendships-provider'

function normalizePathname(pathname: string | null): string {
  if (!pathname) return ""
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }
  return pathname
}

export function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = normalizePathname(usePathname())
  const isMessagesPage = pathname === "/mensagens" || pathname === "/meu-espaco/mensagens"
  const isWorkspace = isInternalWorkspace(pathname)
  const hideMarketingFooter = isMessagesPage || isWorkspace

  return (
    <MotionConfig reducedMotion="user"><ThemeProvider>
      <FriendshipsProvider>
      <div style={{ '--site-header-height': isWorkspace ? '64px' : '72px' } as React.CSSProperties} className="flex min-h-dvh flex-col overflow-x-clip bg-background text-foreground">
        <SiteHeader workspace={isWorkspace} fullBleed={isMessagesPage || isWorkspace} />
        <div
          className={
            isMessagesPage && !isWorkspace ? "flex h-[calc(100dvh-72px)] min-h-0 flex-col" : (isWorkspace ? "workspace-chat-safe " : "") + "chat-safe-content min-w-0 flex-1"
          }
        >
          {isWorkspace?<Suspense fallback={<WorkspaceLoading />}><WorkspaceShell>{children}</WorkspaceShell></Suspense>:children}
        </div>
        {hideMarketingFooter ? null : <SiteFooter />}
      </div>
      {isMessagesPage ? null : <ProjectChatWidget />}
      {pathname === '/meu-espaco/configuracoes' || pathname === '/perfil/notificacoes' ? null : <PushSettings automatic />}
      </FriendshipsProvider>
    </ThemeProvider></MotionConfig>
  )
}
