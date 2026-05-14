/**
 * Camada de acesso a dados do chat.
 *
 * Cada loader tenta primeiro a RPC do Supabase (caminho "oficial"). Se a
 * função ainda não estiver publicada no banco (códigos 42883 / PGRST202),
 * recorremos às consultas diretas que o widget flutuante já usa hoje.
 * Dessa forma a central de mensagens funciona em qualquer estágio do
 * deploy do banco, sem expor erro técnico para o usuário final.
 *
 * Mutations (`createGroupConversation`, `deleteGroupConversation`,
 * `sendMessage`) continuam sendo feitas pela RPC ou padrão já existente —
 * a fonte de verdade de permissão é a RLS do Supabase.
 */

import { getSupabaseClient } from '@/lib/supabase/client'
import type {
  CreateProjectGroupConversationArgs,
  DeleteProjectGroupConversationArgs,
  ProfileRow,
  ProjectConversationRow,
  ProjectMessageRow,
  ProjectRow,
} from '@/types/database'

import type {
  ChatAvailableMember,
  ChatConversationListItem,
  ChatConversationMember,
  ChatProjectListItem,
  ChatThreadMessage,
} from './types'

interface SupabaseLikeError {
  code?: string | null
  message?: string | null
}

/**
 * Heurística para detectar "função/RPC inexistente" no PostgREST/Postgres.
 * Quando isso acontece caímos no fallback de consultas diretas.
 */
function isMissingRpc(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) return false
  if (error.code === '42883' || error.code === 'PGRST202') return true
  const message = (error.message ?? '').toLowerCase()
  if (message.includes('could not find the function')) return true
  if (message.includes('function') && message.includes('does not exist')) return true
  return false
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value == null) return null
  return String(value)
}

// =============================================================================
// Projetos do usuário
// =============================================================================

interface RpcProjectRow {
  id?: string | null
  project_id?: string | null
  title?: string | null
  project_title?: string | null
  last_message_content?: string | null
  last_message_at?: string | null
  unread_count?: number | string | null
}

function mapRpcProject(row: RpcProjectRow): ChatProjectListItem {
  const id = (row.id ?? row.project_id ?? '') as string
  const title = (row.title ?? row.project_title ?? 'Projeto sem nome') as string
  return {
    id,
    title,
    lastMessageContent: row.last_message_content ?? null,
    lastMessageAt: row.last_message_at ?? null,
    unreadCount: asNumber(row.unread_count) ?? 0,
  }
}

export async function loadMyChatProjects(userId: string): Promise<ChatProjectListItem[]> {
  const client = getSupabaseClient()
  const rpc = await client.rpc('get_my_chat_projects')
  if (!rpc.error) {
    const rows = Array.isArray(rpc.data) ? (rpc.data as RpcProjectRow[]) : []
    return rows.map(mapRpcProject).filter((item) => item.id.length > 0)
  }
  if (!isMissingRpc(rpc.error)) {
    throw new Error(rpc.error.message ?? 'falha ao carregar projetos')
  }
  return await loadMyChatProjectsFallback(userId)
}

async function loadMyChatProjectsFallback(userId: string): Promise<ChatProjectListItem[]> {
  const client = getSupabaseClient()
  const membership = await client
    .from('project_members')
    .select('project_id')
    .eq('user_id', userId)
    .eq('status', 'active')
  if (membership.error) throw new Error(membership.error.message)
  const projectIds = Array.from(
    new Set(
      ((membership.data ?? []) as Array<{ project_id: string }>).map(
        (row) => row.project_id,
      ),
    ),
  )
  if (projectIds.length === 0) return []
  const projects = await client
    .from('projects')
    .select('id, title')
    .in('id', projectIds)
    .order('updated_at', { ascending: false })
  if (projects.error) throw new Error(projects.error.message)
  const rows = (projects.data ?? []) as Array<Pick<ProjectRow, 'id' | 'title'>>
  return rows.map((row) => ({ id: row.id, title: row.title }))
}

// =============================================================================
// Conversas de um projeto
// =============================================================================

interface RpcConversationRow {
  id?: string | null
  conversation_id?: string | null
  project_id?: string | null
  kind?: string | null
  title?: string | null
  members_count?: number | string | null
  can_delete?: boolean | string | null
  last_message_content?: string | null
  last_message_at?: string | null
  unread_count?: number | string | null
}

function mapRpcConversation(
  row: RpcConversationRow,
  projectId: string,
): ChatConversationListItem | null {
  const id = (row.id ?? row.conversation_id ?? '') as string
  if (!id) return null
  const kind = (row.kind ?? 'group') as ChatConversationListItem['kind']
  return {
    id,
    project_id: (row.project_id ?? projectId) as string,
    kind,
    title: row.title ?? null,
    members_count: asNumber(row.members_count),
    can_delete: asBoolean(row.can_delete),
    last_message_content: row.last_message_content ?? null,
    last_message_at: row.last_message_at ?? null,
    unread_count: asNumber(row.unread_count),
  }
}

