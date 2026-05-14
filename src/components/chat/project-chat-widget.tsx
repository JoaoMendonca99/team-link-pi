"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Send,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { UserAvatar } from "@/components/team-link/user-avatar"
import { useSupabaseSession } from "@/hooks/use-supabase-session"
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type {
  ProfileRow,
  ProjectConversationRow,
  ProjectMessageRow,
  ProjectRow,
} from "@/types/database"

const MESSAGE_MAX_LENGTH = 2000
const STORAGE_KEY = "team-link:chat:open"

type View = "projects" | "conversations" | "thread"

interface ChatProject {
  id: string
  title: string
}

interface ChatMessage extends ProjectMessageRow {
  author?: ProfileRow | null
}

/**
 * Widget global de chat por projeto (Fase 1).
 *
 * - Só renderiza para usuário autenticado.
 * - Lista projetos onde o usuário é membro ativo.
 * - Mostra apenas a conversa "Geral" (kind = 'general') nesta fase.
 * - Permite enviar mensagens visíveis.
 * - Realtime ainda não implementado (a Fase 2/3 cuidará disso).
 */
export function ProjectChatWidget() {
  const { isAuthenticated, user, profile, loading: sessionLoading } = useSupabaseSession()

  const [mounted, setMounted] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<View>("projects")

  const [projects, setProjects] = React.useState<ChatProject[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const [projectsError, setProjectsError] = React.useState<string | null>(null)

  const [selectedProject, setSelectedProject] = React.useState<ChatProject | null>(null)

  const [conversations, setConversations] = React.useState<ProjectConversationRow[]>([])
  const [conversationsLoading, setConversationsLoading] = React.useState(false)
  const [conversationsError, setConversationsError] = React.useState<string | null>(null)

  const [selectedConversation, setSelectedConversation] =
    React.useState<ProjectConversationRow | null>(null)

  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [messagesLoading, setMessagesLoading] = React.useState(false)
  const [messagesError, setMessagesError] = React.useState<string | null>(null)

  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)

  const threadScrollRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    setMounted(true)
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        setOpen(true)
      }
    } catch {
      // ignore storage errors
    }
  }, [])

  React.useEffect(() => {
    if (!mounted) return
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0")
    } catch {
      // ignore storage errors
    }
  }, [mounted, open])

  // Reset state when the user signs out.
  React.useEffect(() => {
    if (isAuthenticated) return
    setOpen(false)
    setView("projects")
    setProjects([])
    setSelectedProject(null)
    setConversations([])
    setSelectedConversation(null)
    setMessages([])
    setDraft("")
  }, [isAuthenticated])

  const supabaseReady = mounted && isSupabaseConfigured()

  // Load list of projects (active memberships only).
  const loadProjects = React.useCallback(async () => {
    if (!user) return
    if (!supabaseReady) {
      setProjectsError("Não foi possível conectar ao serviço de dados.")
      return
    }
    setProjectsLoading(true)
    setProjectsError(null)
    try {
      const client = getSupabaseClient()
      const membershipResult = await client
        .from("project_members")
        .select("project_id")
        .eq("user_id", user.id)
        .eq("status", "active")
      if (membershipResult.error) throw membershipResult.error
      const projectIds = Array.from(
        new Set(((membershipResult.data ?? []) as Array<{ project_id: string }>).map((row) => row.project_id)),
      )
      if (projectIds.length === 0) {
        setProjects([])
        return
      }
      const projectsResult = await client
        .from("projects")
        .select("id, title")
        .in("id", projectIds)
        .order("updated_at", { ascending: false })
      if (projectsResult.error) throw projectsResult.error
      const rows = (projectsResult.data ?? []) as Array<Pick<ProjectRow, "id" | "title">>
      setProjects(rows.map((row) => ({ id: row.id, title: row.title })))
    } catch (error) {
      setProjects([])
      setProjectsError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar seus projetos no momento.",
      )
    } finally {
      setProjectsLoading(false)
    }
  }, [supabaseReady, user])

  // Reload projects when the chat is opened (only once per open while authenticated).
  React.useEffect(() => {
    if (!open) return
    if (!isAuthenticated) return
    if (view !== "projects") return
    void loadProjects()
  }, [isAuthenticated, loadProjects, open, view])

  // Load conversations for the selected project.
  const loadConversations = React.useCallback(
    async (projectId: string) => {
      if (!supabaseReady) {
        setConversationsError("Não foi possível conectar ao serviço de dados.")
        return
      }
      setConversationsLoading(true)
      setConversationsError(null)
      try {
        const client = getSupabaseClient()
        const result = await client
          .from("project_conversations")
          .select("id, project_id, kind, title, created_by, created_at, updated_at")
          .eq("project_id", projectId)
          .order("kind", { ascending: true })
          .order("created_at", { ascending: true })
        if (result.error) throw result.error
        const rows = (result.data ?? []) as ProjectConversationRow[]
        setConversations(rows)
      } catch (error) {
        setConversations([])
        setConversationsError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as conversas deste projeto.",
        )
      } finally {
        setConversationsLoading(false)
      }
    },
    [supabaseReady],
  )

  // Load messages for the selected conversation.
  const loadMessages = React.useCallback(
    async (conversationId: string) => {
      if (!supabaseReady) {
        setMessagesError("Não foi possível conectar ao serviço de dados.")
        return
      }
      setMessagesLoading(true)
      setMessagesError(null)
      try {
        const client = getSupabaseClient()
        const result = await client
          .from("project_messages")
          .select("id, conversation_id, sender_id, content, status, created_at, updated_at")
          .eq("conversation_id", conversationId)
          .eq("status", "visible")
          .order("created_at", { ascending: true })
        if (result.error) throw result.error
        const rows = (result.data ?? []) as ProjectMessageRow[]

        const senderIds = Array.from(new Set(rows.map((row) => row.sender_id)))
        let authors: Record<string, ProfileRow> = {}
        if (senderIds.length > 0) {
          const profilesResult = await client
            .from("profiles")
            .select("id, full_name, email, course, bio, avatar_url, skills, interests, created_at, updated_at")
            .in("id", senderIds)
          if (profilesResult.error) throw profilesResult.error
          const profileRows = (profilesResult.data ?? []) as ProfileRow[]
          authors = Object.fromEntries(profileRows.map((row) => [row.id, row]))
        }

        setMessages(rows.map((row) => ({ ...row, author: authors[row.sender_id] ?? null })))
      } catch (error) {
        setMessages([])
        setMessagesError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar as mensagens.",
        )
      } finally {
        setMessagesLoading(false)
      }
    },
    [supabaseReady],
  )

  React.useEffect(() => {
    if (view !== "thread") return
    if (!selectedConversation) return
    void loadMessages(selectedConversation.id)
  }, [loadMessages, selectedConversation, view])

  // Auto-scroll to bottom whenever messages change.
  React.useEffect(() => {
    if (view !== "thread") return
    const node = threadScrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, view])

  const handleSelectProject = React.useCallback(
    async (project: ChatProject) => {
      setSelectedProject(project)
      setView("conversations")
      setSelectedConversation(null)
      setMessages([])
      setSendError(null)
      setDraft("")
      await loadConversations(project.id)
    },
    [loadConversations],
  )

  const handleSelectConversation = React.useCallback((conversation: ProjectConversationRow) => {
    setSelectedConversation(conversation)
    setSendError(null)
    setDraft("")
    setView("thread")
  }, [])

  const handleBack = React.useCallback(() => {
    setSendError(null)
    if (view === "thread") {
      setView("conversations")
      setSelectedConversation(null)
      setMessages([])
      return
    }
    if (view === "conversations") {
      setView("projects")
      setSelectedProject(null)
      setConversations([])
      return
    }
  }, [view])

  const handleSend = React.useCallback(async () => {
    if (!user) return
    if (!selectedConversation) return
    const content = draft.trim()
    if (content.length === 0) {
      setSendError("Digite uma mensagem antes de enviar.")
      return
    }
    if (content.length > MESSAGE_MAX_LENGTH) {
      setSendError(`A mensagem deve ter no máximo ${MESSAGE_MAX_LENGTH} caracteres.`)
      return
    }
    if (!supabaseReady) {
      setSendError("Não foi possível conectar ao serviço de dados.")
      return
    }
    setSending(true)
    setSendError(null)
    try {
      const client = getSupabaseClient()
      const insertResult = await client.from("project_messages").insert({
        conversation_id: selectedConversation.id,
        sender_id: user.id,
        content,
        status: "visible",
      })
      if (insertResult.error) throw insertResult.error
      setDraft("")
      await loadMessages(selectedConversation.id)
    } catch (error) {
      setSendError(
        error instanceof Error ? error.message : "Não foi possível enviar a mensagem.",
      )
    } finally {
      setSending(false)
    }
  }, [draft, loadMessages, selectedConversation, supabaseReady, user])

  if (!mounted) return null
  if (sessionLoading) return null
  if (!isAuthenticated) return null

  const launcher = (
    <button
      type="button"
      onClick={() => setOpen((prev) => !prev)}
      aria-label={open ? "Fechar chat" : "Abrir chat"}
      aria-expanded={open}
      aria-controls="project-chat-panel"
      className={cn(
        "fixed bottom-4 right-4 z-[40] inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-primary/40 md:bottom-6 md:right-6",
        open && "scale-95",
      )}
    >
      {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-6 w-6" aria-hidden />}
    </button>
  )

  const panel = open ? (
    <div
      id="project-chat-panel"
      role="dialog"
      aria-modal="false"
      aria-label="Chat dos seus projetos"
      className={cn(
        "fixed z-[40] flex flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl",
        // Mobile: drawer próximo ao botão, com largura quase total
        "bottom-20 left-4 right-4 max-h-[min(72vh,640px)]",
        // Desktop
        "md:left-auto md:right-6 md:bottom-24 md:w-[380px] md:max-h-[600px]",
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border bg-background/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {view !== "projects" ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleBack}
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
              <MessagesSquare className="h-4 w-4" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              {view === "projects"
                ? "Mensagens"
                : view === "conversations"
                  ? selectedProject?.title ?? "Conversas"
                  : conversationLabel(selectedConversation)}
            </p>
            {view === "thread" && selectedProject ? (
              <p className="truncate text-xs text-muted-foreground">{selectedProject.title}</p>
            ) : view === "projects" ? (
              <p className="truncate text-xs text-muted-foreground">Seus projetos ativos</p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setOpen(false)}
          aria-label="Fechar chat"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {view === "projects" ? (
          <ProjectsListView
            loading={projectsLoading}
            error={projectsError}
            projects={projects}
            onSelect={handleSelectProject}
            onRetry={() => void loadProjects()}
          />
        ) : null}

        {view === "conversations" ? (
          <ConversationsListView
            loading={conversationsLoading}
            error={conversationsError}
            conversations={conversations}
            onSelect={handleSelectConversation}
            onRetry={() =>
              selectedProject ? void loadConversations(selectedProject.id) : undefined
            }
          />
        ) : null}

        {view === "thread" && selectedConversation ? (
          <ThreadView
            scrollRef={threadScrollRef}
            currentUserId={user?.id ?? null}
            currentUserName={
              profile?.full_name?.trim() || user?.email?.split("@")[0] || "Você"
            }
            currentUserAvatar={profile?.avatar_url ?? undefined}
            messages={messages}
            loading={messagesLoading}
            error={messagesError}
            onRetry={() => void loadMessages(selectedConversation.id)}
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            sending={sending}
            sendError={sendError}
          />
        ) : null}
      </div>
    </div>
  ) : null

  return createPortal(
    <>
      {panel}
      {launcher}
    </>,
    document.body,
  )
}

function conversationLabel(conversation: ProjectConversationRow | null): string {
  if (!conversation) return "Conversa"
  if (conversation.kind === "general") return "Geral"
  if (conversation.title?.trim()) return conversation.title.trim()
  if (conversation.kind === "direct") return "Mensagem direta"
  if (conversation.kind === "group") return "Grupo"
  return "Conversa"
}

// ----------------------------------------------------------------------------
// Subcomponentes
// ----------------------------------------------------------------------------

interface ProjectsListViewProps {
  loading: boolean
  error: string | null
  projects: ChatProject[]
  onSelect: (project: ChatProject) => void
  onRetry: () => void
}

function ProjectsListView({ loading, error, projects, onSelect, onRetry }: ProjectsListViewProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando seus projetos...
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <p className="text-sm font-medium text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    )
  }
  if (projects.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        <MessagesSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold text-foreground">Sem projetos para conversar</p>
        <p className="text-xs text-muted-foreground">
          Quando você for membro ativo de um projeto, ele aparecerá aqui.
        </p>
      </div>
    )
  }
  return (
    <ul className="flex-1 overflow-y-auto p-2">
      {projects.map((project) => (
        <li key={project.id}>
          <button
            type="button"
            onClick={() => onSelect(project)}
            className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initialsOf(project.title)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">
                {project.title}
              </span>
              <span className="block truncate text-xs text-muted-foreground">Conversa geral</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

interface ConversationsListViewProps {
  loading: boolean
  error: string | null
  conversations: ProjectConversationRow[]
  onSelect: (conversation: ProjectConversationRow) => void
  onRetry: () => void
}

function ConversationsListView({
  loading,
  error,
  conversations,
  onSelect,
  onRetry,
}: ConversationsListViewProps) {
  // Fase 1: mostrar apenas a conversa Geral.
  const general = conversations.find((conversation) => conversation.kind === "general")

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando conversas...
      </div>
    )
  }
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <p className="text-sm font-medium text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </div>
    )
  }
  if (!general) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        <MessagesSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold text-foreground">Sem conversa disponível</p>
        <p className="text-xs text-muted-foreground">
          A conversa geral deste projeto ainda não foi criada.
        </p>
      </div>
    )
  }
  return (
    <ul className="flex-1 overflow-y-auto p-2">
      <li>
        <button
          type="button"
          onClick={() => onSelect(general)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <MessagesSquare className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">Geral</span>
            <span className="block truncate text-xs text-muted-foreground">
              Todos os membros do projeto
            </span>
          </span>
        </button>
      </li>
    </ul>
  )
}

interface ThreadViewProps {
  scrollRef: React.RefObject<HTMLDivElement | null>
  currentUserId: string | null
  currentUserName: string
  currentUserAvatar?: string
  messages: ChatMessage[]
  loading: boolean
  error: string | null
  onRetry: () => void
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  sending: boolean
  sendError: string | null
}

function ThreadView({
  scrollRef,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  messages,
  loading,
  error,
  onRetry,
  draft,
  onDraftChange,
  onSend,
  sending,
  sendError,
}: ThreadViewProps) {
  const remaining = MESSAGE_MAX_LENGTH - draft.length
  const trimmed = draft.trim()
  const sendDisabled = sending || trimmed.length === 0 || draft.length > MESSAGE_MAX_LENGTH

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (!sendDisabled) onSend()
    }
  }

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando mensagens...
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm font-medium text-destructive">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Tentar novamente
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessagesSquare className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Nenhuma mensagem ainda</p>
            <p className="text-xs text-muted-foreground">Comece a conversa enviando a primeira.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((message) => {
              const isOwn = currentUserId === message.sender_id
              const authorName = isOwn
                ? currentUserName
                : message.author?.full_name?.trim() || "Membro do projeto"
              const avatarUrl = isOwn
                ? currentUserAvatar
                : message.author?.avatar_url ?? undefined
              return (
                <li
                  key={message.id}
                  className={cn(
                    "flex w-full items-end gap-2",
                    isOwn ? "justify-end" : "justify-start",
                  )}
                >
                  {!isOwn ? (
                    <UserAvatar
                      name={authorName}
                      imageUrl={avatarUrl}
                      sizeClassName="h-7 w-7"
                      ring={false}
                    />
                  ) : null}
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      isOwn
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : "rounded-bl-md bg-muted text-foreground",
                    )}
                  >
                    {!isOwn ? (
                      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {authorName}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {message.content}
                    </p>
                    <p
                      className={cn(
                        "mt-1 text-[10px] tabular-nums",
                        isOwn ? "text-primary-foreground/75" : "text-muted-foreground",
                      )}
                    >
                      {formatMessageTime(message.created_at)}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border bg-background/60 px-3 py-3">
        {sendError ? (
          <p role="alert" className="mb-2 text-xs font-medium text-destructive">
            {sendError}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escreva uma mensagem..."
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH + 200}
            aria-label="Mensagem"
            className="max-h-32 min-h-10 resize-none rounded-2xl"
          />
          <Button
            type="button"
            onClick={onSend}
            disabled={sendDisabled}
            className="h-10 shrink-0 rounded-2xl px-3 font-semibold"
            aria-label="Enviar mensagem"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
          </Button>
        </div>
        {remaining <= 200 ? (
          <p
            className={cn(
              "mt-1 text-right text-[10px] tabular-nums",
              remaining < 0 ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {remaining} caracteres restantes
          </p>
        ) : null}
      </div>
    </>
  )
}

function initialsOf(text: string): string {
  const parts = text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase()
}

function formatMessageTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}
