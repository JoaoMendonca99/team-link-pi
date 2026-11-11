"use server";
import { graphClient, graphSnapshot, projectKey } from './repository.server';
import { buildGraph, recommend } from './engine';
import { inspect } from './demo';
import type { Requirement } from './types';
export async function loadRecommendations(token: string, kind: 'collaborators' | 'opportunities' | 'friends', project?: string, vacancy?: string) {
    try {
        if (vacancy)
            projectKey(vacancy);
        const data = await graphSnapshot(token, kind, project);
        return { ok: true as const, data: recommend(data, kind, project, vacancy) };
    }
    catch {
        return { ok: false as const, message: 'Não foi possível carregar as recomendações. Tente novamente.' };
    }
}
export async function loadGraphDemo(token: string, project: string) {
    try {
        const data = await graphSnapshot(token, 'collaborators', project);
        return { ok: true as const, data: inspect(buildGraph(data), 'project:' + project) };
    }
    catch {
        return { ok: false as const, message: 'Demonstração indisponível para este contexto.' };
    }
}
export async function requirementWeights(token: string, project: string, changes?: {
    key: string;
    source: 'project' | 'vacancy';
    weight: number;
}[]) {
    try {
        if (changes && (!Array.isArray(changes) || changes.length > 60 || changes.some(r => !Number.isInteger(r.weight) || r.weight < 1 || r.weight > 5)))
            throw Error('Invalid weights');
        const client = await graphClient(token);
        const { data, error } = await client.rpc('graph_requirement_weights', { p_project: projectKey(project), p_changes: changes ?? null });
        if (error)
            throw error;
        return { ok: true as const, data: data as {
                project: Requirement[];
                vacancies: {
                    id: string;
                    title: string;
                    requirements: Requirement[];
                }[];
            } };
    }
    catch {
        return { ok: false as const, message: 'Não foi possível consultar ou salvar os pesos. Confira suas permissões e tente novamente.' };
    }
}
