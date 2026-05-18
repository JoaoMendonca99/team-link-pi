import type { MemberBadgeColor } from '@/types/database'

export type ProjectMembershipRole = 'owner' | 'admin' | 'member' | 'mentor'

export interface ProjectMembership {
  role: ProjectMembershipRole
  displayRole: string | null
  badgeColor: MemberBadgeColor | null
  /** Quando ausente, tratado como sem acesso SAC explícito. */
  supportAccess?: boolean
}

/** Dono do projeto ou membro com cargo real owner/admin. */
export function isProjectManager(
  userId: string | null | undefined,
  projectOwnerId: string,
  membership: ProjectMembership | null,
): boolean {
  if (!userId) return false
  if (userId === projectOwnerId) return true
  const role = membership?.role
  return role === 'owner' || role === 'admin'
}

/** Dono, admin ou membro com `support_access` — tickets e contador no painel. */
export function canAccessProjectSupport(
  userId: string | null | undefined,
  projectOwnerId: string,
  membership: ProjectMembership | null,
): boolean {
  if (!userId) return false
  if (isProjectManager(userId, projectOwnerId, membership)) return true
  return membership?.supportAccess === true
}

/** Acesso ao painel interno: dono ou membro ativo vinculado. */
export function canAccessProjectPanel(
  userId: string | null | undefined,
  projectOwnerId: string,
  membership: ProjectMembership | null,
): boolean {
  if (!userId) return false
  if (userId === projectOwnerId) return true
  return Boolean(membership)
}
