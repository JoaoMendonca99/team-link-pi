import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import { apiKeyMatches } from './support-api-key.ts'
import { getIntegrationByProjectId } from './support-db.ts'
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
  _admin: SupabaseClient,
  projectId: string,
  _userId: string,
  userClient?: SupabaseClient | null,
): Promise<boolean> {
  if (!userClient) return false
  const { data, error } = await userClient.rpc('support_is_project_manager', { p_project_id: projectId })
  return !error && data === true
}

export async function assertSupportCanAccess(
  _admin: SupabaseClient,
  projectId: string,
  _userId: string,
  userClient?: SupabaseClient | null,
): Promise<boolean> {
  if (!userClient) return false
  const { data, error } = await userClient.rpc('support_can_access_project', { p_project_id: projectId })
  return !error && data === true
}

export const assertCanUpdateTicketStatus = assertSupportCanAccess

/** Only active team members can read the integration status of an active module. */
export async function assertProjectPanelAccess(
  _admin: SupabaseClient,
  projectId: string,
  _userId: string,
  userClient?: SupabaseClient | null,
): Promise<boolean> {
  if (!userClient) return false
  const { data, error } = await userClient.rpc('get_workspace_modules', { p_project: projectId })
  return !error && Array.isArray(data) && data.includes('support')
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

  const row = await getIntegrationByProjectId(admin, projectId)

  if (!row) {
    return { ok: false, status: 404, message: 'Integração SAC não encontrada para este projeto.' }
  }

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
