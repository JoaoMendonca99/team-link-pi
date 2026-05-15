'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCcw, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { cn } from '@/lib/utils'

import type { ChatAvailableMember } from '@/lib/chat/types'

const GROUP_TITLE_MAX_LENGTH = 80

export function CreateGroupModal({
  open,
  projectTitle,
  members,
  loading,
  loadError,
  onRetryLoad,
  currentUserId,
  saving,
  saveError,
  onCancel,
  onSubmit,
}: {
  open: boolean
  projectTitle: string
  members: ChatAvailableMember[]
  loading: boolean
  loadError: string | null
  onRetryLoad: () => void
  currentUserId: string | null
  saving: boolean
  saveError: string | null
  onCancel: () => void
  onSubmit: (args: { title: string; memberIds: string[] }) => void | Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [validation, setValidation] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setTitle('')
      setSelected(new Set())
      setValidation(null)
    }
  }, [open])

  const others = useMemo(
    () => members.filter((member) => member.user_id !== currentUserId),
    [currentUserId, members],
  )
  const selectedOthers = useMemo(
    () => Array.from(selected).filter((id) => id !== currentUserId),
    [currentUserId, selected],
  )

  if (!open) return null

  function toggleMember(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
    setValidation(null)
  }

  async function handleSubmit() {
    const cleanTitle = title.trim()
    if (cleanTitle.length === 0) {
      setValidation('Informe um nome para o grupo.')
      return
    }
    if (cleanTitle.length > GROUP_TITLE_MAX_LENGTH) {
      setValidation(`O nome deve ter no máximo ${GROUP_TITLE_MAX_LENGTH} caracteres.`)
      return
    }
    if (selectedOthers.length === 0) {
      setValidation('Selecione pelo menos um membro além de você.')
      return
    }
    setValidation(null)
    await onSubmit({ title: cleanTitle, memberIds: selectedOthers })
  }

  const error = validation ?? saveError

  return (
    <>
      <button
        type="button"
        aria-label="Fechar"
        className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm"
        onClick={() => {
          if (saving) return
          onCancel()
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Criar novo grupo"
        className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6"
      >
        <div className="flex max-h-[min(calc(100dvh-2rem),720px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-card-outline bg-card shadow-2xl">
          <header className="flex items-start gap-2 border-b border-border bg-background/60 px-5 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">
                Novo grupo
              </p>
              <h3 className="mt-0.5 text-base font-semibold text-foreground">
                Criar grupo no projeto
              </h3>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{projectTitle}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={onCancel}
              disabled={saving}
              aria-label="Fechar"
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <div className="space-y-2">
              <label
                htmlFor="create-group-title"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Nome do grupo
              </label>
              <Input
                id="create-group-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setValidation(null)
                }}
                maxLength={GROUP_TITLE_MAX_LENGTH + 20}
                placeholder="Ex.: Frente de design"
                disabled={saving}
                aria-invalid={Boolean(validation) && title.trim().length === 0}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Membros do projeto
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Você entra como administrador.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-border bg-muted/40 py-8 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando membros...
                </div>
              ) : loadError ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 py-6 text-center">
                  <p className="text-sm font-medium text-destructive">
                    Não foi possível carregar os membros.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onRetryLoad}
                    disabled={saving}
                  >
                    <RefreshCcw className="h-4 w-4" aria-hidden />
                    Tentar novamente
                  </Button>
                </div>
              ) : others.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted/40 py-8 text-center">
                  <Users className="h-7 w-7 text-muted-foreground" aria-hidden />
                  <p className="text-sm font-semibold text-foreground">Sem outros membros</p>
                  <p className="text-xs text-muted-foreground">
                    Convide alguém para o projeto antes de criar um grupo.
                  </p>
                </div>
              ) : (
                <ul className="max-h-72 overflow-y-auto rounded-2xl border border-border bg-background/60">
                  {others.map((member) => {
                    const checked = selected.has(member.user_id)
                    const displayName = member.full_name?.trim() || 'Membro do projeto'
                    return (
                      <li key={member.user_id} className="border-b border-border/60 last:border-b-0">
                        <label
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted',
                            checked && 'bg-primary/5',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 cursor-pointer accent-primary"
                            checked={checked}
                            onChange={() => toggleMember(member.user_id)}
                            disabled={saving}
                            aria-label={`Selecionar ${displayName}`}
                          />
                          <UserAvatar
                            name={displayName}
                            imageUrl={member.avatar_url ?? undefined}
                            sizeClassName="h-9 w-9"
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
          </div>

          <div className="border-t border-border bg-background/70 px-5 py-3">
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
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                size="sm"
                className="font-semibold"
                onClick={() => void handleSubmit()}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Criando...
                  </>
                ) : (
                  'Criar grupo'
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
