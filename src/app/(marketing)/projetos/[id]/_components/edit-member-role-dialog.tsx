'use client'

import * as React from 'react'
import { Check, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { cn } from '@/lib/utils'
import type { MemberBadgeColor } from '@/types/database'

import {
  BADGE_COLOR_CLASSES,
  BADGE_COLOR_OPTIONS,
  BADGE_COLOR_SWATCH,
  DISPLAY_ROLE_MAX_LENGTH,
  ROLE_SUGGESTIONS,
  defaultBadgeColorFor,
  defaultDisplayLabelFor,
  formatDisplayLabel,
  isValidBadgeColor,
} from './member-badge'

export interface EditMemberRoleDialogProps {
  open: boolean
  onClose: () => void
  member: {
    user_id: string
    full_name: string | null
    course: string | null
    avatar_url: string | null
    role: string
    display_role?: string | null
    badge_color?: MemberBadgeColor | null
  } | null
  onSave: (input: {
    displayRole: string | null
    badgeColor: MemberBadgeColor | null
  }) => Promise<{ ok: true } | { ok: false; message: string }>
}

export function EditMemberRoleDialog({
  open,
  onClose,
  member,
  onSave,
}: EditMemberRoleDialogProps) {
  const [displayRole, setDisplayRole] = React.useState('')
  const [badgeColor, setBadgeColor] = React.useState<MemberBadgeColor>('blue')
  const [saving, setSaving] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // Sincroniza o estado do form com o membro selecionado sempre que abrir.
  React.useEffect(() => {
    if (!open || !member) return
    setErrorMessage(null)
    setDisplayRole((member.display_role ?? '').trim())
    const incomingColor = isValidBadgeColor(member.badge_color ?? null)
      ? (member.badge_color as MemberBadgeColor)
      : defaultBadgeColorFor(member.role)
    setBadgeColor(incomingColor)
    // Foco no input após renderizar.
    queueMicrotask(() => {
      inputRef.current?.focus()
    })
  }, [member, open])

  // ESC fecha o modal e trava o scroll do body enquanto aberto.
  React.useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, open, saving])

  if (!open || !member) return null

  const trimmed = displayRole.trim()
  const previewLabel = trimmed ? formatDisplayLabel(trimmed) : defaultDisplayLabelFor(member.role)
  const previewClassName = BADGE_COLOR_CLASSES[badgeColor]
  const memberName = member.full_name?.trim() || 'Membro'

  async function submit({ resetToDefault }: { resetToDefault: boolean }) {
    if (saving) return
    setSaving(true)
    setErrorMessage(null)
    const result = await onSave({
      displayRole: resetToDefault ? null : trimmed.length > 0 ? trimmed : null,
      badgeColor: resetToDefault ? null : badgeColor,
    })
    if (result.ok) {
      onClose()
    } else {
      setErrorMessage(result.message)
    }
    setSaving(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-member-role-title"
      className="fixed inset-0 z-[80] flex items-center justify-center px-4"
    >
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={() => {
          if (saving) return
          onClose()
        }}
        className="absolute inset-0 cursor-default bg-background/80 backdrop-blur-sm"
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-3xl border border-card-outline bg-card text-card-foreground shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-border/70 bg-background/40 px-5 py-4">
          <div className="min-w-0">
            <h2 id="edit-member-role-title" className="text-base font-semibold leading-tight">
              Editar cargo
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{memberName}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => {
              if (saving) return
              onClose()
            }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </header>

        <div className="max-h-[min(calc(100dvh-180px),520px)] overflow-y-auto px-5 py-4">
          {/* Preview */}
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3 py-3">
            <UserAvatar
              name={memberName}
              imageUrl={member.avatar_url ?? undefined}
              sizeClassName="h-10 w-10"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{memberName}</p>
              {member.course ? (
                <p className="truncate text-xs text-muted-foreground">{member.course}</p>
              ) : null}
            </div>
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                previewClassName,
              )}
            >
              {previewLabel}
            </span>
          </div>

          {/* Cargo exibido */}
          <div className="space-y-1.5">
            <label htmlFor="edit-member-role-input" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cargo exibido
            </label>
            <Input
              id="edit-member-role-input"
              ref={inputRef}
              value={displayRole}
              maxLength={DISPLAY_ROLE_MAX_LENGTH}
              onChange={(event) => setDisplayRole(event.target.value)}
              placeholder="Ex.: Desenvolvedor, Designer, ADM..."
              disabled={saving}
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Deixe vazio para usar o padrão do cargo real.</span>
              <span className="tabular-nums">
                {displayRole.length}/{DISPLAY_ROLE_MAX_LENGTH}
              </span>
            </div>
          </div>

          {/* Sugestões rápidas */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sugestões
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ROLE_SUGGESTIONS.map((suggestion) => {
                const active = trimmed.toLowerCase() === suggestion.toLowerCase()
                return (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDisplayRole(suggestion)}
                    disabled={saving}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-primary/60 bg-primary/10 text-primary'
                        : 'border-border bg-muted/40 text-foreground hover:bg-muted',
                      saving && 'opacity-50',
                    )}
                  >
                    {suggestion}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Cor do selo */}
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Cor do selo
            </p>
            <div className="flex flex-wrap gap-2">
              {BADGE_COLOR_OPTIONS.map((option) => {
                const selected = option.value === badgeColor
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setBadgeColor(option.value)}
                    disabled={saving}
                    aria-pressed={selected}
                    aria-label={`Cor ${option.label}`}
                    title={option.label}
                    className={cn(
                      'group flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all',
                      selected ? 'border-foreground/70 shadow-sm' : 'border-transparent hover:border-foreground/30',
                      saving && 'opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full',
                        BADGE_COLOR_SWATCH[option.value],
                      )}
                    >
                      {selected ? <Check className="h-3.5 w-3.5 text-white drop-shadow" aria-hidden /> : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {errorMessage ? (
            <p role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-background/40 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void submit({ resetToDefault: true })}
            disabled={saving}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Usar padrão
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (saving) return
                onClose()
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void submit({ resetToDefault: false })}
              disabled={saving}
              className="font-semibold"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
