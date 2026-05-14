import type { MemberBadgeColor } from '@/types/database'

/**
 * Limite visual do cargo exibido. O banco também valida.
 */
export const DISPLAY_ROLE_MAX_LENGTH = 40

/**
 * Sugestões rápidas exibidas no modal de edição.
 */
export const ROLE_SUGGESTIONS = [
  'ADMIN',
  'Desenvolvedor',
  'Designer',
  'Front-end',
  'Back-end',
  'Marketing',
  'Documentação',
  'QA',
  'Suporte',
] as const

/**
 * Classes Tailwind ESTÁTICAS por cor. Nada de `bg-${color}-500/10` dinâmico:
 * o JIT do Tailwind precisa enxergar cada classe literal no código fonte
 * para incluí-la no CSS final do build.
 */
export const BADGE_COLOR_CLASSES: Record<MemberBadgeColor, string> = {
  blue: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  green:
    'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300',
  emerald:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  cyan: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
  violet:
    'border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  purple:
    'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300',
  amber:
    'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  orange:
    'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  rose: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  red: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  slate:
    'border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-300',
}

/**
 * Classes para o "swatch" mostrado no seletor de cor (bolinha cheia).
 */
export const BADGE_COLOR_SWATCH: Record<MemberBadgeColor, string> = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  emerald: 'bg-emerald-500',
  cyan: 'bg-cyan-500',
  violet: 'bg-violet-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  rose: 'bg-rose-500',
  red: 'bg-red-500',
  slate: 'bg-slate-500',
}

/**
 * Lista ordenada para renderizar o seletor de cores no modal.
 */
export const BADGE_COLOR_OPTIONS: ReadonlyArray<{
  value: MemberBadgeColor
  label: string
}> = [
  { value: 'blue', label: 'Azul' },
  { value: 'green', label: 'Verde' },
  { value: 'emerald', label: 'Esmeralda' },
  { value: 'cyan', label: 'Ciano' },
  { value: 'violet', label: 'Violeta' },
  { value: 'purple', label: 'Roxo' },
  { value: 'amber', label: 'Amarelo' },
  { value: 'orange', label: 'Laranja' },
  { value: 'rose', label: 'Rosa' },
  { value: 'red', label: 'Vermelho' },
  { value: 'slate', label: 'Cinza' },
]

/**
 * Cor padrão por cargo real (`role`). Usada quando `badge_color` é null.
 *  - owner → blue
 *  - admin → violet
 *  - qualquer outro → green
 */
export function defaultBadgeColorFor(role: string): MemberBadgeColor {
  if (role === 'owner') return 'blue'
  if (role === 'admin') return 'violet'
  return 'green'
}

/**
 * Rótulo padrão por cargo real (`role`). Usado quando `display_role` é null.
 *  - owner → DONO
 *  - admin → ADMIN
 *  - qualquer outro → MEMBRO
 */
export function defaultDisplayLabelFor(role: string): string {
  if (role === 'owner') return 'DONO'
  if (role === 'admin') return 'ADMIN'
  return 'MEMBRO'
}

/**
 * Devolve o `display_role` digitado sem transformações (a classe Tailwind
 * `uppercase` no selo cuida da apresentação visual sem perder acentos no
 * estado salvo).
 */
export function formatDisplayLabel(value: string): string {
  return value.trim()
}

const VALID_COLORS = new Set<MemberBadgeColor>([
  'blue',
  'green',
  'emerald',
  'cyan',
  'violet',
  'purple',
  'amber',
  'orange',
  'rose',
  'red',
  'slate',
])

export function isValidBadgeColor(
  value: string | null | undefined,
): value is MemberBadgeColor {
  if (!value) return false
  return VALID_COLORS.has(value as MemberBadgeColor)
}

/**
 * Calcula o par {label, className} efetivo do selo de um membro,
 * aplicando os fallbacks documentados quando os campos visuais são nulos.
 */
export function computeMemberBadge(member: {
  role: string
  display_role?: string | null
  badge_color?: MemberBadgeColor | string | null
}): { label: string; className: string } {
  const rawColor =
    typeof member.badge_color === 'string' ? member.badge_color : null
  const color: MemberBadgeColor = isValidBadgeColor(rawColor)
    ? (rawColor as MemberBadgeColor)
    : defaultBadgeColorFor(member.role)
  const trimmed = (member.display_role ?? '').trim()
  const label =
    trimmed.length > 0
      ? formatDisplayLabel(trimmed)
      : defaultDisplayLabelFor(member.role)
  return {
    label,
    className: BADGE_COLOR_CLASSES[color],
  }
}
