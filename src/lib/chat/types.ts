/**
 * Tipos canônicos usados pela camada de chat (widget flutuante e central
 * de mensagens). Estes shapes são produzidos pelos *loaders* em
 * `src/lib/chat/loaders.ts`, que tentam usar as RPCs do banco e caem em
 * consultas diretas como fallback. A UI só consome estes tipos — nunca
 * o shape cru retornado pelo banco.
 */

import type {
  ProfileRow,
  ProjectConversationKind,
  ProjectMessageRow,
} from '@/types/database'

/** Item da lista de projetos do usuário (sidebar esquerda da central). */
export interface ChatProjectListItem {
  id: string
  title: string
  /** Última mensagem visível em qualquer conversa do projeto. */
  lastMessageContent?: string | null
  lastMessageAt?: string | null
  /** Total de mensagens ainda não lidas pelo usuário neste projeto. */
  unreadCount?: number
}

/** Item da lista de conversas de um projeto (coluna do meio). */
export interface ChatConversationListItem {
  id: string
  project_id: string
  kind: ProjectConversationKind
  title: string | null
  /** Total de participantes (geral = todos do projeto; grupo = lista própria). */
  members_count?: number
  /** Permissão calculada pelo banco (quando a RPC fornece). */
  can_delete?: boolean
  /** Pré-visualização de última mensagem. */
  last_message_content?: string | null
  last_message_at?: string | null
  unread_count?: number
}

/** Pessoa listada no painel direito (membros da conversa atual). */
export interface ChatConversationMember {
  user_id: string
  full_name: string | null
  course: string | null
  avatar_url: string | null
  /** Papel no projeto/conversa (owner, admin, member, mentor...). */
  role: string
}

/** Pessoa que pode ser adicionada a um novo grupo. */
export interface ChatAvailableMember {
  user_id: string
  full_name: string | null
  course: string | null
  avatar_url: string | null
}

/** Mensagem da thread com o perfil do remetente quando disponível. */
export interface ChatThreadMessage extends ProjectMessageRow {
  author?: ProfileRow | null
}
