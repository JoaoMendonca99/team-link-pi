import { getSupabaseClient } from '@/lib/supabase/client'
import { mapPublicDetailToDisplay, type ProjectDisplay } from '@/lib/projects/display'
import type { ProjectMemberRow, ProjectPublicDetailRow } from '@/types/database'

export type ProfileParticipation = { project: ProjectDisplay; displayRole: string | null; joinedAt: string }
export type ProfileProjects = { created: ProjectDisplay[]; participating: ProfileParticipation[]; total: number }

export function assembleProfileProjects(created: ProjectDisplay[], projects: ProjectDisplay[], members: ProjectMemberRow[]): ProfileProjects {
  const uniqueCreated = [...new Map(created.map(project => [project.id, project])).values()]
  const byId = new Map(projects.map(project => [project.id, project]))
  const participating = new Map<string, ProfileParticipation>()
  for (const member of members) {
    const project = byId.get(member.project_id)
    if (member.status !== 'active' || !project || participating.has(project.id)) continue
    participating.set(project.id, { project, displayRole: member.display_role?.trim() || null, joinedAt: member.joined_at })
  }
  const list = [...participating.values()]
  return { created: uniqueCreated, participating: list, total: new Set([...uniqueCreated.map(p => p.id), ...participating.keys()]).size }
}

export async function loadProfileProjects(userId: string): Promise<ProfileProjects> {
  const client = getSupabaseClient()
  // Both queries run with the viewer's session and existing RLS. The detail view also
  // includes private projects only when the viewer already has permission to read them.
  const [created, members] = await Promise.all([
    client.from('project_public_details').select('*').eq('owner_id', userId).order('created_at', { ascending: false }),
    client.from('project_members').select('id, project_id, user_id, status, joined_at, display_role').eq('user_id', userId).eq('status', 'active').order('joined_at', { ascending: false }),
  ])
  if (created.error || members.error) throw new Error('Não foi possível carregar os projetos.')
  const rows = (members.data ?? []) as ProjectMemberRow[]
  const ids = [...new Set(rows.map(row => row.project_id))]
  const participating = ids.length ? await client.from('project_public_details').select('*').in('id', ids) : { data: [], error: null }
  if (participating.error) throw new Error('Não foi possível carregar as participações.')
  return assembleProfileProjects(
    ((created.data ?? []) as ProjectPublicDetailRow[]).map(mapPublicDetailToDisplay),
    ((participating.data ?? []) as ProjectPublicDetailRow[]).map(mapPublicDetailToDisplay), rows,
  )
}
