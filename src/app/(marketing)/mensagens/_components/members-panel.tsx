'use client'

import { Loader2, RefreshCcw, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/team-link/user-avatar'
import { cn } from '@/lib/utils'

import type { ChatConversationMember } from '@/lib/chat/types'

function roleLabel(role: string): string {
  switch (role) {
    case 'owner':
      return 'Dono do projeto'
    case 'admin':
      return 'Administrador'
    case 'mentor':
      return 'Mentor'
    default:
      return 'Membro'
  }
}

export function MembersPanel({
  open,
  onClose,
  conversationTitle,
  members,
  loading,
  error,
  onRetry,
}: {
  open: boolean
  onClose: () => void
  conversationTitle: string
  members: ChatConversationMember[]
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  if (!open) return null

  return (
    <>
      <button
        type="button"
        aria-label="Fechar painel de membros"
        className="fixed inset-0 z-[60] bg-background/60 backdrop-blur-sm lg:bg-background/30"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Membros da conversa"
        className={cn(
          'fixed inset-y-0 right-0 z-[70] flex w-full max-w-sm flex-col border-l border-card-outline bg-card shadow-2xl',
          'lg:top-[72px] lg:bottom-0 lg:w-80',
        )}
      >
        <header className="flex items-start gap-2 border-b border-border bg-background/60 px-4 py-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">
              Equipe da conversa
            </p>
            <h3
              className="mt-0.5 truncate text-base font-semibold text-foreground"
              title={conversationTitle}
            >
              {conversationTitle}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pessoas com acesso a este chat.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center px-6 py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Carregando membros...
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-8 text-center">
              <p className="text-sm font-medium text-destructive">
                Não foi possível carregar os membros.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                <RefreshCcw className="h-4 w-4" aria-hidden />
                Tentar novamente
              </Button>
            </div>
          ) : members.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center">
              <Users className="h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="text-sm font-semibold text-foreground">Sem membros listados</p>
              <p className="text-xs text-muted-foreground">
                Esta conversa ainda não tem participantes ativos.
              </p>
            </div>
          ) : (
            <ul className="p-2">
              {members.map((member) => {
                const displayName = member.full_name?.trim() || 'Membro do projeto'
                const isManager = member.role === 'owner' || member.role === 'admin'
                return (
                  <li key={member.user_id}>
                    <div className="flex items-center gap-3 rounded-2xl px-3 py-2.5">
                      <UserAvatar
                        name={displayName}
                        imageUrl={member.avatar_url ?? undefined}
                        sizeClassName="h-10 w-10"
                        ring={false}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {displayName}
                        </p>
                        {member.course?.trim() ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {member.course}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          isManager
                            ? 'bg-primary/15 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {roleLabel(member.role)}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
