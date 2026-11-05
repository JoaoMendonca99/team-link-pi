'use server'

import { createClient } from '@supabase/supabase-js'

export async function authorizeRecruitmentWorkspace(slug: string, token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key || !slug || slug.length > 160 || !token || token.length > 8192) return null
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  const { data, error } = await client.rpc('get_recruitment_workspace', { p_slug: slug }).maybeSingle<{ id: string; slug: string; title: string }>()
  return error ? null : data
}
