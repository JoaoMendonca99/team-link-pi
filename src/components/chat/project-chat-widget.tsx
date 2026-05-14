"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
} from "@supabase/supabase-js"
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  MessagesSquare,
  MoreVertical,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
const GROUP_TITLE_MAX_LENGTH = 80
const STORAGE_KEY = "team-link:chat:open"

type View = "projects" | "conversations" | "thread" | "create-group" | "members"

interface ChatProject {
  id: string
  title: string
}

interface ChatMessage extends ProjectMessageRow {
  author?: ProfileRow | null
}

interface ProjectMemberOption {
  user_id: string
  full_name: string | null
  course: string | null
  avatar_url: string | null
}

interface ConversationMemberView {
  user_id: string
  full_name: string | null
  course: string | null
  avatar_url: string | null
  role: "admin" | "member" | "owner" | "mentor"
}

/**
 * Widget global de chat por projeto.
 *
 * Fase 2:
 * - Lista conversa Geral + grupos personalizados (status='active').
 * - Permite criar grupo com membros do projeto.
 * - Mostra membros de uma conversa.
 * - Permite excluir grupo (soft delete via RPC).
 * - Conversa Geral nunca pode ser excluída.
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

  const [groupMemberCounts, setGroupMemberCounts] = React.useState<Record<string, number>>({})

  const [selectedConversation, setSelectedConversation] =
    React.useState<ProjectConversationRow | null>(null)

  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [messagesLoading, setMessagesLoading] = React.useState(false)
  const [messagesError, setMessagesError] = React.useState<string | null>(null)

  const [draft, setDraft] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [sendError, setSendError] = React.useState<string | null>(null)

  // Criação de grupo
  const [projectMembers, setProjectMembers] = React.useState<ProjectMemberOption[]>([])
  const [projectMembersLoading, setProjectMembersLoading] = React.useState(false)
  const [projectMembersError, setProjectMembersError] = React.useState<string | null>(null)
  const [groupTitle, setGroupTitle] = React.useState("")
  const [groupSelectedIds, setGroupSelectedIds] = React.useState<Set<string>>(new Set())
  const [creatingGroup, setCreatingGroup] = React.useState(false)
  const [createGroupError, setCreateGroupError] = React.useState<string | null>(null)

  // Visualização de membros
  const [conversationMembers, setConversationMembers] = React.useState<ConversationMemberView[]>([])
  const [conversationMembersLoading, setConversationMembersLoading] = React.useState(false)
  const [conversationMembersError, setConversationMembersError] = React.useState<string | null>(
    null,
  )

  // Confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = React.useState<ProjectConversationRow | null>(null)
  const [deletingGroup, setDeletingGroup] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

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
    setGroupMemberCounts({})
    setSelectedConversation(null)
    setMessages([])
    setDraft("")
    setProjectMembers([])
    setGroupTitle("")
    setGroupSelectedIds(new Set())
    setCreateGroupError(null)
    setConversationMembers([])
    setConfirmDelete(null)
    setDeleteError(null)
  }, [isAuthenticated])

  const supabaseReady = mounted && isSupabaseConfigured()

  // -------------------------------------------------------------------------
  // Data loaders
  // -------------------------------------------------------------------------

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
        new Set(
          ((membershipResult.data ?? []) as Array<{ project_id: string }>).map(
            (row) => row.project_id,
          ),
        ),
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

  React.useEffect(() => {
    if (!open) return
    if (!isAuthenticated) return
    if (view !== "projects") return
    void loadProjects()
  }, [isAuthenticated, loadProjects, open, view])

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
          .select(
            "id, project_id, kind, title, created_by, status, deleted_at, deleted_by, created_at, updated_at",
          )
          .eq("project_id", projectId)
          .eq("status", "active")
          .order("kind", { ascending: true })
          .order("created_at", { ascending: true })
        if (result.error) throw result.error
        const rows = (result.data ?? []) as ProjectConversationRow[]
        setConversations(rows)

        const groupIds = rows.filter((row) => row.kind === "group").map((row) => row.id)
        if (groupIds.length === 0) {
          setGroupMemberCounts({})
        } else {
          const countsResult = await client
            .from("project_conversation_members")
            .select("conversation_id")
            .in("conversation_id", groupIds)
          if (countsResult.error) throw countsResult.error
          const counts: Record<string, number> = {}
          const memberRows = (countsResult.data ?? []) as Array<{ conversation_id: string }>
          for (const row of memberRows) {
            counts[row.conversation_id] = (counts[row.conversation_id] ?? 0) + 1
          }
          setGroupMemberCounts(counts)
        }
      } catch (error) {
        setConversations([])
        setGroupMemberCounts({})
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
            .select(
              "id, full_name, email, course, bio, avatar_url, skills, interests, created_at, updated_at",
            )
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

  // Mantém uma referência sempre fresca de `messages` para o handler do
  // Realtime checar duplicidade sem precisar entrar nas dependências do effect
  // de inscrição (o que reinscreveria o canal a cada mensagem nova).
  const messagesRef = React.useRef<ChatMessage[]>([])
  React.useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Recebe uma row crua vinda do Realtime e a adiciona ao estado da conversa
  // aberta. Garante dedupe por id, enriquece com o perfil do remetente e
  // mantém a ordem cronológica.
  const handleRealtimeInsert = React.useCallback(
    async (row: ProjectMessageRow, expectedConversationId: string) => {
      if (!row || row.conversation_id !== expectedConversationId) return
      if (row.status !== "visible") return
      if (messagesRef.current.some((existing) => existing.id === row.id)) return

      let author: ProfileRow | null = null
      if (user && row.sender_id === user.id && profile) {
        author = profile
      } else {
        const existingAuthor = messagesRef.current.find(
          (msg) => msg.sender_id === row.sender_id && msg.author,
        )?.author
        if (existingAuthor) {
          author = existingAuthor
        } else if (supabaseReady) {
          try {
            const client = getSupabaseClient()
            const profileResult = await client
              .from("profiles")
              .select(
                "id, full_name, email, course, bio, avatar_url, skills, interests, created_at, updated_at",
              )
              .eq("id", row.sender_id)
              .maybeSingle()
            if (!profileResult.error && profileResult.data) {
              author = profileResult.data as ProfileRow
            }
          } catch {
            // Sem perfil disponível, a mensagem ainda aparece com fallback "Membro do projeto".
          }
        }
      }

      setMessages((prev) => {
        if (prev.some((existing) => existing.id === row.id)) return prev
        const next: ChatMessage = { ...row, author }
        const merged = [...prev, next]
        merged.sort((a, b) => {
          if (a.created_at === b.created_at) return a.id < b.id ? -1 : 1
          return a.created_at < b.created_at ? -1 : 1
        })
        return merged
      })
    },
    [profile, supabaseReady, user],
  )

  // Subscription do Supabase Realtime para a conversa aberta.
  //
  // Só roda quando o painel está aberto, na view de thread, com conversa
  // selecionada e usuário autenticado. O cleanup remove o canal sempre que
  // qualquer uma dessas condições mudar, evitando inscrições duplicadas.
  React.useEffect(() => {
    if (!open) return
    if (view !== "thread") return
    if (!isAuthenticated) return
    if (!supabaseReady) return
    if (!selectedConversation) return

    const conversationId = selectedConversation.id
    const client = getSupabaseClient()

    const channel = client.channel(`project_messages:${conversationId}`)

    channel.on(
      REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
      {
        event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
        schema: "public",
        table: "project_messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const row = payload.new as ProjectMessageRow | null
        if (!row) return
        void handleRealtimeInsert(row, conversationId)
      },
    )

    channel.subscribe()

    return () => {
      try {
        void client.removeChannel(channel)
      } catch {
        // Silencioso: se já foi removido por outro caminho, ignoramos.
      }
    }
  }, [
    handleRealtimeInsert,
    isAuthenticated,
    open,
    selectedConversation,
    supabaseReady,
    view,
  ])

  React.useEffect(() => {
    if (view !== "thread") return
    const node = threadScrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages, view])

  const loadProjectMembers = React.useCallback(
    async (projectId: string) => {
      if (!supabaseReady) {
        setProjectMembersError("Não foi possível conectar ao serviço de dados.")
        return
      }
      setProjectMembersLoading(true)
      setProjectMembersError(null)
      try {
        const client = getSupabaseClient()
        const membersResult = await client
          .from("project_members")
          .select("user_id")
          .eq("project_id", projectId)
          .eq("status", "active")
        if (membersResult.error) throw membersResult.error
        const userIds = Array.from(
          new Set(
            ((membersResult.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id),
          ),
        )
        if (userIds.length === 0) {
          setProjectMembers([])
          return
        }
        const profilesResult = await client
          .from("profiles")
          .select("id, full_name, course, avatar_url")
          .in("id", userIds)
        if (profilesResult.error) throw profilesResult.error
        const profileRows = (profilesResult.data ?? []) as Array<{
          id: string
          full_name: string | null
          course: string | null
          avatar_url: string | null
        }>
        const profilesById = new Map(profileRows.map((row) => [row.id, row]))
        const members: ProjectMemberOption[] = userIds.map((uid) => {
          const p = profilesById.get(uid)
          return {
            user_id: uid,
            full_name: p?.full_name ?? null,
            course: p?.course ?? null,
            avatar_url: p?.avatar_url ?? null,
          }
        })
        members.sort((a, b) =>
          (a.full_name ?? "").localeCompare(b.full_name ?? "", "pt-BR", { sensitivity: "base" }),
        )
        setProjectMembers(members)
      } catch (error) {
        setProjectMembers([])
        setProjectMembersError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os membros do projeto.",
        )
      } finally {
        setProjectMembersLoading(false)
      }
    },
    [supabaseReady],
  )

  const loadConversationMembers = React.useCallback(
    async (conversation: ProjectConversationRow) => {
      if (!supabaseReady) {
        setConversationMembersError("Não foi possível conectar ao serviço de dados.")
        return
      }
      setConversationMembersLoading(true)
      setConversationMembersError(null)
      try {
        const client = getSupabaseClient()

        if (conversation.kind === "general") {
          // Geral = todos os membros ativos do projeto.
          const membersResult = await client
            .from("project_members")
            .select("user_id, role")
            .eq("project_id", conversation.project_id)
            .eq("status", "active")
          if (membersResult.error) throw membersResult.error
          const rows = (membersResult.data ?? []) as Array<{
            user_id: string
            role: "owner" | "member" | "mentor"
          }>
          const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
          let profilesById = new Map<
            string,
            { id: string; full_name: string | null; course: string | null; avatar_url: string | null }
          >()
          if (userIds.length > 0) {
            const profilesResult = await client
              .from("profiles")
              .select("id, full_name, course, avatar_url")
              .in("id", userIds)
            if (profilesResult.error) throw profilesResult.error
            const profileRows = (profilesResult.data ?? []) as Array<{
              id: string
              full_name: string | null
              course: string | null
              avatar_url: string | null
            }>
            profilesById = new Map(profileRows.map((p) => [p.id, p]))
          }
          const members: ConversationMemberView[] = rows.map((row) => {
            const p = profilesById.get(row.user_id)
            return {
              user_id: row.user_id,
              full_name: p?.full_name ?? null,
              course: p?.course ?? null,
              avatar_url: p?.avatar_url ?? null,
              role: row.role,
            }
          })
          members.sort((a, b) =>
            (a.full_name ?? "").localeCompare(b.full_name ?? "", "pt-BR", { sensitivity: "base" }),
          )
          setConversationMembers(members)
          return
        }

        // Grupo personalizado = participantes registrados em project_conversation_members.
        const membersResult = await client
          .from("project_conversation_members")
          .select("user_id, role")
          .eq("conversation_id", conversation.id)
        if (membersResult.error) throw membersResult.error
        const rows = (membersResult.data ?? []) as Array<{
          user_id: string
          role: string
        }>
        const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
        let profilesById = new Map<
          string,
          { id: string; full_name: string | null; course: string | null; avatar_url: string | null }
        >()
        if (userIds.length > 0) {
          const profilesResult = await client
            .from("profiles")
            .select("id, full_name, course, avatar_url")
            .in("id", userIds)
          if (profilesResult.error) throw profilesResult.error
          const profileRows = (profilesResult.data ?? []) as Array<{
            id: string
            full_name: string | null
            course: string | null
            avatar_url: string | null
          }>
          profilesById = new Map(profileRows.map((p) => [p.id, p]))
        }
        const members: ConversationMemberView[] = rows.map((row) => {
          const p = profilesById.get(row.user_id)
          const role = row.role === "admin" ? "admin" : "member"
          return {
            user_id: row.user_id,
            full_name: p?.full_name ?? null,
            course: p?.course ?? null,
            avatar_url: p?.avatar_url ?? null,
            role,
          }
        })
        // admin primeiro, depois nome
        members.sort((a, b) => {
          if (a.role === "admin" && b.role !== "admin") return -1
          if (b.role === "admin" && a.role !== "admin") return 1
          return (a.full_name ?? "").localeCompare(b.full_name ?? "", "pt-BR", {
            sensitivity: "base",
          })
        })
        setConversationMembers(members)
      } catch (error) {
        setConversationMembers([])
        setConversationMembersError(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar os membros desta conversa.",
        )
      } finally {
        setConversationMembersLoading(false)
      }
    },
    [supabaseReady],
  )

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

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

  const handleSelectConversation = React.useCallback(
    (conversation: ProjectConversationRow) => {
      setSelectedConversation(conversation)
      setSendError(null)
      setDraft("")
      setView("thread")
    },
    [],
  )

  const handleOpenCreateGroup = React.useCallback(async () => {
    if (!selectedProject) return
    setGroupTitle("")
    setGroupSelectedIds(new Set())
    setCreateGroupError(null)
    setView("create-group")
    await loadProjectMembers(selectedProject.id)
  }, [loadProjectMembers, selectedProject])

  const handleToggleGroupMember = React.useCallback((userId: string) => {
    setGroupSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) {
        next.delete(userId)
      } else {
        next.add(userId)
      }
      return next
    })
    setCreateGroupError(null)
  }, [])

  const handleCreateGroup = React.useCallback(async () => {
    if (!user) return
    if (!selectedProject) return
    if (!supabaseReady) {
      setCreateGroupError("Não foi possível conectar ao serviço de dados.")
      return
    }
    const cleanTitle = groupTitle.trim()
    if (cleanTitle.length === 0) {
      setCreateGroupError("Informe um nome para o grupo.")
      return
    }
    if (cleanTitle.length > GROUP_TITLE_MAX_LENGTH) {
      setCreateGroupError(`O nome deve ter no máximo ${GROUP_TITLE_MAX_LENGTH} caracteres.`)
      return
    }
    const memberIds = Array.from(groupSelectedIds).filter((id) => id !== user.id)
    if (memberIds.length === 0) {
      setCreateGroupError("Selecione pelo menos um membro além de você.")
      return
    }
    setCreatingGroup(true)
    setCreateGroupError(null)
    try {
      const client = getSupabaseClient()
      const rpcResult = await client.rpc("create_project_group_conversation", {
        p_project_id: selectedProject.id,
        p_title: cleanTitle,
        p_member_ids: memberIds,
      })
      if (rpcResult.error) throw rpcResult.error
      setGroupTitle("")
      setGroupSelectedIds(new Set())
      await loadConversations(selectedProject.id)
      setView("conversations")
    } catch (error) {
      setCreateGroupError(
        error instanceof Error ? error.message : "Não foi possível criar o grupo agora.",
      )
    } finally {
      setCreatingGroup(false)
    }
  }, [groupSelectedIds, groupTitle, loadConversations, selectedProject, supabaseReady, user])

  const handleOpenMembers = React.useCallback(
    async (conversation: ProjectConversationRow) => {
      setConversationMembers([])
      setConversationMembersError(null)
      setView("members")
      await loadConversationMembers(conversation)
    },
    [loadConversationMembers],
  )

  const handleRequestDelete = React.useCallback((conversation: ProjectConversationRow) => {
    if (conversation.kind === "general") return
    setDeleteError(null)
    setConfirmDelete(conversation)
  }, [])

  const handleConfirmDelete = React.useCallback(async () => {
    if (!confirmDelete) return
    if (confirmDelete.kind === "general") {
      setConfirmDelete(null)
      return
    }
    if (!supabaseReady) {
      setDeleteError("Não foi possível conectar ao serviço de dados.")
      return
    }
    setDeletingGroup(true)
    setDeleteError(null)
    try {
      const client = getSupabaseClient()
      const rpcResult = await client.rpc("delete_project_group_conversation", {
        p_conversation_id: confirmDelete.id,
      })
      if (rpcResult.error) throw rpcResult.error
      const wasOpen = selectedConversation?.id === confirmDelete.id
      setConfirmDelete(null)
      if (wasOpen) {
        setSelectedConversation(null)
        setMessages([])
        setView("conversations")
      }
      if (selectedProject) {
        await loadConversations(selectedProject.id)
      }
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Não foi possível excluir o grupo agora.",
      )
    } finally {
      setDeletingGroup(false)
    }
  }, [confirmDelete, loadConversations, selectedConversation, selectedProject, supabaseReady])

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
      setGroupMemberCounts({})
      return
    }
    if (view === "create-group") {
      setCreateGroupError(null)
      setView("conversations")
      return
    }
    if (view === "members") {
      // Volta para o thread (se houver conversa aberta) ou para a lista.
      setConversationMembers([])
      setConversationMembersError(null)
      setView(selectedConversation ? "thread" : "conversations")
      return
    }
  }, [selectedConversation, view])

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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const headerTitle = (() => {
    if (view === "projects") return "Mensagens"
    if (view === "conversations") return selectedProject?.title ?? "Conversas"
    if (view === "create-group") return "Novo grupo"
    if (view === "members") return "Membros"
    return conversationLabel(selectedConversation)
  })()

  const headerSubtitle = (() => {
    if (view === "projects") return "Seus projetos ativos"
    if (view === "conversations") return "Conversa geral e seus grupos"
    if (view === "create-group") return selectedProject?.title ?? undefined
    if (view === "members") return conversationLabel(selectedConversation)
    if (view === "thread") return selectedProject?.title ?? undefined
    return undefined
  })()

  const showMembersButton =
    view === "thread" && selectedConversation && selectedConversation.kind !== "direct"

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
        "bottom-20 left-4 right-4 max-h-[min(72vh,640px)]",
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
              {headerTitle}
            </p>
            {headerSubtitle ? (
              <p className="truncate text-xs text-muted-foreground">{headerSubtitle}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showMembersButton && selectedConversation ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void handleOpenMembers(selectedConversation)}
              aria-label="Ver membros"
              title="Ver membros"
            >
              <Users className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
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
        </div>
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
            memberCounts={groupMemberCounts}
            onSelect={handleSelectConversation}
            onRetry={() =>
              selectedProject ? void loadConversations(selectedProject.id) : undefined
            }
            onCreateGroup={() => void handleOpenCreateGroup()}
            onViewMembers={(conversation) => void handleOpenMembers(conversation)}
            onRequestDelete={handleRequestDelete}
          />
        ) : null}

        {view === "create-group" ? (
          <CreateGroupView
            currentUserId={user?.id ?? ""}
            title={groupTitle}
            onTitleChange={(value) => {
              setGroupTitle(value)
              setCreateGroupError(null)
            }}
            members={projectMembers}
            selectedIds={groupSelectedIds}
            onToggleMember={handleToggleGroupMember}
            loading={projectMembersLoading}
            loadError={projectMembersError}
            onRetryLoad={() =>
              selectedProject ? void loadProjectMembers(selectedProject.id) : undefined
            }
            error={createGroupError}
            submitting={creatingGroup}
            onCancel={handleBack}
            onSubmit={() => void handleCreateGroup()}
          />
        ) : null}

        {view === "members" ? (
          <MembersListView
            loading={conversationMembersLoading}
            error={conversationMembersError}
            members={conversationMembers}
            onRetry={() =>
              selectedConversation ? void loadConversationMembers(selectedConversation) : undefined
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

      {confirmDelete ? (
        <ConfirmDeleteOverlay
          conversation={confirmDelete}
          deleting={deletingGroup}
          error={deleteError}
          onCancel={() => {
            if (deletingGroup) return
            setDeleteError(null)
            setConfirmDelete(null)
          }}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
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
              <span className="block truncate text-xs text-muted-foreground">
                Conversas do projeto
              </span>
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
  memberCounts: Record<string, number>
  onSelect: (conversation: ProjectConversationRow) => void
  onRetry: () => void
  onCreateGroup: () => void
  onViewMembers: (conversation: ProjectConversationRow) => void
  onRequestDelete: (conversation: ProjectConversationRow) => void
}

function ConversationsListView({
  loading,
  error,
  conversations,
  memberCounts,
  onSelect,
  onRetry,
  onCreateGroup,
  onViewMembers,
  onRequestDelete,
}: ConversationsListViewProps) {
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

  const general = conversations.find((conversation) => conversation.kind === "general")
  const groups = conversations.filter((conversation) => conversation.kind === "group")

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Conversas
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs font-semibold text-primary hover:bg-primary/10"
          onClick={onCreateGroup}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Novo grupo
        </Button>
      </div>

      <ul className="flex-1 overflow-y-auto p-2">
        {general ? (
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
        ) : (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">
            A conversa geral deste projeto ainda não foi criada.
          </li>
        )}

        {groups.length > 0 ? (
          <li
            aria-hidden
            className="my-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Grupos
          </li>
        ) : null}

        {groups.map((group) => {
          const count = memberCounts[group.id] ?? 0
          return (
            <li key={group.id} className="group/conv relative">
              <button
                type="button"
                onClick={() => onSelect(group)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 pr-10 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                  {initialsOf(group.title ?? "Grupo")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {group.title ?? "Grupo"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {count === 0
                      ? "Sem membros"
                      : count === 1
                        ? "1 membro"
                        : `${count} membros`}
                  </span>
                </span>
              </button>

              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Opções do grupo"
                    >
                      <MoreVertical className="h-4 w-4" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
                    <DropdownMenuItem onSelect={() => onViewMembers(group)}>
                      <Users className="h-4 w-4" aria-hidden /> Ver membros
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => onRequestDelete(group)}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden /> Excluir grupo
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface CreateGroupViewProps {
  currentUserId: string
  title: string
  onTitleChange: (value: string) => void
  members: ProjectMemberOption[]
  selectedIds: Set<string>
  onToggleMember: (userId: string) => void
  loading: boolean
  loadError: string | null
  onRetryLoad: () => void
  error: string | null
  submitting: boolean
  onCancel: () => void
  onSubmit: () => void
}

function CreateGroupView({
  currentUserId,
  title,
  onTitleChange,
  members,
  selectedIds,
  onToggleMember,
  loading,
  loadError,
  onRetryLoad,
  error,
  submitting,
  onCancel,
  onSubmit,
}: CreateGroupViewProps) {
  const others = members.filter((member) => member.user_id !== currentUserId)
  const selectedOthersCount = Array.from(selectedIds).filter((id) => id !== currentUserId).length

  const submitDisabled =
    submitting || title.trim().length === 0 || selectedOthersCount === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-4">
        <label
          htmlFor="chat-group-name"
          className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Nome do grupo
        </label>
        <Input
          id="chat-group-name"
          value={title}
          maxLength={GROUP_TITLE_MAX_LENGTH + 20}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Ex.: Frente de design"
          disabled={submitting}
          aria-invalid={Boolean(error) && title.trim().length === 0}
        />
      </div>

      <div className="mt-4 flex items-baseline justify-between px-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Membros do projeto
        </p>
        <p className="text-[11px] text-muted-foreground">
          Você entra como administrador
        </p>
      </div>

      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center px-6 py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando membros...
          </div>
        ) : loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-6 text-center">
            <p className="text-sm font-medium text-destructive">{loadError}</p>
            <Button type="button" variant="outline" size="sm" onClick={onRetryLoad}>
              Tentar novamente
            </Button>
          </div>
        ) : others.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-6 text-center">
            <Users className="h-7 w-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold text-foreground">Sem outros membros</p>
            <p className="text-xs text-muted-foreground">
              Convide alguém para o projeto antes de criar um grupo.
            </p>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto px-2">
            {others.map((member) => {
              const checked = selectedIds.has(member.user_id)
              const displayName = member.full_name?.trim() || "Membro do projeto"
              return (
                <li key={member.user_id}>
                  <label
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted",
                      checked && "bg-primary/5",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-primary"
                      checked={checked}
                      onChange={() => onToggleMember(member.user_id)}
                      disabled={submitting}
                      aria-label={`Selecionar ${displayName}`}
                    />
                    <UserAvatar
                      name={displayName}
                      imageUrl={member.avatar_url ?? undefined}
                      sizeClassName="h-8 w-8"
                      ring={false}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {displayName}
                      </span>
                      {member.course?.trim() ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.course}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-border bg-background/60 px-4 py-3">
        {error ? (
          <p role="alert" className="mb-2 text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={submitDisabled}
            className="font-semibold"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Criando...
              </>
            ) : (
              "Criar grupo"
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface MembersListViewProps {
  loading: boolean
  error: string | null
  members: ConversationMemberView[]
  onRetry: () => void
}

function MembersListView({ loading, error, members, onRetry }: MembersListViewProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando membros...
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
  if (members.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        <Users className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold text-foreground">Nenhum membro encontrado</p>
        <p className="text-xs text-muted-foreground">
          Esta conversa ainda não tem participantes.
        </p>
      </div>
    )
  }
  return (
    <ul className="flex-1 overflow-y-auto p-2">
      {members.map((member) => {
        const displayName = member.full_name?.trim() || "Membro do projeto"
        const roleLabel =
          member.role === "owner"
            ? "Dono do projeto"
            : member.role === "mentor"
              ? "Mentor"
              : member.role === "admin"
                ? "Admin"
                : "Membro"
        return (
          <li key={member.user_id}>
            <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
              <UserAvatar
                name={displayName}
                imageUrl={member.avatar_url ?? undefined}
                sizeClassName="h-9 w-9"
                ring={false}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                {member.course?.trim() ? (
                  <p className="truncate text-xs text-muted-foreground">{member.course}</p>
                ) : null}
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  member.role === "admin" || member.role === "owner"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {roleLabel}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

interface ConfirmDeleteOverlayProps {
  conversation: ProjectConversationRow
  deleting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}

function ConfirmDeleteOverlay({
  conversation,
  deleting,
  error,
  onCancel,
  onConfirm,
}: ConfirmDeleteOverlayProps) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Confirmar exclusão"
      className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm"
    >
      <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-xl">
        <p className="text-sm font-semibold text-foreground">
          Excluir {conversation.title?.trim() ? `“${conversation.title.trim()}”` : "este grupo"}?
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          As mensagens deixarão de aparecer para os membros, mas o histórico será preservado.
        </p>
        {error ? (
          <p role="alert" className="mt-2 text-xs font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={deleting}
            className="font-semibold"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Excluindo...
              </>
            ) : (
              "Excluir grupo"
            )}
          </Button>
        </div>
      </div>
    </div>
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
