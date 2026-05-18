import type { SupportTicketStatus } from './types'

export function supportStatusLabel(status: SupportTicketStatus): string {
  switch (status) {
    case 'waiting_support':
      return 'Aguardando'
    case 'in_progress':
      return 'Em andamento'
    case 'resolved':
      return 'Resolvido'
    case 'closed':
      return 'Fechado'
    default:
      return status
  }
}

export function formatSupportDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatSupportRelativeTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const diffMs = Date.now() - date.getTime()
  const diffSec = Math.round(diffMs / 1000)
  if (diffSec < 60) return 'agora'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `há ${diffMin} min`
  const diffHours = Math.round(diffMin / 60)
  if (diffHours < 24) return `há ${diffHours} h`
  const diffDays = Math.round(diffHours / 24)
  if (diffDays < 30) return `há ${diffDays} dia${diffDays === 1 ? '' : 's'}`
  return formatSupportDateTime(iso)
}

export function formatIntegrationUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatSupportRelativeTime(iso)
}

export function truncateSupportPreview(text: string, max = 72): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}
