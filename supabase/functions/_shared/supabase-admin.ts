import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

import { requireEnv } from './env.ts'

let adminClient: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (!adminClient) {
    adminClient = createClient(
      requireEnv('SUPABASE_URL'),
      requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    )
  }
  return adminClient
}

export function createUserClientFromRequest(req: Request): SupabaseClient | null {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim()
  if (!anonKey || !supabaseUrl) return null

  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function getUserFromRequest(req: Request): Promise<User | null> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null

  let admin: SupabaseClient
  try {
    admin = createAdminClient()
  } catch {
    return null
  }

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}
