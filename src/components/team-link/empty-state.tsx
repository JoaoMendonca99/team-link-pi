"use client"

import Link from "next/link"
import type { LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  className?: string
  actionLabel?: string
  onAction?: () => void
  href?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  href,
  className,
}: EmptyStateProps) {
  const showButton = Boolean(actionLabel && (onAction ?? href))

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center shadow-sm",
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-primary">
        <Icon className="h-8 w-8" aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {showButton && actionLabel ? (
        <div className="mt-6">
          {href ? (
            <Button asChild className="font-semibold">
              <Link href={href}>{actionLabel}</Link>
            </Button>
          ) : (
            <Button type="button" onClick={onAction} className="font-semibold">
              {actionLabel}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  )
}
