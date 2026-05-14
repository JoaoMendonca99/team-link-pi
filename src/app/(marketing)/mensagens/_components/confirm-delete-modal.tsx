'use client'

import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function ConfirmDeleteModal({
  open,
  conversationTitle,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean
  conversationTitle: string | null
  deleting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  if (!open) return null
  const label = conversationTitle?.trim()
    ? `“${conversationTitle.trim()}”`
    : 'este grupo'
  return (
    <>
      <button
        type="button"
        aria-label="Fechar"
        className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm"
        onClick={() => {
          if (deleting) return
          onCancel()
        }}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="Confirmar exclusão"
        className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-2xl">
          <p className="text-base font-semibold text-foreground">
            Excluir {label}?
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            As mensagens deixarão de aparecer para os membros. A conversa Geral não pode ser
            excluída.
          </p>
          {error ? (
            <p role="alert" className="mt-3 text-xs font-medium text-destructive">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onConfirm}
              disabled={deleting}
              className="font-semibold"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Excluindo...
                </>
              ) : (
                'Excluir grupo'
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
