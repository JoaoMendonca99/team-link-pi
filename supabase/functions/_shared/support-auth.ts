import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import { apiKeyMatches } from './support-api-key.ts'
import type { SupportIntegrationRow } from './support-schema.ts'
import { getUserFromRequest } from './supabase-admin.ts'

export function readExternalHeaders(req: Request): {
  projectId: string | null
  apiKey: string | null
} {
  const projectId =
    req.headers.get('x-project-id')?.trim() ||
    req.headers.get('X-Project-Id')?.trim() ||
    null
  const apiKey =
    req.headers.get('x-api-key')?.trim() ||
    req.headers.get('X-Api-Key')?.trim() ||
    null
  return { projectId, apiKey }
}

export async function assertProjectAdmin(
  admin: SupabaseClient,
  projectId: string,
  userId: string,
  userClient?: SupabaseClient | null,
): Promise<boolean> {
  if (userClient) {
    const { data, error } = await userClient.rpc('github_is_project_manager', {
      p_project_id: projectId,
    })
    if (!error && data === true) return true
  }

  const { data: project } = await admin
    .from('projects')
    .select('owner_id')
    .eq('id', projectId)
    .maybeSingle()

  if (project?.owner_id === userId) return true

  const { data: member } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  return Boolean(member && (member.role === 'owner' || member.role === 'admin'))
}

export async function assertSupportCanAccess(
  admin: SupabaseClient,
  projectId: string,
  userId: string,
  userClient?: SupabaseClient | null,
): Promise<boolean> {
  if (userClient) {
    const { data, error } = await userClient.rpc('support_can_access_project', {
      p_project_id: projectId,
    })
    if (!error && data === true) return true
  }

  const { data, error } = await admin.rpc('support_can_access_project', {
    p_project_id: projectId,
    p_user_id: userId,
  })
  if (!error && data === true) return true

  const { data: alt, error: altError } = await admin.rpc('support_can_access_project', {
    project_id: projectId,
    user_id: userId,
  })
  if (!altError && alt === true) return true

  if (await assertProjectAdmin(admin, projectId, userId)) return true

  const { data: member } = await admin
    .from('project_members')
    .select('role, support_access')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (!member) return false
  if (member.support_access === true) return true
  return member.role === 'owner' || member.role === 'admin'
}

export async function assertCanUpdateTicketStatus(
  admin: SupabaseClient,
  projectId: string,
  userId: string,
  userClient?: SupabaseClient | null,
): Promise<boolean> {
  if (await assertProjectAdmin(admin, projectId, userId, userClient)) return true

  const { data: member } = await admin
    .from('project_members')
    .select('support_access, status')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  return member?.support_access === true
}

export async function requireAuthenticatedUser(req: Request) {
  const user = await getUserFromRequest(req)
  if (!user) {
    return { ok: false as const, status: 401, message: 'Autenticação obrigatória.' }
  }
  return { ok: true as const, user }
}

export async function validateExternalApiAccess(
  admin: SupabaseClient,
  projectId: string,
  apiKey: string,
): Promise<
  | { ok: true; integration: SupportIntegrationRow }
  | { ok: false; status: number; message: string }
> {
  if (!projectId) {
    return { ok: false, status: 400, message: 'Cabeçalho x-project-id é obrigatório.' }
  }
  if (!apiKey) {
    return { ok: false, status: 401, message: 'Cabeçalho x-api-key é obrigatório.' }
  }

  const { data: integration, error } = await admin
    .from('project_support_integrations')
    .select('project_id, api_key_hash, api_key_last4, enabled, created_at, updated_at')
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    console.error('[support-auth] integration lookup failed', { code: error.code })
    return { ok: false, status: 500, message: 'Não foi possível validar a integração SAC.' }
  }

  if (!installation) {
    return { ok: false, status: 404, message: 'Integração SAC não encontrada para este projeto.' }
  }

  const row = installation as SupportIntegrationRow

  if (!row.enabled) {
    return { ok: false, status: 403, message: 'Integração SAC desativada para este projeto.' }
  }

  if (!row.api_key_hash) {
    return { ok: false, status: 403, message: 'API key não configurada para este projeto.' }
  }

  const matches = await apiKeyMatches(admin, apiKey, row.api_key_hash)
  if (!matches) {
    return { ok: false, status: 401, message: 'API key inválida.' }
  }

  return { ok: true, integration: row }
}
