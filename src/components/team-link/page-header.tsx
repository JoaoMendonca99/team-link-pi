import { cn } from "@/lib/utils"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 border-b border-border/80 pb-10 text-center md:flex-row md:items-end md:justify-between md:text-left",
        className,
      )}
    >
      <div className="mx-auto max-w-3xl space-y-3 md:mx-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="text-base text-muted-foreground sm:text-lg">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap justify-center gap-3 md:justify-end">{actions}</div>
      ) : null}
    </div>
  )
}
