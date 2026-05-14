"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, BellRing, CheckCheck, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/team-link/user-avatar"
import { useSupabaseSession } from "@/hooks/use-supabase-session"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { NotificationItem } from "@/types/database"

const COUNT_POLL_INTERVAL_MS = 20_000
const LIST_LIMIT = 30

/**
 * Sino de notificações.
 *
 * Renderiza apenas para usuários autenticados. Mantém um contador
 * de notificações não lidas atualizado a cada ~20 segundos enquanto
 * o componente está montado. O painel só busca a lista quando o
 * usuário o abre, evitando carga desnecessária.
 */
export function NotificationBell({ className }: { className?: string }) {
  const router = useRouter()
  const { isAuthenticated, loading: sessionLoading, user } = useSupabaseSession()

  const [open, setOpen] = React.useState(false)
  const [unreadCount, setUnreadCount] = React.useState(0)
  const [items, setItems] = React.useState<NotificationItem[]>([])
  const [listLoading, setListLoading] = React.useState(false)
  const [listError, setListError] = React.useState<string | null>(null)
  const [markingAll, setMarkingAll] = React.useState(false)

  const wrapperRef = React.useRef<HTMLDivElement | null>(null)

  const supabaseReady = isAuthenticated && isSupabaseConfigured()

  const refreshUnreadCount = React.useCallback(async () => {
    if (!supabaseReady) return
    try {
      const client = getSupabaseClient()
      const { data, error } = await client.rpc("get_my_unread_notifications_count")
      if (error) throw error
      const next = typeof data === "number" ? data : Number(data ?? 0)
      setUnreadCount(Number.isFinite(next) ? Math.max(0, next) : 0)
    } catch {
      // Silencioso: o badge apenas não atualiza. Erro não vai para a UI.
    }
  }, [supabaseReady])

  const loadList = React.useCallback(async () => {
    if (!supabaseReady) {
      setListError("Não foi possível carregar as notificações agora.")
      return
    }
    setListLoading(true)
    setListError(null)
    try {
      const client = getSupabaseClient()
      const { data, error } = await client.rpc("get_my_notifications", {
        p_limit: LIST_LIMIT,
        p_offset: 0,
        p_only_unread: false,
      })
      if (error) throw error
      const rows = (data ?? []) as NotificationItem[]
      setItems(rows)
      // O servidor é a fonte da verdade do contador; mantemos sincronizado.
      const stillUnread = rows.reduce((acc, row) => acc + (row.is_read ? 0 : 1), 0)
      // Não baixamos o contador se ele já está maior (pode haver mais de 30 não lidas).
      setUnreadCount((current) => (rows.length < LIST_LIMIT ? stillUnread : Math.max(current, stillUnread)))
    } catch {
      setItems([])
      setListError("Não foi possível carregar as notificações agora.")
    } finally {
      setListLoading(false)
    }
  }, [supabaseReady])

  // Carregar contador na primeira montagem e iniciar polling.
  React.useEffect(() => {
    if (!supabaseReady) {
      setUnreadCount(0)
      return
    }
    void refreshUnreadCount()
    const id = window.setInterval(() => {
      void refreshUnreadCount()
    }, COUNT_POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(id)
    }
  }, [refreshUnreadCount, supabaseReady, user?.id])

  // Reset ao deslogar.
  React.useEffect(() => {
    if (isAuthenticated) return
    setOpen(false)
    setItems([])
    setListError(null)
    setUnreadCount(0)
  }, [isAuthenticated])

  // Buscar lista quando abrir.
  React.useEffect(() => {
    if (!open) return
    if (!supabaseReady) return
    void loadList()
  }, [loadList, open, supabaseReady])

  // Click fora fecha o painel.
  React.useEffect(() => {
    if (!open) return
    function handlePointerDown(event: PointerEvent) {
      const node = wrapperRef.current
      if (!node) return
      if (event.target instanceof Node && node.contains(event.target)) return
      setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("keydown", handleKey)
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("keydown", handleKey)
    }
  }, [open])

  const markOneAsRead = React.useCallback(
    async (notificationId: string) => {
      if (!supabaseReady) return
      try {
        const client = getSupabaseClient()
        await client.rpc("mark_notification_read", { p_notification_id: notificationId })
      } catch {
        // Falha silenciosa: o usuário pode tentar novamente.
      }
    },
    [supabaseReady],
  )

  const handleSelect = React.useCallback(
    (item: NotificationItem) => {
      if (!item.is_read) {
        setItems((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, is_read: true, read_at: new Date().toISOString() } : row,
          ),
        )
        setUnreadCount((current) => Math.max(0, current - 1))
        void markOneAsRead(item.id)
      }
      if (item.href) {
        setOpen(false)
        router.push(item.href)
      }
    },
    [markOneAsRead, router],
  )

  const handleMarkAll = React.useCallback(async () => {
    if (!supabaseReady) return
    if (markingAll) return
    setMarkingAll(true)
    const now = new Date().toISOString()
    setItems((prev) => prev.map((row) => (row.is_read ? row : { ...row, is_read: true, read_at: now })))
    setUnreadCount(0)
    try {
      const client = getSupabaseClient()
      await client.rpc("mark_all_notifications_read")
    } catch {
      // Em caso de erro real, recarregamos para reconciliar.
      void loadList()
      void refreshUnreadCount()
    } finally {
      setMarkingAll(false)
    }
  }, [loadList, markingAll, refreshUnreadCount, supabaseReady])

  if (sessionLoading) return null
  if (!isAuthenticated) return null

  const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount)
  const hasUnread = unreadCount > 0

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={
          hasUnread
            ? `Notificações, ${unreadCount} não ${unreadCount === 1 ? "lida" : "lidas"}`
            : "Notificações"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notifications-panel"
        className="relative h-10 w-10"
      >
        {hasUnread ? (
          <BellRing className="h-5 w-5" aria-hidden />
        ) : (
          <Bell className="h-5 w-5" aria-hidden />
        )}
        {hasUnread ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-background"
          >
            {badgeLabel}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div
          id="notifications-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Notificações"
          className={cn(
            "fixed top-[78px] right-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-popover/95 text-popover-foreground shadow-2xl shadow-black/15 backdrop-blur-xl sm:right-6 lg:right-8 dark:shadow-black/40",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-background/40 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">Notificações</p>
              <p className="truncate text-xs text-muted-foreground">
                {hasUnread
                  ? `${unreadCount} não ${unreadCount === 1 ? "lida" : "lidas"}`
                  : "Você está em dia"}
              </p>
            </div>
            {items.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleMarkAll()}
                disabled={markingAll || !hasUnread}
                className="h-8 gap-1 px-2 text-xs font-semibold text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                {markingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                )}
                Marcar todas como lidas
              </Button>
            ) : null}
          </div>

          <div className="max-h-[min(70vh,440px)] overflow-y-auto">
            {listLoading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 px-6 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Carregando notificações...
              </div>
            ) : listError ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-8 text-center">
                <p className="text-sm font-medium text-destructive">{listError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadList()}>
                  Tentar novamente
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Bell className="h-5 w-5" aria-hidden />
                </span>
                <p className="text-sm font-semibold text-foreground">
                  Nenhuma notificação por enquanto.
                </p>
                <p className="text-xs text-muted-foreground">
                  Quando houver novas interações nos seus projetos, elas aparecerão aqui.
                </p>
              </div>
            ) : (
              <ul role="list" className="divide-y divide-border/60">
                {items.map((item) => (
                  <NotificationRow key={item.id} item={item} onSelect={handleSelect} />
                ))}
              </ul>
            )}
          </div>

          {items.length > 0 ? (
            <div className="border-t border-border/70 bg-background/40 px-3 py-2 text-center">
              <Link
                href="/perfil"
                onClick={() => setOpen(false)}
                className="inline-block w-full rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                Ver seu perfil
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

interface NotificationRowProps {
  item: NotificationItem
  onSelect: (item: NotificationItem) => void
}

function NotificationRow({ item, onSelect }: NotificationRowProps) {
  const interactive = Boolean(item.href) || !item.is_read
  const Wrapper: React.ElementType = interactive ? "button" : "div"
  const wrapperProps = interactive
    ? {
        type: "button" as const,
        onClick: () => onSelect(item),
      }
    : {}

  const actorName = item.actor_name?.trim() || ""
  const projectTitle = item.project_title?.trim() || ""
  const title = item.title?.trim() || "Nova atividade"
  const body = item.body?.trim() || ""

  return (
    <li>
      <Wrapper
        {...wrapperProps}
        className={cn(
          "flex w-full gap-3 px-4 py-3 text-left transition-colors",
          interactive && "cursor-pointer hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
          !item.is_read && "bg-primary/[0.06]",
        )}
        aria-label={interactive ? title : undefined}
      >
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          {actorName ? (
            <UserAvatar
              name={actorName}
              imageUrl={undefined}
              sizeClassName="h-9 w-9"
              ring={false}
            />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Bell className="h-4 w-4" aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p
              className={cn(
                "min-w-0 flex-1 text-sm leading-snug",
                item.is_read ? "font-medium text-foreground/85" : "font-semibold text-foreground",
              )}
            >
              {title}
            </p>
            {!item.is_read ? (
              <span
                aria-hidden
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-primary"
              />
            ) : null}
          </div>
          {body ? (
            <p
              className={cn(
                "mt-0.5 line-clamp-2 text-xs leading-relaxed",
                item.is_read ? "text-muted-foreground" : "text-foreground/80",
              )}
            >
              {body}
            </p>
          ) : null}
          {actorName || projectTitle ? (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {actorName ? <span className="font-semibold text-foreground/80">{actorName}</span> : null}
              {actorName && projectTitle ? <span> · </span> : null}
              {projectTitle ? <span>{projectTitle}</span> : null}
            </p>
          ) : null}
          <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
            {formatRelativeTime(item.created_at)}
          </p>
        </div>
      </Wrapper>
    </li>
  )
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const now = Date.now()
  const diffSeconds = Math.round((now - date.getTime()) / 1000)

  if (diffSeconds < 30) return "agora"
  if (diffSeconds < 60) return `há ${diffSeconds}s`

  const diffMinutes = Math.round(diffSeconds / 60)
  if (diffMinutes < 60) return `há ${diffMinutes} min`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `há ${diffHours} h`

  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 7) return `há ${diffDays} ${diffDays === 1 ? "dia" : "dias"}`

  if (diffDays < 30) {
    const weeks = Math.round(diffDays / 7)
    return `há ${weeks} ${weeks === 1 ? "semana" : "semanas"}`
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
}
