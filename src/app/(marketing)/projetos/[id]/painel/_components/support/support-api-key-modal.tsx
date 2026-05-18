'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Copy, X } from 'lucide-react'

import { Button } from '@/components/ui/button'

export interface SupportApiKeyModalProps {
  open: boolean
  apiKey: string | null
  last4: string | null
  title?: string
  onClose: () => void
}

export function SupportApiKeyModal({
  open,
  apiKey,
  last4,
  title = 'API SAC gerada',
  onClose,
}: SupportApiKeyModalProps) {
  const [copied, setCopied] = useState(false)

  if (!open || !apiKey) return null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(apiKey!)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  function handleClose() {
    setCopied(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-background/70 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-api-key-title"
        className="relative z-[110] w-full max-w-lg rounded-[1.75rem] border border-card-outline bg-card p-6 shadow-2xl shadow-primary/10"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-xl"
            aria-label="Fechar"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <h2 id="support-api-key-title" className="mt-4 text-lg font-semibold text-foreground">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta chave é exibida apenas uma vez. Copie e guarde em local seguro — não será possível
          visualizá-la novamente no painel.
        </p>
        {last4 ? (
          <p className="mt-1 text-xs text-muted-foreground">Identificador: ••••{last4}</p>
        ) : null}

        <div className="mt-4 rounded-2xl border border-card-outline bg-muted/30 p-3">
          <code className="block break-all font-mono text-xs text-foreground">{apiKey}</code>
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button type="button" className="flex-1 rounded-2xl font-semibold" onClick={() => void handleCopy()}>
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" aria-hidden />
                Copiado
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" aria-hidden />
                Copiar chave
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-2xl font-semibold"
            onClick={handleClose}
          >
            Já copiei, fechar
          </Button>
        </div>
      </div>
    </div>
  )
}
