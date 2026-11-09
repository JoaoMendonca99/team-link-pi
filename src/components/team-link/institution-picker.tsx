'use client'

import { CatalogPicker, type CatalogOption } from './catalog-picker'
import { searchInstitutions, type InstitutionSelection } from '@/lib/institutions'

async function search(query: string, signal: AbortSignal): Promise<CatalogOption[]> {
  return (await searchInstitutions(query, signal)).map(row => ({ id: row.id, name: row.nome, title: row.nome + (row.sigla ? ' — ' + row.sigla : ''), detail: [row.municipio, row.uf].filter(Boolean).join(' · ') }))
}
export function InstitutionPicker({ id, label = 'Faculdade ou universidade (opcional)', value, onChange }: {
  id?: string; label?: string; value: InstitutionSelection; onChange: (value: InstitutionSelection) => void
}) {
  return <CatalogPicker id={id} label={label} value={value} onChange={onChange} search={search}
    placeholder="Busque pelo nome ou sigla" manualPlaceholder="Nome da instituição"
    selectedHelp="Instituição selecionada no catálogo oficial do Inep." resultsLabel="Instituições encontradas"
    loadingText="Buscando instituições…" emptyText="Nenhuma instituição encontrada." manualAction="Não encontrei minha instituição" clearAction="Não informar instituição" />
}