export async function loadProjectConversations(
  projectId: string,
): Promise<ChatConversationListItem[]> {
  const client = getSupabaseClient()
  const rpc = await client.rpc('get_project_chat_conversations', {
    p_project_id: projectId,
  })
  if (!rpc.error) {
    const rows = Array.isArray(rpc.data) ? (rpc.data as RpcConversationRow[]) : []
    return rows
      .map((row) => mapRpcConversation(row, projectId))
      .filter((row): row is ChatConversationListItem => row !== null)
  }
  if (!isMissingRpc(rpc.error)) {
    throw new Error(rpc.error.message ?? 'falha ao carregar conversas')
  }
  return await loadProjectConversationsFallback(projectId)
}

async function loadProjectConversationsFallback(
  projectId: string,
): Promise<ChatConversationListItem[]> {
  const client = getSupabaseClient()
  const conversations = await client
    .from('project_conversations')
    .select(
      'id, project_id, kind, title, status, created_at, updated_at',
    )
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('kind', { ascending: true })
    .order('created_at', { ascending: true })
  if (conversations.error) throw new Error(conversations.error.message)
  const rows = (conversations.data ?? []) as Array<
    Pick<ProjectConversationRow, 'id' | 'project_id' | 'kind' | 'title'>
  >

  // Carrega contagem de membros dos grupos para preview.
  const groupIds = rows.filter((row) => row.kind === 'group').map((row) => row.id)
  let memberCounts: Record<string, number> = {}
  if (groupIds.length > 0) {
    const counts = await client
      .from('project_conversation_members')
      .select('conversation_id')
      .in('conversation_id', groupIds)
    if (counts.error) throw new Error(counts.error.message)
    memberCounts = {}
    for (const row of (counts.data ?? []) as Array<{ conversation_id: string }>) {
      memberCounts[row.conversation_id] = (memberCounts[row.conversation_id] ?? 0) + 1
    }
  }

  return rows.map((row) => ({
    id: row.id,
    project_id: row.project_id,
    kind: row.kind,
    title: row.title,
    members_count: row.kind === 'group' ? memberCounts[row.id] ?? 0 : undefined,
    can_delete: row.kind === 'group' ? undefined : false,
  }))
}

// =============================================================================
// Membros de uma conversa
// =============================================================================

interface RpcConversationMemberRow {
  user_id?: string | null
  full_name?: string | null
  course?: string | null
  avatar_url?: string | null
  role?: string | null
}

function mapRpcConversationMember(
  row: RpcConversationMemberRow,
): ChatConversationMember | null {
  const user_id = asString(row.user_id)
  if (!user_id) return null
  return {
    user_id,
    full_name: row.full_name ?? null,
    course: row.course ?? null,
    avatar_url: row.avatar_url ?? null,
    role: (row.role ?? 'member') as string,
  }
}

export async function loadConversationMembers(
  conversation: { id: string; kind: string; project_id: string },
): Promise<ChatConversationMember[]> {
  const client = getSupabaseClient()
  const rpc = await client.rpc('get_chat_conversation_members', {
    p_conversation_id: conversation.id,
  })
  if (!rpc.error) {
    const rows = Array.isArray(rpc.data)
      ? (rpc.data as RpcConversationMemberRow[])
      : []
    return rows
      .map(mapRpcConversationMember)
      .filter((row): row is ChatConversationMember => row !== null)
  }
  if (!isMissingRpc(rpc.error)) {
    throw new Error(rpc.error.message ?? 'falha ao carregar membros')
  }
  return await loadConversationMembersFallback(conversation)
}

async function loadConversationMembersFallback(
  conversation: { id: string; kind: string; project_id: string },
): Promise<ChatConversationMember[]> {
  const client = getSupabaseClient()

  if (conversation.kind === 'general') {
    const result = await client
      .from('project_members')
      .select('user_id, role')
      .eq('project_id', conversation.project_id)
      .eq('status', 'active')
    if (result.error) throw new Error(result.error.message)
    const rows = (result.data ?? []) as Array<{ user_id: string; role: string }>
    return await enrichWithProfiles(rows)
  }

  const result = await client
    .from('project_conversation_members')
    .select('user_id, role')
    .eq('conversation_id', conversation.id)
  if (result.error) throw new Error(result.error.message)
  const rows = (result.data ?? []) as Array<{ user_id: string; role: string }>
  return await enrichWithProfiles(rows)
}

async function enrichWithProfiles(
  rows: Array<{ user_id: string; role: string }>,
): Promise<ChatConversationMember[]> {
  if (rows.length === 0) return []
  const client = getSupabaseClient()
  const userIds = Array.from(new Set(rows.map((row) => row.user_id)))
  const profiles = await client
    .from('profiles')
    .select('id, full_name, course, avatar_url')
    .in('id', userIds)
  if (profiles.error) throw new Error(profiles.error.message)
  const profileRows = (profiles.data ?? []) as Array<{
    id: string
    full_name: string | null
    course: string | null
    avatar_url: string | null
  }>
  const byId = new Map(profileRows.map((row) => [row.id, row]))
  return rows.map((row) => {
    const profile = byId.get(row.user_id)
    return {
      user_id: row.user_id,
      full_name: profile?.full_name ?? null,
      course: profile?.course ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role: row.role,
    }
  })
}

