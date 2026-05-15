import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

/**
 * Cliente Supabase com JWT do usuário (anon key + Authorization do request).
 * Usar só para validação de permissão (ex.: RPC com RLS do usuário).
 * Nunca usar para escrita interna em tabelas que dependem de service role.
 */
export function createGithubUserClient(authHeader: string): SupabaseClient | null {
  const url = Deno.env.get('SUPABASE_URL')?.trim()
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  if (!url || !anonKey || !authHeader.startsWith('Bearer ')) return null

  return createClient(url, anonKey, {
    global: {
      headers: {
        apikey: anonKey,
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

/**
 * Cliente admin (service role) para PostgREST: sem JWT do usuário nos headers.
 * Força apikey + Authorization com a service role para não herdar contexto de sessão.
 */
export function createGithubAdminRestClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.trim()

  return createClient(url, serviceKey, {
    global: {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

/**
 * Cliente service role para Auth Admin API (ex.: getUser(jwt)).
 * Sem headers globais extras — o SDK usa a service key do construtor.
 */
export function createGithubAdminAuthClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!.trim()
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!.trim()

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
