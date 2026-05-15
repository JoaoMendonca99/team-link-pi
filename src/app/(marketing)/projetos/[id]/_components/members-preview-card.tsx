'use client'

import Link from 'next/link'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import { Pencil, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { getSupabaseClient } from '@/lib/supabase/client'
import type {
  MemberBadgeColor,
  ProjectPublicMemberRow,
} from '@/types/database'
import { cn } from '@/lib/utils'

import { computeMemberBadge, isValidBadgeColor } from './member-badge'
import { EditMemberRoleDialog } from './edit-member-role-dialog'

export interface MembersPreviewCardHandle {
  reload: () => Promise<void>
}

interface Props {
  projectId: string
  projectOwnerId?: string | null
  currentUserId?: string | null
  /** Disparado quando o cargo visual de algum membro é alterado por aqui. */
  onMemberUpdated?: () => void
  onCountChange?: (next: number) => void
}

export const MembersPreviewCard = forwardRef<MembersPreviewCardHandle, Props>(
  function MembersPreviewCard(
    {
      projectId,
      projectOwnerId,
      currentUserId,
      onMemberUpdated,
      onCountChange,
    },
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
        .select(
          'id, project_id, user_id, role, status, joined_at, full_name, course, avatar_url, display_role, badge_color',
        )
        .eq('project_id', projectId)
        .order('joined_at', { ascending: true })

      if (error) {
        setErrorMessage('Não foi possível carregar a equipe.')
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
        const targetUserId = editingMember.user_id
        const payload = {
          p_project_id: projectId,
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
          if (typeof window !== 'undefined') {
            console.error('[update_project_member_visual_role:preview]', {
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

        type RpcRow = {
          user_id: string
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
              ? { ...m, display_role: nextDisplayRole, badge_color: nextBadgeColor }
              : m,
          ),
        )
        onMemberUpdated?.()
        return { ok: true as const }
      },
      [editingMember, onMemberUpdated, projectId],
    )

    return (
      <section
        id="equipe-do-projeto"
        className="rounded-[1.75rem] border border-card-outline bg-card p-6 shadow-lg scroll-mt-24"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
              Equipe do projeto
            </p>
            <h3 className="mt-1 text-lg font-semibold">
              {loading
                ? 'Carregando equipe…'
                : `${members.length} ${members.length === 1 ? 'membro' : 'membros'}`}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Veja quem faz parte deste projeto.
            </p>
          </div>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" aria-hidden />
          </span>
        </header>

        {loading ? (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        ) : errorMessage ? (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {errorMessage}
          </p>
        ) : members.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum membro listado ainda.
          </p>
        ) : (
          <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {members.map((member) => {
              const name = member.full_name?.trim() || 'Membro'
              const profileHref =
                currentUserId && currentUserId === member.user_id
                  ? '/perfil'
                  : `/usuarios/${member.user_id}`
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
                  className="relative flex min-w-0 gap-3 overflow-hidden rounded-2xl border border-card-outline/70 bg-muted/20 p-4"
                >
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 z-10 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setEditingUserId(member.user_id)}
                      aria-label={`Editar cargo de ${name}`}
                      title="Editar cargo"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : null}
                  <div className="shrink-0 self-start">
                    <UserAvatar
                      name={name}
                      imageUrl={member.avatar_url ?? undefined}
                      sizeClassName="h-11 w-11"
                      ring={false}
                    />
                  </div>
                  <div
                    className={cn(
                      'min-w-0 flex-1 space-y-1',
                      canManage ? 'pr-9' : undefined,
                    )}
                  >
                    <Link
                      href={profileHref}
                      title={name}
                      className="block truncate text-sm font-semibold text-primary hover:underline"
                    >
                      {name}
                    </Link>
                    {member.course ? (
                      <p
                        title={member.course}
                        className="truncate text-xs leading-snug text-muted-foreground"
                      >
                        {member.course}
                      </p>
                    ) : null}
                    <span
                      title={badge.label}
                      className={cn(
                        'mt-0.5 inline-block max-w-full truncate rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        'whitespace-nowrap',
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <EditMemberRoleDialog
          open={editingMember !== null}
          member={editingMember}
          onClose={() => setEditingUserId(null)}
          onSave={handleSave}
        />
      </section>
    )
  },
)
