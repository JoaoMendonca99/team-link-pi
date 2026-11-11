import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Snapshot } from './types';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class RecommendationAccessError extends Error {}
export function accessDenied(error: { status?: number; code?: string } | null | undefined) {
    return error?.status === 401 || error?.status === 403 ||
        ['42501', 'PGRST301', 'PGRST303', 'bad_jwt', 'session_not_found'].includes(error?.code ?? '');
}
export async function graphClient(token: string) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key || typeof token !== 'string' || !token || token.length > 8192)
        throw new RecommendationAccessError('Authentication required');
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: 'Bearer ' + token } } });
    const { data, error } = await client.auth.getUser(token);
    if (error) {
        if (accessDenied(error)) throw new RecommendationAccessError('Authentication required');
        throw error;
    }
    if (!data.user) throw new RecommendationAccessError('Authentication required');
    return client;
}
export function projectKey(id?: string) { if (id !== undefined && !uuid.test(id))
    throw Error('Invalid context'); return id ?? null; }
export async function graphSnapshot(token: string, kind: 'collaborators' | 'opportunities' | 'friends', project?: string) {
    if (!['collaborators', 'opportunities', 'friends'].includes(kind))
        throw Error('Invalid context');
    return readGraphSnapshot(await graphClient(token), kind, project);
}
export async function readGraphSnapshot(client: SupabaseClient, kind: 'collaborators' | 'opportunities' | 'friends', project?: string) {
    const { data, error } = await client.rpc('get_recommendation_context', { p_mode: kind, p_project: projectKey(project) }).abortSignal(AbortSignal.timeout(7000));
    if (accessDenied(error)) throw new RecommendationAccessError('Unavailable context');
    if (error || !data) {
        console.error('[graph:context]', error?.code ?? 'missing');
        throw Error('Unavailable context');
    }
    return data as Snapshot;
}
