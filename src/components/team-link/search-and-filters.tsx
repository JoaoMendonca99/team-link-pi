'use client'

import { Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { ProjectStatusValue } from '@/types/database'
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_OPTIONS } from '@/lib/projects/display'

const sortLabels: Record<
  'recent' | 'likes' | 'comments' | 'spots',
  string
> = {
  recent: 'Mais recentes',
  likes: 'Mais curtidos',
  comments: 'Mais comentados',
  spots: 'Mais vagas abertas',
}

export type ExploreSort = keyof typeof sortLabels
export type ExploreStatusFilter = ProjectStatusValue | 'all'

export function SearchAndFilters({
  searchTerm,
  onSearchChange,
  category,
  onCategoryChange,
  status,
  onStatusChange,
  tag,
  onTagChange,
  sort,
  onSortChange,
  categoryOptions,
  tagOptions,
  onClear,
}: {
  searchTerm: string
  onSearchChange: (value: string) => void
  category: string
  onCategoryChange: (value: string) => void
  status: ExploreStatusFilter
  onStatusChange: (value: ExploreStatusFilter) => void
  tag: string
  onTagChange: (value: string) => void
  sort: ExploreSort
  onSortChange: (value: ExploreSort) => void
  categoryOptions: string[]
  tagOptions: string[]
  onClear: () => void
}) {
  return (
    <div className="rounded-[1.75rem] border border-border bg-card/90 p-4 shadow-lg backdrop-blur sm:p-6">
      <div className="grid min-w-0 gap-4 lg:grid-cols-12 lg:gap-3">
        <div className="relative min-w-0 lg:col-span-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Busque por título, descrição, categoria ou tags..."
            aria-label="Buscar projetos"
            className="h-12 w-full min-w-0 rounded-2xl pl-11 text-base"
          />
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Select value={category} onValueChange={onCategoryChange}>
            <SelectTrigger className="h-12 w-full rounded-2xl">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas categorias</SelectItem>
              {categoryOptions.map((projectCategory) => (
                <SelectItem key={projectCategory} value={projectCategory}>
                  {projectCategory}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Select value={status} onValueChange={(value) => onStatusChange(value as ExploreStatusFilter)}>
            <SelectTrigger className="h-12 w-full rounded-2xl">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              {PROJECT_STATUS_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {PROJECT_STATUS_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Select value={tag} onValueChange={onTagChange}>
            <SelectTrigger className="h-12 w-full rounded-2xl">
              <SelectValue placeholder="Habilidades / Tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Todas">Todas tags</SelectItem>
              {tagOptions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 lg:col-span-2">
          <Select value={sort} onValueChange={(value) => onSortChange(value as ExploreSort)}>
            <SelectTrigger className="h-12 w-full rounded-2xl">
              <SelectValue placeholder="Ordenar" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(sortLabels) as ExploreSort[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {sortLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        <Button type="button" variant="ghost" className="font-semibold text-primary hover:text-primary" onClick={onClear}>
          Limpar filtros
        </Button>
      </div>
    </div>
  )
}
