'use client'

import Link from 'next/link'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { GripVertical, Pencil, Search, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { getSupabaseClient } from '@/lib/supabase/client'
import type {
  MemberBadgeColor,
  ProjectPublicMemberRow,
} from '@/types/database'
import { cn } from '@/lib/utils'
import { recruitmentRpc } from '@/components/team-link/recruitment'

import { computeMemberBadge, isValidBadgeColor } from './member-badge'
import { EditMemberRoleDialog } from './edit-member-role-dialog'

const TEAM_LEVELS = [
  { id: 'owner', singular: 'Líder', plural: 'Líderes', style: 'border-primary/30 bg-primary/10 text-primary' },
  { id: 'manager', singular: 'Gestor', plural: 'Gestores', style: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  { id: 'reviewer', singular: 'Revisor', plural: 'Revisores', style: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300' },
  { id: 'member', singular: 'Membro', plural: 'Membros', style: 'border-border bg-muted text-muted-foreground' },
] as const

type Level = typeof TEAM_LEVELS[number]['id']
type LevelChange = { userId: string; from: Level; to: Level }

const LEVEL_SUMMARY: Record<Level, string> = {
  owner: 'Poderá editar o projeto, administrar vagas e candidaturas e gerenciar a equipe.',
  manager: 'Poderá editar o projeto, administrar vagas e candidaturas e gerenciar a equipe.',
  reviewer: 'Terá acesso de Revisor, sem gestão da equipe ou do recrutamento.',
  member: 'Terá acesso de Membro, sem gestão da equipe ou do recrutamento.',
}

const normalizeName = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLocaleLowerCase('pt-BR')

export interface MembersPreviewCardHandle {
  reload: () => Promise<void>
}

interface Props {
  projectId: string
  onAdminChange?: (allowed: boolean) => void
  currentUserId?: string | null
  /** Disparado quando o cargo visual de algum membro é alterado por aqui. */
  onMemberUpdated?: () => void
  onMemberRemoved?: () => void
  onMembersChange?: (members: ProjectPublicMemberRow[]) => void
  onCountChange?: (next: number) => void
}

export const MembersPreviewCard = forwardRef<MembersPreviewCardHandle, Props>(
  function MembersPreviewCard(
    {
      projectId,
      onAdminChange,
      currentUserId,
      onMemberUpdated,
      onMemberRemoved,
      onMembersChange,
      onCountChange,
    },
    ref,
  ) {
    const [levels, setLevels] = useState<Record<string, string>>({})
    const [members, setMembers] = useState<ProjectPublicMemberRow[]>([])
    const teamDialogRef = useRef<HTMLDialogElement>(null)
    const [search, setSearch] = useState('')
    const [filter, setFilter] = useState('all')
    const [teamOpen, setTeamOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState('')
    const [editingUserId, setEditingUserId] = useState<string | null>(null)

    const [draggedId, setDraggedId] = useState<string | null>(null)
    const [hoveredLevel, setHoveredLevel] = useState<Level | null>(null)
    const [change, setChange] = useState<LevelChange | null>(null)
    const [moveError, setMoveError] = useState('')
    const [moving, setMoving] = useState(false)
    const confirmationRef = useRef<HTMLDialogElement>(null)

    const ownLevel = currentUserId ? levels[currentUserId] : undefined
    const canChangeLevels = ownLevel === 'owner' || ownLevel === 'manager'

    const allowedLevels = useCallback((userId: string): Level[] =>
      canChangeLevels && levels[userId] ? TEAM_LEVELS.map(({ id }) => id) : [],
    [canChangeLevels, levels])

    useEffect(() => {
      onAdminChange?.(canChangeLevels)
    }, [canChangeLevels, onAdminChange])

    useEffect(() => {
      if (change && !confirmationRef.current?.open) confirmationRef.current?.showModal()
    }, [change])

    function clearDrag() {
      setDraggedId(null)
      setHoveredLevel(null)
    }

    function closeConfirmation() {
      confirmationRef.current?.close()
      setChange(null)
      setMoveError('')
    }

    async function confirmChange() {
      if (!change || moving || !allowedLevels(change.userId).includes(change.to)) return
      setMoving(true)
      setMoveError('')
      try {
        await recruitmentRpc('recruitment_move_member', {
          p_project: projectId, p_user: change.userId, p_previous: change.from, p_level: change.to,
        })
        setLevels((current) => ({ ...current, [change.userId]: change.to }))
        setFilter('all')
        onMemberUpdated?.()
        closeConfirmation()
      } catch (error) {
        setMoveError(error instanceof Error ? error.message : 'Não foi possível alterar o nível.')
      } finally {
        setMoving(false)
      }
    }

    const load = useCallback(async () => {
      setLoading(true)
      setErrorMessage(null)
      const client = getSupabaseClient()
      const { data, error } = await client
        .from('project_public_members')
        .select(
          'id, project_id, user_id, role, status, joined_at, full_name, course, avatar_url, display_role, badge_color, vacancy_roles',
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

    useEffect(() => {
      let active = true
      void recruitmentRpc<Record<string, string>>('recruitment_member_levels', { p_project: projectId })
        .then((value) => { if (active) setLevels(value) }).catch(() => { if (active) setLevels({}) })
      return () => { active = false }
    }, [projectId, currentUserId])

    useImperativeHandle(ref, () => ({ reload: load }), [load])

    useEffect(() => {
      onMembersChange?.(members)
    }, [members, onMembersChange])

    const editingMember = useMemo(() => {
      if (!editingUserId) return null
      return members.find((m) => m.user_id === editingUserId) ?? null
    }, [editingUserId, members])

    const handleSave = useCallback(
      async ({
        displayRole,
        badgeColor,
        accessLevel,
      }: {
        displayRole: string | null
        badgeColor: MemberBadgeColor | null
        accessLevel?: string
      }) => {
        if (!editingMember || !canChangeLevels || (accessLevel && !allowedLevels(editingMember.user_id).includes(accessLevel as Level))) {
          return { ok: false as const, message: 'Você não pode atribuir este nível.' }
        }
        const targetUserId = editingMember.user_id
        try {
          if (accessLevel) {
            await recruitmentRpc('recruitment_set_access', {
              p_project: projectId, p_user: targetUserId, p_level: accessLevel,
              p_display_role: displayRole, p_badge_color: badgeColor,
            })
            setLevels((previous) => ({ ...previous, [targetUserId]: accessLevel }))
          } else {
            const rows = await recruitmentRpc<Array<{ user_id: string }>>('update_project_member_visual_role', {
              p_project_id: projectId, p_user_id: targetUserId,
              p_display_role: displayRole, p_badge_color: badgeColor,
            })
            if (!rows.some((row) => row.user_id === targetUserId)) {
              throw new Error('Não foi possível atualizar o cargo deste integrante.')
            }
          }
          setMembers((previous) => previous.map((member) => member.user_id === targetUserId
            ? { ...member, display_role: displayRole, badge_color: badgeColor } : member))
          setFilter('all')
          onMemberUpdated?.()
          return { ok: true as const }
        } catch (error) {
          return { ok: false as const, message: error instanceof Error ? error.message : 'Falha ao atualizar integrante.' }
        }
      },
      [allowedLevels, canChangeLevels, editingMember, onMemberUpdated, projectId],
    )

    async function removeMember() {
      if (!editingMember || !canChangeLevels) return { ok: false as const, message: 'Você não tem permissão para remover integrantes.' }
      const target = editingMember.user_id
      try {
        await recruitmentRpc('remove_project_member', { p_project: projectId, p_user: target })
        const remaining = members.filter((member) => member.user_id !== target)
        setMembers(remaining)
        setLevels((current) => {
          const next = { ...current }
          delete next[target]
          return next
        })
        setFilter('all')
        setSuccessMessage('Integrante removido do projeto.')
        onCountChange?.(remaining.length)
        onMemberRemoved?.()
        return { ok: true as const }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível remover este integrante.'
        return { ok: false as const, message: message.includes('pelo menos um Líder ou Gestor')
          ? 'Este projeto precisa manter pelo menos um Líder ou Gestor. Promova outro integrante antes de removê-lo.'
          : message }
      }
    }

    useEffect(() => {
      if (!teamOpen) return
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = previousOverflow }
    }, [teamOpen])

    const grouped = useMemo(() => {
      const groups = TEAM_LEVELS.map((level) => ({ ...level, rows: [] as ProjectPublicMemberRow[] }))
      for (const member of members) {
        const level = levels[member.user_id] ?? 'member'
        const group = groups.find((entry) => entry.id === level) ?? groups[3]
        group.rows.push(member)
      }
      for (const group of groups) {
        group.rows.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR', { sensitivity: 'base' }))
      }
      return groups
    }, [levels, members])

    const query = normalizeName(search)
    const visibleGroups = grouped
      .filter((group) => draggedId || filter === 'all' || filter === group.id)
      .map((group) => ({ ...group, rows: group.rows.filter((member) => normalizeName(member.full_name ?? '').includes(query)) }))
      .filter((group) => group.rows.length > 0 || canChangeLevels)
    const preview = grouped.flatMap((group) => group.rows).slice(0, 5)

    function openTeam() {
      const dialog = teamDialogRef.current
      if (dialog && !dialog.open) dialog.showModal()
      setTeamOpen(true)
    }

    function returnToTeam() {
      setEditingUserId(null)
      openTeam()
    }

    function renderMembers(rows: ProjectPublicMemberRow[]) {
      return (
          <ul className="grid auto-rows-fr gap-2 sm:grid-cols-2">
            {rows.map((member) => {
              const name = member.full_name?.trim() || 'Membro'
              const profileHref =
                currentUserId && currentUserId === member.user_id
                  ? '/perfil'
                  : `/usuarios/${member.user_id}`
              const canDrag = allowedLevels(member.user_id).length > 0
              const isLeader = levels[member.user_id] === 'owner'
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
                  className={cn('relative flex min-w-0 gap-3 overflow-hidden rounded-2xl border border-card-outline/70 bg-muted/20 p-3',
                    draggedId === member.user_id && 'opacity-50 ring-1 ring-primary')}
                >
                  {canDrag && (
                    <button type="button" draggable tabIndex={-1} title="Arrastar para alterar nível"
                      aria-label={'Arrastar ' + name}
                      className="hidden shrink-0 cursor-grab self-start rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing sm:block"
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', member.user_id)
                        event.dataTransfer.effectAllowed = 'move'
                        setDraggedId(member.user_id)
                      }}
                      onDragEnd={clearDrag}>
                      <GripVertical aria-hidden className="size-4" />
                    </button>
                  )}
                  {canDrag ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 z-10 h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        teamDialogRef.current?.close()
                        setTeamOpen(false)
                        setEditingUserId(member.user_id)
                      }}
                      aria-label={`Editar cargo de ${name}`}
                      title="Editar cargo"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                  ) : null}
                  <div className="shrink-0 self-start">
                    <UserAvatar
                      name={name}
                      imageUrl={member.avatar_url || undefined}
                      sizeClassName="h-9 w-9"
                      ring={false}
                    />
                  </div>
                  <div
                    className={cn(
                      'min-w-0 flex-1 space-y-1',
                      canDrag ? 'pr-9' : undefined,
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
                    {member.display_role?.trim() && !(isLeader && normalizeName(member.display_role) === 'lider') ? <span
                      title={badge.label}
                      className={cn(
                        'mt-0.5 inline-block max-w-full rounded-xl border px-2.5 py-0.5 text-[10px] font-semibold [overflow-wrap:anywhere]',
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span> : null}
                    {member.vacancy_roles?.filter((role) => role !== member.display_role).map((role) => (
                      <p key={role} className="text-xs font-medium text-muted-foreground [overflow-wrap:anywhere]">{role}</p>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
      )
    }

    return (
      <section
        id="equipe-do-projeto"
        className="rounded-[1.75rem] border border-card-outline bg-card p-4 shadow-sm sm:p-5 scroll-mt-24"
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

          </div>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" aria-hidden />
          </span>
        </header>

        {loading ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 1 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted" />
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
          <>
            <div className="mb-3 mt-3 flex items-center -space-x-2" aria-hidden="true">
              {preview.map((member) => (
                <UserAvatar key={member.user_id} name={member.full_name?.trim() || 'Membro'} imageUrl={member.avatar_url || undefined}
                  sizeClassName="h-9 w-9 border-2 border-card" ring={false} />
              ))}
              {members.length > preview.length ? (
                <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-card bg-muted text-xs font-semibold">
                  +{members.length - preview.length}
                </span>
              ) : null}
            </div>
            {preview.some((member) => member.display_role?.trim()) && (
              <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Cargos personalizados">
                {preview.filter((member) => member.display_role?.trim() &&
                  !(levels[member.user_id] === 'owner' && normalizeName(member.display_role) === 'lider')).map((member) => {
                  const badge = computeMemberBadge(member)
                  return <li key={member.user_id} title={member.full_name ?? undefined}
                    className={cn('max-w-full rounded-xl border px-2 py-0.5 text-[10px] font-semibold [overflow-wrap:anywhere]', badge.className)}>
                    <span className="sr-only">{member.full_name || 'Integrante'} · </span>{badge.label}
                  </li>
                })}
              </ul>
            )}
            {preview.some((member) => member.vacancy_roles?.some((role) => role !== member.display_role)) && (
              <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Cargos das vagas">
                {preview.flatMap((member) => member.vacancy_roles?.filter((role) => role !== member.display_role).map((role) => (
                  <li key={member.user_id + ':' + role} title={member.full_name ?? undefined}
                    className="max-w-full rounded-xl border border-border px-2 py-0.5 text-[10px] font-semibold [overflow-wrap:anywhere]">
                    <span className="sr-only">{member.full_name || 'Integrante'} · </span>{role}
                  </li>
                )) ?? [])}
              </ul>
            )}
            <ul className="flex flex-wrap gap-1.5" aria-label="Distribuição por nível de acesso">
              {grouped.filter((group) => group.rows.length > 0).map((group) => (
                <li key={group.id} className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', group.style)}>
                  {group.rows.length} {group.rows.length === 1 ? group.singular : group.plural}
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" className="mt-3 w-full rounded-xl"
              aria-haspopup="dialog" onClick={() => { setSearch(''); setFilter('all'); openTeam() }}>
              Ver todos os integrantes
            </Button>
          </>
        )}

        {successMessage && !teamOpen && <p role="status" className="mt-3 text-sm text-primary">{successMessage}</p>}

        <dialog ref={teamDialogRef} onClose={() => { if (!teamDialogRef.current?.open) setTeamOpen(false) }}
          aria-labelledby="project-team-title"
          className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-3xl overflow-hidden rounded-3xl border border-card-outline bg-card p-0 text-card-foreground shadow-xl backdrop:bg-black/70">
          {teamOpen ? (
            <div className="flex max-h-[85dvh] min-w-0 flex-col">
              <header className="shrink-0 space-y-3 border-b border-border p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="project-team-title" className="text-lg font-semibold">Integrantes do projeto</h2>
                    <p className="text-sm text-muted-foreground">{members.length} {members.length === 1 ? 'integrante' : 'integrantes'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Líderes e Gestores têm as mesmas permissões administrativas.</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" aria-label="Fechar integrantes"
                    onClick={() => teamDialogRef.current?.close()}>
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative min-w-0">
                    <Search aria-hidden className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input type="search" aria-label="Buscar por nome" placeholder="Buscar por nome"
                      value={search} onChange={(event) => setSearch(event.target.value)} className="w-full pl-9" />
                  </div>
                  <select aria-label="Filtrar por nível de acesso" value={filter} onChange={(event) => setFilter(event.target.value)}
                    className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm">
                    <option value="all">Todos os níveis</option>
                    {grouped.filter((group) => canChangeLevels || group.rows.length > 0).map((group) => <option key={group.id} value={group.id}>{group.plural}</option>)}
                  </select>
                </div>
              </header>
              <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-5">
                {successMessage && <p role="status" className="text-sm text-primary">{successMessage}</p>}
                {visibleGroups.length ? visibleGroups.map((group) => {
                  const label = group.rows.length === 1 ? group.singular : group.plural
                  const validDrop = Boolean(draggedId && levels[draggedId] !== group.id && allowedLevels(draggedId).includes(group.id))
                  return (
                  <section key={group.id} aria-label={label}
                    className={cn('rounded-2xl', validDrop && 'outline outline-1 outline-dashed outline-primary/50',
                      validDrop && hoveredLevel === group.id && 'bg-primary/10 outline-primary')}
                    onDragOver={(event) => {
                      if (!validDrop) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      setHoveredLevel(group.id)
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoveredLevel(null)
                    }}
                    onDrop={(event) => {
                      if (!validDrop || !draggedId) return
                      event.preventDefault()
                      setChange({ userId: draggedId, from: levels[draggedId] as Level, to: group.id })
                      clearDrag()
                    }}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <span className={cn('mr-2 inline-block rounded-full border px-2 py-0.5', group.style)}>
                        {label}
                      </span>
                      {group.rows.length} {group.rows.length === 1 ? 'integrante' : 'integrantes'}
                    </h3>
                    {group.rows.length ? renderMembers(group.rows) : (
                      <p className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                        {query ? 'Nenhum resultado neste nível.' : 'Nenhum integrante neste nível.'}
                      </p>
                    )}
                  </section>
                  )
                }) : <p role="status" className="text-sm text-muted-foreground">Nenhum integrante corresponde à busca.</p>}
              </div>
            </div>
          ) : null}
        </dialog>

        <dialog ref={confirmationRef} aria-labelledby="confirm-member-level"
          onCancel={(event) => { event.preventDefault(); if (!moving) closeConfirmation() }}
          className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-3xl border border-card-outline bg-card p-5 text-card-foreground shadow-2xl backdrop:bg-black/60">
          {change && (
            <div className="space-y-3">
              <h2 id="confirm-member-level" className="text-lg font-semibold">Alterar nível de acesso</h2>
              <p>{members.find((member) => member.user_id === change.userId)?.full_name || 'Integrante'}</p>
              <p className="font-semibold text-primary">
                {TEAM_LEVELS.find((level) => level.id === change.from)?.singular} → {TEAM_LEVELS.find((level) => level.id === change.to)?.singular}
              </p>
              <p className="text-sm text-muted-foreground">
                {['owner', 'manager'].includes(change.from) && ['owner', 'manager'].includes(change.to)
                  ? 'As permissões administrativas serão mantidas.'
                  : LEVEL_SUMMARY[change.to]}
              </p>
              {moveError && <p role="alert" className="text-sm text-destructive">{moveError}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" disabled={moving} onClick={closeConfirmation}>Cancelar</Button>
                <Button type="button" disabled={moving} onClick={() => void confirmChange()}>
                  {moving ? 'Salvando…' : 'Confirmar alteração'}
                </Button>
              </div>
            </div>
          )}
        </dialog>

        <EditMemberRoleDialog
          open={editingMember !== null}
          member={editingMember}
          onClose={returnToTeam}
          onSave={handleSave}
          onRemove={editingMember && canChangeLevels ? removeMember : undefined}
          showAccessLevel
          accessLevel={editingMember ? levels[editingMember.user_id] : undefined}
          accessOptions={editingMember ? allowedLevels(editingMember.user_id) : []}
        />
      </section>
    )
  },
)
