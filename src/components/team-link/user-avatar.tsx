import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  const first = parts[0]![0]
  const last = parts[parts.length - 1]![0]
  return `${first ?? ""}${last ?? ""}`.toUpperCase()
}

export function UserAvatar({
  name,
  imageUrl,
  className,
  ring = true,
  sizeClassName = "h-9 w-9",
}: {
  name: string
  imageUrl?: string
  className?: string
  ring?: boolean
  sizeClassName?: string
}) {
  return (
    <Avatar className={cn(sizeClassName, ring && "tl-avatar-ring", className)}>
      <AvatarImage src={imageUrl} alt={name ? `Avatar de ${name}` : "Avatar"} />
      <AvatarFallback className={cn("bg-primary text-[11px] font-semibold text-primary-foreground")}>
        {initialsFromName(name)}
      </AvatarFallback>
    </Avatar>
  )
}
