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
      const { data, error } = await client
        .from('project_public_members')
        .select('*')
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
        const client = getSupabaseClient()
        const { error } = await client.rpc('update_project_member_visual_role', {
          p_project_id: projectId,
          p_user_id: editingMember.user_id,
          p_display_role: displayRole,
          p_badge_color: badgeColor,
        })
        if (error) {
          return { ok: false as const, message: 'Não foi possível salvar o cargo agora.' }
        }
        // Atualiza localmente para refletir sem refetch.
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === editingMember.user_id
              ? {
                  ...m,
                  display_role: displayRole,
                  badge_color: badgeColor,
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