// =============================================================================
// Membros disponíveis para um grupo novo
// =============================================================================

export async function loadAvailableProjectMembers(
  projectId: string,
): Promise<ChatAvailableMember[]> {
  const client = getSupabaseClient()
  const rpc = await client.rpc('get_project_chat_available_members', {
    p_project_id: projectId,
  })
  if (!rpc.error) {
    const rows = Array.isArray(rpc.data)
      ? (rpc.data as RpcConversationMemberRow[])
      : []
    return rows
      .map((row) => {
        const user_id = asString(row.user_id)
        if (!user_id) return null
        return {
          user_id,
          full_name: row.full_name ?? null,
          course: row.course ?? null,
          avatar_url: row.avatar_url ?? null,
        }
      })
      .filter((row): row is ChatAvailableMember => row !== null)
  }
  if (!isMissingRpc(rpc.error)) {
    throw new Error(rpc.error.message ?? 'falha ao carregar membros disponíveis')
  }
  return await loadAvailableMembersFallback(projectId)
}

async function loadAvailableMembersFallback(
  projectId: string,
): Promise<ChatAvailableMember[]> {
  const client = getSupabaseClient()
  const members = await client
    .from('project_members')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('status', 'active')
  if (members.error) throw new Error(members.error.message)
  const userIds = Array.from(
    new Set(
      ((members.data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id),
    ),
  )
  if (userIds.length === 0) return []
  const profiles = await client
    .from('profiles')
    .select('id, full_name, course, avatar_url')
    .in('id', userIds)
  if (profiles.error) throw new Error(profiles.error.message)
  const rows = (profiles.data ?? []) as Array<{
    id: string
    full_name: string | null
    course: string | null
    avatar_url: string | null
  }>
  return rows
    .map((row) => ({
      user_id: row.id,
      full_name: row.full_name,
      course: row.course,
      avatar_url: row.avatar_url,
    }))
    .sort((a, b) =>
      (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR', {
        sensitivity: 'base',
      }),
    )
}

// =============================================================================
// Mensagens da conversa atual (mesma consulta direta do widget)
// =============================================================================

export async function loadConversationMessages(
  conversationId: string,
): Promise<ChatThreadMessage[]> {
  const client = getSupabaseClient()
  const result = await client
    .from('project_messages')
    .select(
      'id, conversation_id, sender_id, content, status, created_at, updated_at',
    )
    .eq('conversation_id', conversationId)
    .eq('status', 'visible')
    .order('created_at', { ascending: true })
  if (result.error) throw new Error(result.error.message)
  const rows = (result.data ?? []) as ProjectMessageRow[]
  if (rows.length === 0) return []
  const senderIds = Array.from(new Set(rows.map((row) => row.sender_id)))
  const profiles = await client
    .from('profiles')
    .select(
      'id, full_name, email, course, bio, avatar_url, skills, interests, created_at, updated_at',
    )
    .in('id', senderIds)
  if (profiles.error) throw new Error(profiles.error.message)
  const profileRows = (profiles.data ?? []) as ProfileRow[]
  const byId = new Map(profileRows.map((row) => [row.id, row]))
  return rows.map((row) => ({ ...row, author: byId.get(row.sender_id) ?? null }))
}

// =============================================================================
// Mutations
// =============================================================================

export async function createGroupConversation(
  args: CreateProjectGroupConversationArgs,
): Promise<void> {
  const client = getSupabaseClient()
  const result = await client.rpc('create_project_group_conversation', args)
  if (result.error) throw new Error(result.error.message)
}

export async function deleteGroupConversation(
  args: DeleteProjectGroupConversationArgs,
): Promise<void> {
  const client = getSupabaseClient()
  const result = await client.rpc('delete_project_group_conversation', args)
  if (result.error) throw new Error(result.error.message)
}

export async function sendMessage(args: {
  conversation_id: string
  sender_id: string
  content: string
}): Promise<void> {
  const client = getSupabaseClient()
  const result = await client.from('project_messages').insert({
    conversation_id: args.conversation_id,
    sender_id: args.sender_id,
    content: args.content,
    status: 'visible',
  })
  if (result.error) throw new Error(result.error.message)
}

export async function fetchProfileById(userId: string): Promise<ProfileRow | null> {
  const client = getSupabaseClient()
  const result = await client
    .from('profiles')
    .select(
      'id, full_name, email, course, bio, avatar_url, skills, interests, created_at, updated_at',
    )
    .eq('id', userId)
    .maybeSingle()
  if (result.error) return null
  return (result.data as ProfileRow | null) ?? null
}
