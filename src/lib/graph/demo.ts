import { Graph, bfs, dfs, path, components, jaccard, type Edge, type Vertex, type Traversal } from './graph';
import type { Snapshot } from './types';
import { buildGraph } from './engine';
export type Demo = {
    synthetic: boolean;
    vertices: Vertex[];
    edges: Edge[];
    start: string;
    target: string;
    components: number;
    totalVertices: number;
    requirementsJaccard: number;
    bfs: ReturnType<typeof serialize>;
    dfs: ReturnType<typeof serialize>;
};
function serialize(t: Traversal, target: string) { return { order: t.order, trace: t.trace, distance: Object.fromEntries(t.distance), path: path(t, target), connected: t.distance.has(target) }; }
export function inspect(graph: Graph, start: string, target?: string, synthetic = false): Demo {
    const subset = bfs(graph, start, { limit: 24 }).order, allowed = new Set(subset), small = new Graph();
    for (const id of subset)
        small.addVertex(graph.vertices.get(id)!);
    for (const e of graph.edges)
        if (allowed.has(e.from) && allowed.has(e.to))
            small.addEdge(e);
    small.finalize();
    const end = target && allowed.has(target) ? target : subset.find(id => id !== start && id.startsWith('user:')) ?? subset.at(-1) ?? start;
    const skills = (small.adjacent.get(end) ?? []).filter(edge => edge.type==='skill').map(edge=>edge.to)
    const requirements = small.edges.filter(edge=>edge.type==='requirement' && edge.to.startsWith('concept:')).map(edge=>edge.to)
    return { requirementsJaccard:jaccard(skills,requirements), synthetic, vertices: [...small.vertices.values()], edges: small.edges, start, target: end, components: components(small).length, totalVertices: graph.vertices.size, bfs: serialize(bfs(small, start, { trace: true }), end), dfs: serialize(dfs(small, start, { trace: true }), end) };
}
export function syntheticDemo(): Demo {
    const c = (id: string, label: string) => ({ id, label }), r = (id: string, label: string, weight: number) => ({ key: id, concept: id, label, weight, source: 'vacancy' as const });
    const data: Snapshot = { actor: 'ana', people: [{ id: 'ana', name: 'Ana (sintético)', avatar: null, skills: [], interests: [], educations: [] }, { id: 'bia', name: 'Bia (sintético)', avatar: null, skills: [c('react', 'React'), c('supabase', 'Supabase')], interests: [], educations: [] }], projects: [{ id: 'aurora', title: 'Projeto Aurora (sintético)', slug: 'demo', category: null, tags: [], requirements: [], joined: true, pending: false, open: true }], vacancies: [{ id: 'dev', project: 'aurora', title: 'Desenvolvimento (sintético)', available: 1, open: true, requirements: [r('react', 'React', 5), r('supabase', 'Supabase', 3), r('ux', 'UI/UX', 2)] }], concepts: [c('react', 'React'), c('supabase', 'Supabase'), c('ux', 'UI/UX')], relations: [], courses: [], areas: [], institutions: [], offers: [], members: [{ user: 'ana', project: 'aurora' }], friends: [], excludedFriends: [], sharing: false, limited: false };
    return inspect(buildGraph(data), 'project:aurora', 'user:bia', true);
}
