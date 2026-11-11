"use server";
import { graphClient, graphSnapshot, projectKey, readGraphSnapshot, accessDenied, RecommendationAccessError } from './repository.server';
import { buildGraph, recommend } from './engine';
import { inspect } from './demo';
import { deservesVacancyBadge, presentPerson } from './presentation';
import { opportunityFilters, type OpportunityPage, type OpportunityFilters } from '../vacancy-exploration';

export async function loadRecommendations(token: string, kind: 'collaborators' | 'friends', project?: string, vacancy?: string) {
    try {
        if (kind !== 'collaborators' && kind !== 'friends') throw new RecommendationAccessError();
        if (vacancy) projectKey(vacancy);
        const data = await graphSnapshot(token, kind, project);
        if (!data.sharing) data.friends = [];
        const result = recommend(data, kind, project, vacancy);
        return { ok: true as const, data: { items: result.items.map(presentPerson), vacancies: result.vacancies },
            retainOnError: kind === 'friends' && data.friends.length === 0 };
    } catch (error) {
        return { ok: false as const, revoked: error instanceof RecommendationAccessError,
            message: 'Não foi possível atualizar as sugestões.' };
    }
}
export async function loadRankedVacancies(token: string, input: OpportunityFilters) {
    try {
        const client = await graphClient(token);
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries({ q:input.search, category:input.category, skill:input.skill, sort:input.sort, page:input.page })) {
            if (typeof value === 'string' || typeof value === 'number') params.set(key, String(value));
        }
        const filters = opportunityFilters(params);
        let ranked: string[] = [], privateEvidence = false, rankingFailed = false;
        try {
            const snapshot = await readGraphSnapshot(client, 'opportunities');
            if (!snapshot.sharing) snapshot.friends = [];
            privateEvidence = snapshot.friends.length > 0;
            ranked = recommend(snapshot, 'opportunities', undefined, undefined, 160).items
                .filter(deservesVacancyBadge).map(item => item.id);
        } catch (error) {
            if (error instanceof RecommendationAccessError) throw error;
            rankingFailed = true;
        }
        const { data, error } = await client.rpc('explore_project_vacancies', { p_options: {
            ...filters, size:12, recommendation_order:ranked
        } }).abortSignal(AbortSignal.timeout(7000));
        if (accessDenied(error)) throw new RecommendationAccessError();
        if (error || !data) throw Error('Unavailable catalogue');
        const page = data as OpportunityPage, recommended = new Set(ranked);
        return { ok: true as const, retainOnError: !privateEvidence, data: { ...page,
            items: page.items.map(item => ({ ...item, recommended:recommended.has(item.id) })),
            rankingFailed } };
    } catch (error) {
        return { ok: false as const, revoked:error instanceof RecommendationAccessError,
            message:'Não foi possível atualizar as vagas.' };
    }
}
export async function loadGraphDemo(token: string, project: string) {
    try {
        const data = await graphSnapshot(token, 'collaborators', project);
        return { ok: true as const, data: inspect(buildGraph({ ...data, friends: [] }), 'project:' + project) };
    }
    catch {
        return { ok: false as const, message: 'Demonstração indisponível para este contexto.' };
    }
}
