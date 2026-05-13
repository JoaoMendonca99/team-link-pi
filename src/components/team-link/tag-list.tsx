import { cn } from "@/lib/utils"

export function TagList({
  tags,
  className,
  max = 6,
  size = "sm",
}: {
  tags: string[]
  className?: string
  max?: number
  size?: "sm" | "md"
}) {
  const trimmed = tags.slice(0, max)
  const remaining = tags.length - trimmed.length

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {trimmed.map((tag) => (
        <span
          key={tag}
          className={cn(
            "rounded-full border border-border bg-muted/60 px-2.5 py-1 font-medium text-muted-foreground dark:border-border dark:bg-muted/40",
            size === "sm" ? "text-[12px]" : "text-[13px]",
          )}
        >
          {tag}
        </span>
      ))}
      {remaining > 0 ? (
        <span
          className={cn(
            "rounded-full border border-border bg-muted/40 px-2.5 py-1 font-medium text-muted-foreground dark:border-border dark:bg-muted/40",
            size === "sm" ? "text-[12px]" : "text-[13px]",
          )}
        >
          +{remaining}
        </span>
      ) : null}
    </div>
  )
}
