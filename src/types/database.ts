/**
 * Tipos manuais para a integração com Supabase.
 * Refletem o schema já existente no banco — o frontend se adapta ao banco,
 * nunca o contrário.
 */

// ============================================================================
// Enums e literais
// ============================================================================

export type ProjectStatusValue =
  | "open"
  | "in_progress"
  | "completed"
  | "archived"

export type ProjectVisibility = "public" | "private"

export type ProjectMemberRoleValue = "owner" | "member" | "mentor"

export type ProjectMemberStatusValue = "active" | "invited" | "removed" | "left"

export type ProjectCommentStatus = "visible" | "hidden" | "removed"

export type JoinRequestStatus = "pending" | "approved" | "rejected" | "canceled"

// ============================================================================
// profiles
// ============================================================================

export interface ProfileRow {
  id: string
  full_name: string | null
  email: string | null
  course: string | null
  bio: string | null
  avatar_url: string | null
  skills: string[] | null
  interests: string[] | null
  created_at: string
  updated_at: string
}

export interface ProfileInsert {
  id: string
  full_name?: string | null
  email?: string | null
  course?: string | null
  bio?: string | null
  avatar_url?: string | null
  skills?: string[] | null
  interests?: string[] | null
  created_at?: string
  updated_at?: string
}

export interface ProfileUpdate {
  full_name?: string | null
  email?: string | null
  course?: string | null
  bio?: string | null
  avatar_url?: string | null
  skills?: string[] | null
  interests?: string[] | null
  updated_at?: string
}

// ============================================================================
// projects
// ============================================================================

export interface ProjectRow {
  id: string
  owner_id: string
  title: string
  slug: string
  short_description: string | null
  description: string | null
  category: string | null
  status: ProjectStatusValue
  visibility: ProjectVisibility
  open_spots: number
  desired_profile: string | null
  created_at: string
  updated_at: string
}

export interface ProjectInsert {
  owner_id: string
  title: string
  slug: string
  short_description?: string | null
  description?: string | null
  category?: string | null
  status?: ProjectStatusValue
  visibility?: ProjectVisibility
  open_spots?: number
  desired_profile?: string | null
}

export interface ProjectUpdate {
  title?: string
  slug?: string
  short_description?: string | null
  description?: string | null
  category?: string | null
  status?: ProjectStatusValue
  visibility?: ProjectVisibility
  open_spots?: number
  desired_profile?: string | null
}

// ============================================================================
// project_tags, project_required_skills, project_members
// ============================================================================

export interface ProjectTagRow {
  project_id: string
  tag: string
}

export interface ProjectRequiredSkillRow {
  project_id: string
  skill: string
}

export interface ProjectMemberRow {
  id: string
  project_id: string
  user_id: string
  role: ProjectMemberRoleValue
  status: ProjectMemberStatusValue
  joined_at: string
}

// ============================================================================
// project_likes
// ============================================================================

export interface ProjectLikeRow {
  id: string
  project_id: string
  user_id: string
  created_at: string
}

// ============================================================================
// project_comments
// ============================================================================

export interface ProjectCommentRow {
  id: string
  project_id: string
  user_id: string
  content: string
  status: ProjectCommentStatus
  created_at: string
  updated_at: string
}

// ============================================================================
// join_requests
// ============================================================================

export interface JoinRequestRow {
  id: string
  project_id: string
  user_id: string
  message: string | null
  status: JoinRequestStatus
  decided_by: string | null
  decided_at: string | null
  created_at: string
}

// ============================================================================
// Views públicas (apenas leitura)
// ============================================================================

/** View `public.project_public_cards` — listagem de cartões para /explorar e Home. */
export interface ProjectPublicCardRow {
  id: string
  owner_id: string
  title: string
  slug: string
  short_description: string | null
  category: string | null
  status: ProjectStatusValue
  visibility: ProjectVisibility
  open_spots: number
  desired_profile: string | null
  created_at: string
  updated_at: string
  owner_name: string | null
  owner_course: string | null
  owner_avatar_url: string | null
  tags: string[] | null
  required_skills: string[] | null
  likes_count: number | null
  comments_count: number | null
  members_count: number | null
}

/** View `public.project_public_details` — detalhe do projeto. */
export interface ProjectPublicDetailRow extends ProjectPublicCardRow {
  description: string | null
}

/** View `public.project_public_members`. */
export interface ProjectPublicMemberRow {
  project_id: string
  user_id: string
  role: ProjectMemberRoleValue
  joined_at: string
  full_name: string | null
  course: string | null
  avatar_url: string | null
}

/** View `public.project_public_comments`. */
export interface ProjectPublicCommentRow {
  id: string
  project_id: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  author_name: string | null
  author_avatar_url: string | null
}

// ============================================================================
// RPC: create_project_with_details
// ============================================================================

export interface CreateProjectWithDetailsArgs {
  p_title: string
  p_slug: string
  p_short_description: string
  p_description: string
  p_category: string
  p_open_spots: number
  p_desired_profile: string
  p_tags: string[]
  p_required_skills: string[]
}
