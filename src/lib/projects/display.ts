/**
 * Camada de apresentação para projetos:
 *
 * `ProjectDisplay` é a forma canônica usada pela UI (cards, detalhe, "Meus projetos").
 * Mappers convertem as linhas vindas do Supabase (tabela `projects` e views públicas)
 * para esse shape. Assim os componentes não precisam conhecer o schema do banco.
 */

import type {
  ProjectPublicCardRow,
  ProjectPublicDetailRow,
  ProjectRow,
  ProjectStatusValue,
  ProjectVisibility,
} from "@/types/database"

export interface ProjectDisplay {
  id: string
  slug: string
  title: string
  shortDescription: string
  description: string | null
  category: string | null
  status: ProjectStatusValue
  visibility: ProjectVisibility
  openSpots: number
  desiredProfile: string | null
  createdAt: string
  updatedAt: string

  ownerId: string
  ownerName: string
  ownerCourse: string | null
  ownerAvatarUrl: string | null

  tags: string[]
  requiredSkills: string[]

  likesCount: number
  commentsCount: number
  membersCount: number
}

// ----------------------------------------------------------------------------
// Labels e cores para status
// ----------------------------------------------------------------------------

export const PROJECT_STATUS_LABEL: Record<ProjectStatusValue, string> = {
  open: "Aberto",
  in_progress: "Em andamento",
  completed: "Finalizado",
  archived: "Arquivado",
}

export const PROJECT_STATUS_OPTIONS: ProjectStatusValue[] = [
  "open",
  "in_progress",
  "completed",
  "archived",
]

// ----------------------------------------------------------------------------
// Mappers
// ----------------------------------------------------------------------------

function fallbackOwnerName(row: { owner_name: string | null; owner_id: string }): string {
  return row.owner_name?.trim() || "Autor"
}

export function mapPublicCardToDisplay(row: ProjectPublicCardRow): ProjectDisplay {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description ?? "",
    description: null,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    openSpots: row.open_spots,
    desiredProfile: row.desired_profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    ownerId: row.owner_id,
    ownerName: fallbackOwnerName(row),
    ownerCourse: row.owner_course,
    ownerAvatarUrl: row.owner_avatar_url,

    tags: row.tags ?? [],
    requiredSkills: row.required_skills ?? [],

    likesCount: row.likes_count ?? 0,
    commentsCount: row.comments_count ?? 0,
    membersCount: row.members_count ?? 0,
  }
}

export function mapPublicDetailToDisplay(row: ProjectPublicDetailRow): ProjectDisplay {
  const base = mapPublicCardToDisplay(row)
  return {
    ...base,
    description: row.description,
  }
}

/** Mapper enxuto a partir de `projects` (sem joins). Usado em /meus-projetos. */
export function mapProjectRowToDisplay(
  row: ProjectRow,
  context: {
    ownerName?: string | null
    ownerCourse?: string | null
    ownerAvatarUrl?: string | null
  } = {},
): ProjectDisplay {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    shortDescription: row.short_description ?? "",
    description: row.description,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    openSpots: row.open_spots,
    desiredProfile: row.desired_profile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    ownerId: row.owner_id,
    ownerName: context.ownerName?.trim() || "Você",
    ownerCourse: context.ownerCourse ?? null,
    ownerAvatarUrl: context.ownerAvatarUrl ?? null,

    tags: [],
    requiredSkills: [],

    likesCount: 0,
    commentsCount: 0,
    membersCount: 0,
  }
}
