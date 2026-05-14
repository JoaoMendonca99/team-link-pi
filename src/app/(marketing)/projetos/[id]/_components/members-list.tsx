'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import { Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { getSupabaseClient } from '@/lib/supabase/client'
import type {
  MemberBadgeColor,
  ProjectPublicMemberRow,
} from '@/types/database'
import { cn } from '@/lib/utils'

import {
  computeMemberBadge,
  isValidBadgeColor,
} from './member-badge'
import { EditMemberRoleDialog } from './edit-member-role-dialog'

export interface MembersListHandle {
  reload: () => Promise<void>
}

interface MembersListProps {
  projectId: string
  /** ID do dono do projeto (lido em `projects.owner_id` / `project_public_details.owner_id`). */
  projectOwnerId?: string | null
  /** ID do usuário logado, se houver. */
  currentUserId?: string | null
  onCountChange?: (next: number) => void
}

export const MembersList = forwardRef<MembersListHandle, MembersListProps>(
  function MembersList(
    { projectId, projectOwnerId, currentUserId, onCountChange },
    ref,
  ) {
    const [members, setMembers] = useState<ProjectPublicMemberRow[]>([])
    const [loading, setLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [editingUserId, setEditingUserId] = useState<string | null>(null)

    const load = useCallback(async () => {
      setLoading(true)
      setErrorMessage(null)
      const client = getSupabaseClient()
      // Lê da view `public.project_public_members`, que já foi atualizada
      // para expor também `display_role` e `badge_color`. O `select`
      // explícito mantém o contrato visível e evita depender de `*`.
      const { data, error } = await client
        .from('project_public_members')
        .select(
          'id, project_id, user_id, role, status, joined_at, full_name, course, avatar_url, display_role, badge_color',
        )
        .eq('project_id', projectId)
        .order('joined_at', { ascending: true })

      if (error) {
        setErrorMessage('Não foi possível carregar membros.')
        setMembers([])
      } else {
        const rows = (data ?? []) as ProjectPublicMemberRow[]
        setMembers(rows)
        onCountChange?.(rows.length)
      }
      setLoading(false)
    }, [onCountChange, projectId])

    useEffect(() => {
      void load()
    }, [load])

    useImperativeHandle(ref, () => ({ reload: load }), [load])

    /**
     * Permissão de edição no front:
     * - É o dono do projeto, OU
     * - É um membro do próprio projeto com role 'owner' ou 'admin'.
     * O banco/RPC continua sendo a fonte da verdade — esta checagem é só
     * para esconder o botão de quem claramente não pode editar.
     */
    const canManage = useMemo(() => {
      if (!currentUserId) return false
      if (projectOwnerId && projectOwnerId === currentUserId) return true
      const me = members.find((m) => m.user_id === currentUserId)
      if (!me) return false
      return me.role === 'owner' || me.role === 'admin'
    }, [currentUserId, members, projectOwnerId])

    const editingMember = useMemo(() => {
      if (!editingUserId) return null
      return members.find((m) => m.user_id === editingUserId) ?? null
    }, [editingUserId, members])

    const handleSave = useCallback(
      async ({
        displayRole,
        badgeColor,
      }: {
        displayRole: string | null
        badgeColor: MemberBadgeColor | null
      }) => {
        if (!editingMember) {
          return { ok: false as const, message: 'Não foi possível salvar o cargo agora.' }
        }

        // Captura local — elimina qualquer dúvida de closure stale se o
        // estado mudar enquanto a RPC está em voo.
        const targetUserId = editingMember.user_id
        const targetProjectId = projectId
        const payload = {
          p_project_id: targetProjectId,
          p_user_id: targetUserId,
          p_display_role: displayRole,
          p_badge_color: badgeColor,
        }

        const client = getSupabaseClient()
        const { data, error } = await client.rpc(
          'update_project_member_visual_role',
          payload,
        )

        if (error) {
          // Diagnóstico técnico no console (visível só para devs). A UI
          // continua mostrando a mensagem amigável.
          if (typeof window !== 'undefined') {
            console.error('[update_project_member_visual_role]', {
              payload,
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
              raw: error,
            })
          }
          return { ok: false as const, message: 'Não foi possível salvar o cargo agora.' }
        }

        // Fonte de verdade: o que o banco efetivamente persistiu.
        // A RPC retorna TABLE(member_id, project_id, user_id, role,
        // display_role, badge_color). Se vier vazia, caímos no payload
        // local como fallback (mesma intenção do usuário).
        type RpcRow = {
          member_id?: string | null
          project_id?: string | null
          user_id: string
          role?: string | null
          display_role: string | null
          badge_color: string | null
        }
        const rpcRows: RpcRow[] = Array.isArray(data) ? (data as RpcRow[]) : []
        const persisted = rpcRows.find((row) => row.user_id === targetUserId) ?? null

        const nextDisplayRole = persisted?.display_role ?? displayRole
        const nextBadgeColorRaw = persisted?.badge_color ?? badgeColor
        const nextBadgeColor: MemberBadgeColor | null = isValidBadgeColor(
          nextBadgeColorRaw ?? null,
        )
          ? (nextBadgeColorRaw as MemberBadgeColor)
          : null

        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === targetUserId
              ? {
                  ...m,
                  display_role: nextDisplayRole,
                  badge_color: nextBadgeColor,
                }
              : m,
          ),
        )
        return { ok: true as const }
      },
      [editingMember, projectId],
    )

    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      )
    }

    if (errorMessage) {
      return (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {errorMessage}
        </p>
      )
    }

    if (members.length === 0) {
      return (
        <p className="rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum membro listado.
        </p>
      )
    }

    return (
      <>
        <ul className="space-y-3">
          {members.map((member) => {
            const name = member.full_name?.trim() || 'Membro'
            const badge = computeMemberBadge({
              role: member.role,
              display_role: member.display_role,
              badge_color: isValidBadgeColor(member.badge_color ?? null)
                ? (member.badge_color as MemberBadgeColor)
                : null,
            })
            return (
              <li
                key={`${member.project_id}-${member.user_id}`}
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3"
              >
                <UserAvatar
                  name={name}
                  imageUrl={member.avatar_url ?? undefined}
                  sizeClassName="h-10 w-10"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{name}</p>
                  {member.course ? (
                    <p className="truncate text-xs text-muted-foreground">{member.course}</p>
                  ) : null}
                </div>
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
                {canManage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => setEditingUserId(member.user_id)}
                    aria-label={`Editar cargo de ${name}`}
                    title="Editar cargo"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>

        <EditMemberRoleDialog
          open={editingMember !== null}
          member={editingMember}
          onClose={() => setEditingUserId(null)}
          onSave={handleSave}
        />
      </>
    )
  },
)
