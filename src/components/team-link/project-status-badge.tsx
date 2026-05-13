import type { ProjectStatusValue } from "@/types/database"
import { PROJECT_STATUS_LABEL } from "@/lib/projects/display"
import { cn } from "@/lib/utils"

const VARIANTS: Record<ProjectStatusValue, string> = {
  open:
    "border-emerald-500/35 bg-emerald-500/[0.12] text-emerald-900 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-300",
  in_progress:
    "border-sky-500/35 bg-sky-500/[0.12] text-sky-900 dark:border-sky-400/35 dark:bg-sky-500/15 dark:text-sky-200",
  completed:
    "border-violet-500/35 bg-violet-500/[0.12] text-violet-900 dark:border-violet-400/35 dark:bg-violet-500/15 dark:text-violet-200",
  archived:
    "border-zinc-500/35 bg-zinc-500/[0.12] text-zinc-900 dark:border-zinc-400/35 dark:bg-zinc-500/15 dark:text-zinc-200",
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: ProjectStatusValue
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold leading-none tracking-tight",
        VARIANTS[status],
        className,
      )}
    >
      {PROJECT_STATUS_LABEL[status]}
    </span>
  )
}
