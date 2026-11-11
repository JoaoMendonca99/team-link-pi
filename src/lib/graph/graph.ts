export type VertexType = 'user' | 'project' | 'vacancy' | 'concept' | 'course' | 'institution' | 'area';
export type EdgeType = 'skill' | 'interest' | 'tag' | 'requirement' | 'vacancy' | 'member' | 'friend' | 'course' | 'institution' | 'cine' | 'parent' | 'offer' | 'related' | 'specific' | 'specialization';
export type Vertex = {
    id: string;
    type: VertexType;
    label: string;
};
export type Edge = {
    from: string;
    to: string;
    type: EdgeType;
    weight: number;
};
export const vertexId = (type: VertexType, id: string) => type + ':' + id;
export class Graph {
    readonly vertices = new Map<string, Vertex>();
    readonly adjacent = new Map<string, Edge[]>();
    private keys = new Set<string>();
    addVertex(vertex: Vertex) { this.vertices.set(vertex.id, vertex); if (!this.adjacent.has(vertex.id))
        this.adjacent.set(vertex.id, []); return vertex.id; }
    addEdge(edge: Edge, both = false) {
        if (!this.vertices.has(edge.from) || !this.vertices.has(edge.to) || !Number.isFinite(edge.weight) || edge.weight <= 0)
            throw Error('Invalid edge');
        const key = [edge.from, edge.to, edge.type].join('|');
        if (!this.keys.has(key)) {
            this.keys.add(key);
            this.adjacent.get(edge.from)!.push(edge);
        }
        if (both)
            this.addEdge({ ...edge, from: edge.to, to: edge.from });
    }
    finalize() { for (const list of this.adjacent.values())
        list.sort((a, b) => a.to.localeCompare(b.to, 'en') || a.type.localeCompare(b.type, 'en')); return this; }
    get edges() { return [...this.adjacent.values()].flat(); }
}
export type Visit = {
    id: string;
    depth: number;
    frontier: string[];
    event: 'discover' | 'return';
};
export type Traversal = {
    order: string[];
    distance: Map<string, number>;
    previous: Map<string, string>;
    trace: Visit[];
    truncated: boolean;
};
type Options = {
    depth?: number;
    limit?: number;
    trace?: boolean;
    allow?: (edge: Edge) => boolean;
};
/** FIFO uses a head cursor, so removing a vertex is O(1), not Array.shift O(n). */
export function bfs(graph: Graph, start: string, options: Options = {}): Traversal {
    const result: Traversal = { order: [], distance: new Map(), previous: new Map(), trace: [], truncated: false };
    if (!graph.vertices.has(start))
        return result;
    const queue = [start], maxDepth = options.depth ?? Infinity, limit = options.limit ?? 5000;
    result.distance.set(start, 0);
    for (let head = 0; head < queue.length; head++) {
        const id = queue[head], depth = result.distance.get(id)!;
        result.order.push(id);
        if (depth < maxDepth)
            for (const edge of graph.adjacent.get(id) ?? []) {
                if (options.allow && !options.allow(edge) || result.distance.has(edge.to))
                    continue;
                if (result.distance.size >= limit) {
                    result.truncated = true;
                    continue;
                }
                result.distance.set(edge.to, depth + 1);
                result.previous.set(edge.to, id);
                queue.push(edge.to);
            }
        if (options.trace)
            result.trace.push({ id, depth, frontier: queue.slice(head + 1), event: 'discover' });
    }
    return result;
}
/** Explicit DFS frames retain the next neighbor index and record real backtracking. */
export function dfs(graph: Graph, start: string, options: Options = {}): Traversal {
    const result: Traversal = { order: [], distance: new Map(), previous: new Map(), trace: [], truncated: false };
    if (!graph.vertices.has(start))
        return result;
    const stack = [{ id: start, index: 0 }], maxDepth = options.depth ?? Infinity, limit = options.limit ?? 5000;
    const discover = (id: string, depth: number) => { result.order.push(id); result.distance.set(id, depth); if (options.trace)
        result.trace.push({ id, depth, event: 'discover', frontier: stack.map(f => f.id) }); };
    discover(start, 0);
    while (stack.length) {
        const frame = stack[stack.length - 1], depth = result.distance.get(frame.id)!, neighbors = graph.adjacent.get(frame.id) ?? [];
        if (depth >= maxDepth || frame.index >= neighbors.length) {
            stack.pop();
            if (options.trace)
                result.trace.push({ id: frame.id, depth, event: 'return', frontier: stack.map(f => f.id) });
            continue;
        }
        const edge = neighbors[frame.index++];
        if (options.allow && !options.allow(edge) || result.distance.has(edge.to))
            continue;
        if (result.distance.size >= limit) {
            result.truncated = true;
            continue;
        }
        result.previous.set(edge.to, frame.id);
        stack.push({ id: edge.to, index: 0 });
        discover(edge.to, depth + 1);
    }
    return result;
}
export function path(result: Traversal, target: string): string[] {
    if (!result.distance.has(target))
        return [];
    const steps = [target];
    while (result.previous.has(steps[steps.length - 1]))
        steps.push(result.previous.get(steps[steps.length - 1])!);
    return steps.reverse();
}
/** Weak components are explicit: the undirected projection does not change semantic edges in G. */
export function components(graph: Graph): string[][] {
    const weak = new Graph();
    for (const v of graph.vertices.values())
        weak.addVertex(v);
    for (const e of graph.edges)
        weak.addEdge(e, true);
    weak.finalize();
    const seen = new Set<string>(), groups: string[][] = [];
    for (const id of [...weak.vertices.keys()].sort())
        if (!seen.has(id)) {
            const group = dfs(weak, id).order;
            groups.push(group);
            for (const key of group)
                seen.add(key);
        }
    return groups;
}
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
    const left = new Set(a), right = new Set(b), union = new Set([...left, ...right]);
    if (!union.size)
        return 0;
    let common = 0;
    for (const id of left)
        if (right.has(id))
            common++;
    return common / union.size;
}
/** Typed bipartite projection; friends, courses and skills are never interchangeable. */
export function sharedNeighbors(graph: Graph, a: string, b: string, type: EdgeType): string[] {
    const left = new Set((graph.adjacent.get(a) ?? []).filter(e => e.type === type).map(e => e.to));
    return [...new Set((graph.adjacent.get(b) ?? []).filter(e => e.type === type && left.has(e.to)).map(e => e.to))].sort();
}
