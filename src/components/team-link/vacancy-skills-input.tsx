'use client'

import type { ConceptChoice } from '@/lib/concepts'
import { ConceptChipInput } from './concept-chip-input'

const importanceLabels = ['Muito baixa', 'Baixa', 'Média', 'Alta', 'Essencial']

export function VacancySkillsInput({ label = 'Habilidades desejadas', value, onChange, disabled }: {
  label?: string
  value: ConceptChoice[]
  onChange: (choices: ConceptChoice[]) => void
  disabled?: boolean
}) {
  return (
    <ConceptChipInput
      label={label}
      optional
      maxItems={30}
      maxLength={120}
      value={value}
      onChange={onChange}
      disabled={disabled}
      helperText="Selecione as habilidades no catálogo. A importância indica o quanto cada uma é necessária para esta vaga."
      renderChoiceControl={(choice, index) => (
        <select
          aria-label={['Importância de ' + choice.label, choice.domain].filter(Boolean).join(' · ')}
          className="min-h-9 max-w-full rounded-lg border border-border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          disabled={disabled}
          value={choice.weight ?? 3}
          onChange={event => {
            const weight = Number(event.target.value)
            onChange(value.map((item, position) => position === index ? { ...item, weight, weightEdited: true } : item))
          }}
        >
          {importanceLabels.map((name, i) => <option key={name} value={i + 1}>{i + 1} — {name}</option>)}
        </select>
      )}
    />
  )
}
