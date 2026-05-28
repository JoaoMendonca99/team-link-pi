import { cn } from "@/lib/utils"

export function AuthCard({
  eyebrow,
  title,
  description,
  children,
  footer,
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-md rounded-3xl border border-card-outline bg-card/90 p-5 shadow-xl backdrop-blur sm:p-8",
        className,
      )}
    >
      <div className="mb-8 space-y-2 text-center md:text-left">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div>{children}</div>
      {footer ? <div className="mt-8 border-t border-border pt-6">{footer}</div> : null}
    </div>
  )
}
