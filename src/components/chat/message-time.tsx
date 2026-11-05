const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatMessageTime(value: string) {
  return time.format(new Date(value))
}

export function MessageDay({ value, previous }: { value: string; previous?: string }) {
  const day = new Date(value)
  if (previous && new Date(previous).toDateString() === day.toDateString()) return null
  const now = new Date()
  const today = now.toDateString()
  now.setDate(now.getDate() - 1)
  const label = day.toDateString() === today ? 'Hoje' : day.toDateString() === now.toDateString() ? 'Ontem' : date.format(day)
  return <li className="flex justify-center py-1">
    <time dateTime={value} className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{label}</time>
  </li>
}
