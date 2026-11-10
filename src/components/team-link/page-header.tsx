import { cn } from "@/lib/utils"

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  compact=false,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  compact?:boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 border-b border-border/80 pb-10 text-center md:flex-row md:items-end md:justify-between md:text-left",
        compact && 'gap-3 pb-3 text-left md:items-center',className,
      )}
    >
      <div className="mx-auto min-w-0 max-w-3xl space-y-3 md:mx-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className={cn('font-bold tracking-tight text-foreground',compact?'break-words text-2xl sm:text-3xl':'text-balance text-3xl sm:text-4xl md:text-5xl')}>
          {title}
        </h1>
        {description ? (
          <p className="text-base text-muted-foreground sm:text-lg">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex w-full min-w-0 shrink-0 flex-wrap justify-center gap-3 md:w-auto md:justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
