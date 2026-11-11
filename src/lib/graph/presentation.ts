import type { Recommendation } from './types'

/** Evaluated before the catalogue query paginates. Social/academic signals alone never qualify. */
export function deservesVacancyBadge(item: Pick<Recommendation, 'score' | 'technical' | 'tags'>) {
  return (item.score >= 12 && (item.technical?.exactPercent ?? 0) >= 20)
    || (item.score >= 15 && item.tags.length > 0)
}

export type SuggestedPerson = {
  id: string
  userId: string
  name: string
  avatar?: string | null
  vacancyTitle?: string
  reasons: string[]
}

export function presentPerson(item: Recommendation): SuggestedPerson {
  const reasons = new Set<string>()
  if (item.technical?.identified.length) reasons.add('Habilidades relacionadas à vaga')
  for (const reason of item.reasons) {
    if (reason.startsWith('Interesses')) reasons.add('Interesses em comum')
    if (reason.includes('habilidade(s)')) reasons.add('Habilidades em comum')
    if (reason.startsWith('Mesmo curso')) reasons.add('Mesmo curso')
    if (reason.startsWith('Cursos distintos')) reasons.add('Cursos de áreas relacionadas')
    if (reason.startsWith('Instituição')) reasons.add('Instituição de ensino em comum')
    if (reason.startsWith('Participação')) reasons.add('Projetos em comum')
  }
  // No explanation identifies a friendship, even when it contributed with consent.
  return { id:item.id, userId:item.id.split(':')[0], name:item.name, avatar:item.avatar,
    vacancyTitle:item.vacancyTitle, reasons:[...reasons].slice(0, 2) }
}
