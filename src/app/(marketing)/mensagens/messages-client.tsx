'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
} from '@supabase/supabase-js'
import { Loader2 } from 'lucide-react'

import { Container } from '@/components/layout/container'
import { PageHeader } from '@/components/team-link/page-header'
import { Button } from '@/components/ui/button'
import {
  createGroupConversation,
  deleteGroupConversation,
  fetchProfileById,
  loadAvailableProjectMembers,
  loadConversationMembers,
  loadConversationMessages,
  loadMyChatProjects,
  loadProjectConversations,
  sendMessage,
} from '@/lib/chat/loaders'
import type {
  ChatAvailableMember,
  ChatConversationListItem,
  ChatConversationMember,
  ChatProjectListItem,
  ChatThreadMessage,
} from '@/lib/chat/types'
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import type { ProfileRow, ProjectMessageRow } from '@/types/database'
import { cn } from '@/lib/utils'

import { ConfirmDeleteModal } from './_components/confirm-delete-modal'
import { ConversationsRail } from './_components/conversations-rail'
import { CreateGroupModal } from './_components/create-group-modal'
import { MembersPanel } from './_components/members-panel'
import { ProjectsRail } from './_components/projects-rail'
import { MESSAGE_MAX_LENGTH, ThreadPanel } from './_components/thread-panel'

type MobileStep = 'projects' | 'conversations' | 'thread'

