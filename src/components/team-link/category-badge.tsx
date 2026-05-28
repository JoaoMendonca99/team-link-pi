import { cn } from "@/lib/utils"

export function CategoryBadge({
  label,
  className,
}: {
  label: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center truncate rounded-full border border-primary/25 bg-secondary px-3 py-1 text-[13px] font-semibold leading-none text-secondary-foreground sm:max-w-[16rem] dark:border-primary/30 dark:bg-secondary/70",
        className,
      )}
    >
      {label}
    </span>
  )
}
