import { ThemeProvider } from "@/components/providers/theme-provider"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { ProjectChatWidget } from "@/components/chat/project-chat-widget"

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <div className="flex min-h-screen flex-col overflow-x-hidden bg-background text-foreground">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </div>
      <ProjectChatWidget />
    </ThemeProvider>
  )
}
