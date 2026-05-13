"use client"

import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function DemoBanner({
  open,
  message,
  onClose,
  tone = "info",
  className,
}: {
  open: boolean
  message: string
  onClose: () => void
  tone?: "info" | "success"
  className?: string
}) {
  if (!open) return null

  return (
    <div
      role="status"
      className={cn(
        "fixed inset-x-4 bottom-4 z-[130] mx-auto max-w-lg rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur md:left-auto md:right-8 md:mx-0",
        tone === "success"
          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-50"
          : "border-primary/40 bg-card/95 text-foreground",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 text-sm font-medium leading-relaxed">{message}</p>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={onClose}
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
