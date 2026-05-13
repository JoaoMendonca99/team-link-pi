import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Client Supabase para uso no navegador.
 *
 * O projeto está em `output: "export"`, portanto não há SSR, cookies de servidor
 * nem server actions/API routes nesta fase. Toda a auth é client-side e a sessão
 * é persistida pelo próprio supabase-js no `localStorage`.
 *
 * Os tipos das tabelas estão em `src/types/database.ts` e são usados explicitamente
 * pelos consumidores (perfil, etc.) através de `.returns<T>()` ou cast. Optamos por
 * não tipar o client com o genérico `Database` inteiro nesta etapa para manter o
 * código simples enquanto somente `profiles` é integrado.
 */

let cachedClient: SupabaseClient | null = null

function readEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

/**
 * Retorna o singleton do client Supabase para o browser.
 * Lança erro descritivo quando as variáveis NEXT_PUBLIC_* não estão configuradas.
 */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient

  const env = readEnv()
  if (!env) {
    throw new Error(
      "Variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias. Configure em .env.local.",
    )
  }

  cachedClient = createClient(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "team-link-auth",
    },
  })

  return cachedClient
}

/**
 * Indica se as variáveis de ambiente do Supabase estão presentes.
 * Útil para exibir avisos quando o ambiente local ainda não está configurado.
 */
export function isSupabaseConfigured(): boolean {
  return readEnv() !== null
}