export function MessagesClient() {
  const { isAuthenticated, loading: sessionLoading, user, profile } =
    useSupabaseSession()

  // ---------------------------------------------------------------------------
  // Estado base
  // ---------------------------------------------------------------------------

  const [supabaseReady, setSupabaseReady] = useState(false)

  useEffect(() => {
    setSupabaseReady(isSupabaseConfigured())
  }, [])

  // Projetos
  const [projects, setProjects] = useState<ChatProjectListItem[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectsError, setProjectsError] = useState<string | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  // Conversas
  const [conversations, setConversations] = useState<ChatConversationListItem[]>([])
  const [conversationsLoading, setConversationsLoading] = useState(false)
  const [conversationsError, setConversationsError] = useState<string | null>(null)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  // Mensagens
  const [messages, setMessages] = useState<ChatThreadMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesError, setMessagesError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  // Painel de membros
  const [membersOpen, setMembersOpen] = useState(false)
  const [members, setMembers] = useState<ChatConversationMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)

  // Criar grupo
  const [createOpen, setCreateOpen] = useState(false)
  const [availableMembers, setAvailableMembers] = useState<ChatAvailableMember[]>([])
  const [availableLoading, setAvailableLoading] = useState(false)
  const [availableError, setAvailableError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Excluir grupo
  const [pendingDelete, setPendingDelete] =
    useState<ChatConversationListItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Mobile step
  const [mobileStep, setMobileStep] = useState<MobileStep>('projects')

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === selectedConversationId) ??
      null,
    [conversations, selectedConversationId],
  )

  const currentUserName =
    profile?.full_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined) ||
    user?.email?.split('@')[0] ||
    'Você'

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  const reloadProjects = useCallback(async () => {
    if (!user || !supabaseReady) return
    setProjectsLoading(true)
    setProjectsError(null)
    try {
      const rows = await loadMyChatProjects(user.id)
      setProjects(rows)
    } catch (error) {
      console.error('[mensagens] loadMyChatProjects', error)
      setProjects([])
      setProjectsError('Não foi possível carregar seus projetos.')
    } finally {
      setProjectsLoading(false)
    }
  }, [supabaseReady, user])

  useEffect(() => {
    if (!isAuthenticated) return
    void reloadProjects()
  }, [isAuthenticated, reloadProjects])

  // Importante: não auto-selecionar o primeiro projeto ao carregar — o usuário pode
  // fechar o projeto (handleCloseProjectSelection) e permanecer só na coluna PROJETOS.

  const reloadConversations = useCallback(
    async (projectId: string) => {
      setConversationsLoading(true)
      setConversationsError(null)
      try {
        const rows = await loadProjectConversations(projectId)
        setConversations(rows)
        // Seleção padrão: se nada selecionado ou pertence a outro projeto,
        // foca a conversa Geral quando existir.
        setSelectedConversationId((current) => {
          if (current && rows.some((row) => row.id === current)) {
            return current
          }
          const general = rows.find((row) => row.kind === 'general')
          return general?.id ?? null
        })
      } catch (error) {
        console.error('[mensagens] loadProjectConversations', error)
        setConversations([])
        setConversationsError('Não foi possível carregar as conversas.')
      } finally {
        setConversationsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!selectedProjectId) {
      setConversations([])
      setSelectedConversationId(null)
      return
    }
    void reloadConversations(selectedProjectId)
  }, [reloadConversations, selectedProjectId])

  const reloadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true)
    setMessagesError(null)
    try {
      const rows = await loadConversationMessages(conversationId)
      setMessages(rows)
    } catch (error) {
      console.error('[mensagens] loadConversationMessages', error)
      setMessages([])
      setMessagesError('Não foi possível carregar as mensagens.')
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      setMessagesError(null)
      return
    }
    void reloadMessages(selectedConversationId)
  }, [reloadMessages, selectedConversationId])

  // Mantém referência fresca para o handler Realtime sem reinscrever.
  const messagesRef = useRef<ChatThreadMessage[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const handleRealtimeInsert = useCallback(
    async (row: ProjectMessageRow, expectedConversationId: string) => {
      if (!row || row.conversation_id !== expectedConversationId) return
      if (row.status !== 'visible') return
      if (messagesRef.current.some((existing) => existing.id === row.id)) return

      let author: ProfileRow | null = null
      if (user && row.sender_id === user.id && profile) {
        author = profile
      } else {
        const cached = messagesRef.current.find(
          (msg) => msg.sender_id === row.sender_id && msg.author,
        )?.author
        if (cached) {
          author = cached
        } else {
          author = await fetchProfileById(row.sender_id)
        }
      }

      setMessages((prev) => {
        if (prev.some((existing) => existing.id === row.id)) return prev
        const next: ChatThreadMessage = { ...row, author }
        const merged = [...prev, next]
        merged.sort((a, b) => {
          if (a.created_at === b.created_at) return a.id < b.id ? -1 : 1
          return a.created_at < b.created_at ? -1 : 1
        })
        return merged
      })
    },
    [profile, user],
  )

  // Realtime subscription idêntico ao do widget, escopado por conversa.
  useEffect(() => {
    if (!selectedConversationId) return
    if (!isAuthenticated) return
    if (!supabaseReady) return

    const conversationId = selectedConversationId
    const client = getSupabaseClient()
    const channel = client.channel(`central_messages:${conversationId}`)
    channel.on(
      REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
      {
        event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
        schema: 'public',
        table: 'project_messages',
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
        // silencioso — já removido em outra cadeia de cleanup.
      }
    }
  }, [handleRealtimeInsert, isAuthenticated, selectedConversationId, supabaseReady])

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSelectProject = useCallback(
    (project: ChatProjectListItem) => {
      setSelectedProjectId(project.id)
      setSelectedConversationId(null)
      setMessages([])
      setDraft('')
      setSendError(null)
      setMobileStep('conversations')
    },
    [],
  )

  const handleCloseProjectSelection = useCallback(() => {
    setSelectedProjectId(null)
    setSelectedConversationId(null)
    setDraft('')
    setSendError(null)
    setMembersOpen(false)
    setCreateOpen(false)
    setCreateError(null)
    setPendingDelete(null)
    setDeleteError(null)
    setMobileStep('projects')
  }, [])

  const handleSelectConversation = useCallback(
    (conversation: ChatConversationListItem) => {
      setSelectedConversationId(conversation.id)
      setDraft('')
      setSendError(null)
      setMobileStep('thread')
    },
    [],
  )

  const handleSend = useCallback(async () => {
    if (!user || !selectedConversation) return
    const content = draft.trim()
    if (content.length === 0) {
      setSendError('Digite uma mensagem antes de enviar.')
      return
    }
    if (content.length > MESSAGE_MAX_LENGTH) {
      setSendError(`A mensagem deve ter no máximo ${MESSAGE_MAX_LENGTH} caracteres.`)
      return
    }
    setSending(true)
    setSendError(null)
    try {
      await sendMessage({
        conversation_id: selectedConversation.id,
        sender_id: user.id,
        content,
      })
      setDraft('')
      await reloadMessages(selectedConversation.id)
    } catch (error) {
      console.error('[mensagens] sendMessage', error)
      setSendError('Não foi possível enviar a mensagem agora.')
    } finally {
      setSending(false)
    }
  }, [draft, reloadMessages, selectedConversation, user])

  const handleOpenMembers = useCallback(async () => {
    if (!selectedConversation) return
    setMembersOpen(true)
    setMembersLoading(true)
    setMembersError(null)
    try {
      const rows = await loadConversationMembers({
        id: selectedConversation.id,
        kind: selectedConversation.kind,
        project_id: selectedConversation.project_id,
      })
      setMembers(rows)
    } catch (error) {
      console.error('[mensagens] loadConversationMembers', error)
      setMembers([])
      setMembersError('Não foi possível carregar os membros desta conversa.')
    } finally {
      setMembersLoading(false)
    }
  }, [selectedConversation])

  const handleRetryMembers = useCallback(() => {
    void handleOpenMembers()
  }, [handleOpenMembers])

  const handleOpenCreateGroup = useCallback(async () => {
    if (!selectedProjectId) return
    setCreateOpen(true)
    setCreateError(null)
    setAvailableLoading(true)
    setAvailableError(null)
    try {
      const rows = await loadAvailableProjectMembers(selectedProjectId)
      setAvailableMembers(rows)
    } catch (error) {
      console.error('[mensagens] loadAvailableProjectMembers', error)
      setAvailableMembers([])
      setAvailableError('Não foi possível carregar os membros do projeto.')
    } finally {
      setAvailableLoading(false)
    }
  }, [selectedProjectId])

  const handleRetryAvailable = useCallback(() => {
    void handleOpenCreateGroup()
  }, [handleOpenCreateGroup])

  const handleCreateGroup = useCallback(
    async ({ title, memberIds }: { title: string; memberIds: string[] }) => {
      if (!selectedProjectId) return
      setCreating(true)
      setCreateError(null)
      try {
        await createGroupConversation({
          p_project_id: selectedProjectId,
          p_title: title,
          p_member_ids: memberIds,
        })
        await reloadConversations(selectedProjectId)
        // Tenta abrir o grupo recém-criado (pelo título), senão deixa a
        // seleção atual.
        setSelectedConversationId((current) => {
          const created = [...conversationsRef.current]
            .filter((row) => row.kind === 'group' && row.title?.trim() === title)
            .pop()
          return created?.id ?? current
        })
        setCreateOpen(false)
        setMobileStep('thread')
      } catch (error) {
        console.error('[mensagens] createGroupConversation', error)
        setCreateError('Não foi possível criar o grupo agora.')
      } finally {
        setCreating(false)
      }
    },
    [reloadConversations, selectedProjectId],
  )

  // Mantém referência atualizada para usar logo após reload no create.
  const conversationsRef = useRef<ChatConversationListItem[]>([])
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  const handleRequestDelete = useCallback(
    (conversation: ChatConversationListItem) => {
      if (conversation.kind === 'general') return
      setPendingDelete(conversation)
      setDeleteError(null)
    },
    [],
  )

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete || pendingDelete.kind === 'general') return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteGroupConversation({ p_conversation_id: pendingDelete.id })
      const wasOpen = selectedConversationId === pendingDelete.id
      if (selectedProjectId) {
        await reloadConversations(selectedProjectId)
      }
      if (wasOpen) {
        // Fallback: foca a conversa Geral se existir.
        setSelectedConversationId((current) => {
          if (!current) return null
          const general = conversationsRef.current.find(
            (row) => row.kind === 'general',
          )
          return general?.id ?? null
        })
      }
      setPendingDelete(null)
    } catch (error) {
      console.error('[mensagens] deleteGroupConversation', error)
      setDeleteError('Não foi possível excluir o grupo agora.')
    } finally {
      setDeleting(false)
    }
  }, [pendingDelete, reloadConversations, selectedConversationId, selectedProjectId])

  const handleCancelDelete = useCallback(() => {
    if (deleting) return
    setPendingDelete(null)
    setDeleteError(null)
  }, [deleting])

  // ---------------------------------------------------------------------------
  // Estados de borda
  // ---------------------------------------------------------------------------

  if (sessionLoading) {
    return (
      <main className="bg-background">
        <Container className="flex min-h-[calc(100vh-72px)] items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
        </Container>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="bg-background">
        <Container className="py-20">
          <PageHeader
            eyebrow="Central de mensagens"
            title="Entre para acessar suas conversas"
            description="Entre na sua conta para ver as mensagens dos seus projetos."
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-2xl font-semibold">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-2xl font-semibold">
              <Link href="/cadastro">Criar conta</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  if (!supabaseReady) {
    return (
      <main className="bg-background">
        <Container className="py-20">
          <PageHeader
            title="Não foi possível abrir suas conversas"
            description="Tente novamente em instantes. Se o problema continuar, volte para os seus projetos."
          />
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="rounded-2xl font-semibold">
              <Link href="/meus-projetos">Voltar para Meus projetos</Link>
            </Button>
          </div>
        </Container>
      </main>
    )
  }

  // ---------------------------------------------------------------------------
  // Layout (3 colunas no desktop, 1 coluna por etapa no mobile)
  // ---------------------------------------------------------------------------

  const showProjectsOnMobile = mobileStep === 'projects'
  const showConversationsOnMobile = mobileStep === 'conversations'
  const showThreadOnMobile = mobileStep === 'thread'

  const conversationTitleForMembers = selectedConversation
    ? selectedConversation.kind === 'general'
      ? 'Geral'
      : selectedConversation.title?.trim() || 'Grupo'
    : 'Conversa'

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <ProjectsRail
          projects={projects}
          selectedProjectId={selectedProjectId}
          onSelect={handleSelectProject}
          loading={projectsLoading}
          error={projectsError}
          onRetry={() => void reloadProjects()}
          className={cn(showProjectsOnMobile ? 'flex' : 'hidden', 'lg:flex')}
        />

        <ConversationsRail
          projectTitle={selectedProject?.title ?? 'Projeto'}
          conversations={conversations}
          selectedConversationId={selectedConversationId}
          onSelect={handleSelectConversation}
          onCreateGroup={() => void handleOpenCreateGroup()}
          onRequestDelete={handleRequestDelete}
          onViewMembers={(conversation) => {
            setSelectedConversationId(conversation.id)
            setMobileStep('thread')
            window.setTimeout(() => {
              void handleOpenMembers()
            }, 0)
          }}
          loading={conversationsLoading && Boolean(selectedProjectId)}
          error={conversationsError}
          onRetry={() =>
            selectedProjectId ? void reloadConversations(selectedProjectId) : undefined
          }
          onDismissProject={handleCloseProjectSelection}
          className={cn(
            showConversationsOnMobile ? 'flex' : 'hidden',
            selectedProjectId ? 'lg:flex' : 'lg:hidden',
          )}
        />

        <ThreadPanel
          projectTitle={selectedProject?.title ?? ''}
          conversation={selectedConversation}
          hasSelectedProject={Boolean(selectedProjectId)}
          messages={messages}
          loading={messagesLoading}
          error={messagesError}
          onRetry={() =>
            selectedConversationId ? void reloadMessages(selectedConversationId) : undefined
          }
          draft={draft}
          onDraftChange={(value) => {
            setDraft(value)
            if (sendError) setSendError(null)
          }}
          onSend={() => void handleSend()}
          sending={sending}
          sendError={sendError}
          onOpenMembers={() => void handleOpenMembers()}
          onBack={() => setMobileStep('conversations')}
          currentUserId={user?.id ?? null}
          currentUserName={currentUserName}
          currentUserAvatar={profile?.avatar_url ?? undefined}
          className={cn(
            showThreadOnMobile ? 'flex' : 'hidden',
            'lg:flex lg:min-w-0 lg:flex-1',
          )}
        />
      </div>

      <MembersPanel
        open={membersOpen}
        onClose={() => setMembersOpen(false)}
        conversationTitle={conversationTitleForMembers}
        members={members}
        loading={membersLoading}
        error={membersError}
        onRetry={handleRetryMembers}
      />

      <CreateGroupModal
        open={createOpen}
        projectTitle={selectedProject?.title ?? ''}
        members={availableMembers}
        loading={availableLoading}
        loadError={availableError}
        onRetryLoad={handleRetryAvailable}
        currentUserId={user?.id ?? null}
        saving={creating}
        saveError={createError}
        onCancel={() => {
          if (creating) return
          setCreateOpen(false)
          setCreateError(null)
        }}
        onSubmit={handleCreateGroup}
      />

      <ConfirmDeleteModal
        open={pendingDelete !== null}
        conversationTitle={pendingDelete?.title ?? null}
        deleting={deleting}
        error={deleteError}
        onCancel={handleCancelDelete}
        onConfirm={() => void handleConfirmDelete()}
      />
    </main>
  )
}
