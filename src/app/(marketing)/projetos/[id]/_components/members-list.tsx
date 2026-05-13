'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react'

import { UserAvatar } from '@/components/team-link/user-avatar'
import { getSupabaseClient } from '@/lib/supabase/client'
import type { ProjectMemberRoleValue, ProjectPublicMemberRow } from '@/types/database'
import { cn } from '@/lib/utils'

export interface MembersListHandle {
  reload: () => Promise<void>
}

const ROLE_PRESET: Record<ProjectMemberRoleValue, { label: string; className: string }> = {
  owner: {
    label: 'Dono',
    className: 'border-primary/40 bg-primary/10 text-primary',
  },
  member: {
    label: 'Membro',
    className: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300',
  },
  mentor: {
    label: 'Mentor',
    className: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  },
}

function pickRolePreset(role: string) {
  if (role in ROLE_PRESET) {
    return ROLE_PRESET[role as ProjectMemberRoleValue]
  }
  return {
    label: role,
    className: 'border-border bg-muted text-muted-foreground',
  }
}

export const MembersList = forwardRef<
  MembersListHandle,
  {
    projectId: string
    onCountChange?: (next: number) => void
  }
>(function MembersList({ projectId, onCountChange }, ref) {
  const [members, setMembers] = useState<ProjectPublicMemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
      <p role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
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
    <ul className="space-y-3">
      {members.map((member) => {
        const name = member.full_name?.trim() || 'Membro'
        const preset = pickRolePreset(member.role)
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
                preset.className,
              )}
            >
              {preset.label}
            </span>
          </li>
        )
      })}
    </ul>
  )
})
