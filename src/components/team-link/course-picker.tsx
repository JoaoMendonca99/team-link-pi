'use client'

import { CatalogPicker, type CatalogOption } from './catalog-picker'
import { courseDescription, searchCourses, type CourseSelection } from '@/lib/courses'

async function search(query: string, signal: AbortSignal): Promise<CatalogOption[]> {
  return (await searchCourses(query, signal)).map(row => ({ id: row.id, name: row.nome, title: row.nome, detail: courseDescription(row) }))
}
export function CoursePicker({ id, label = 'Curso (opcional)', value, onChange }: {
  id?: string; label?: string; value: CourseSelection; onChange: (value: CourseSelection) => void
}) {
  return <CatalogPicker id={id} label={label} value={value} onChange={onChange} search={search}
    placeholder="Busque pelo nome do curso" manualPlaceholder="Nome do curso"
    selectedHelp="Curso selecionado no catálogo oficial do Inep." resultsLabel="Cursos encontrados"
    loadingText="Buscando cursos…" emptyText="Nenhum curso encontrado." manualAction="Não encontrei meu curso" clearAction="Não informar curso" />
}
