import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export function StatCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string
  value: string | number
  icon: LucideIcon
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-card-outline bg-card p-4 shadow-sm transition-transform duration-200 ease-out hover:-translate-y-[1px]",
        className,
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-semibold text-foreground">{value}</div>
      </div>
    </div>
  )
}
