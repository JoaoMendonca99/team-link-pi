import { Graph, bfs, jaccard, path, sharedNeighbors, vertexId } from './graph';
import type { Concept, Person, RecommendationResult, Requirement, Snapshot, Technical } from './types';
export const MODEL = { version: '1.0', relatedFactor: 0.35, specificFactor: 0.5, essential: 5, maxDepth: 5, maxVisited: 15000,
    social: { skills: 0.25, interests: 0.25, friends: 0.20, course: 0.10, cine: 0.05, institution: 0.05, projects: 0.10 },
    opportunity: { technical: 0.60, interest: 0.20, tags: 0.10, category: 0.05, academic: 0.03, connections: 0.02 }, collaborator: { technical: 0.90, interest: 0.05, academic: 0.05 } } as const;
const ids = (list: Concept[]) => list.map(c => c.id);
const node = vertexId;
const rounding = (n: number) => Math.round(Math.max(0, Math.min(100, n)) * 100) / 100;
export function buildGraph(data: Snapshot): Graph {
    const graph = new Graph();
    const add = (type: Parameters<typeof node>[0], id: string, label: string) => graph.addVertex({ id: node(type, id), type, label });
    const edge = (from: string, to: string, type: Parameters<Graph['addEdge']>[0]['type'], weight = 1, both = true) => { if (graph.vertices.has(from) && graph.vertices.has(to))
        graph.addEdge({ from, to, type, weight }, both); };
    for (const c of data.concepts)
        add('concept', c.id, c.label);
    for (const p of data.people) {
        add('user', p.id, p.name);
        for (const c of [...p.skills, ...p.interests])
            add('concept', c.id, c.label);
    }
    for (const p of data.projects) {
        add('project', p.id, p.title);
        for (const c of p.tags)
            add('concept', c.id, c.label);
    }
    for (const v of data.vacancies)
        add('vacancy', v.id, v.title);
    for (const c of data.courses)
        add('course', c.id, c.label);
    for (const a of data.areas)
        add('area', a.id, a.label);
    for (const i of data.institutions)
        add('institution', i.id, i.label);
    for (const p of data.people) {
        for (const c of p.skills)
            edge(node('user', p.id), node('concept', c.id), 'skill');
        for (const c of p.interests)
            edge(node('user', p.id), node('concept', c.id), 'interest');
        for (const e of p.educations) {
            if (e.course)
                edge(node('user', p.id), node('course', e.course), 'course');
            if (e.institution)
                edge(node('user', p.id), node('institution', e.institution), 'institution');
        }
    }
    const requirements = (owner: string, reqs: Requirement[]) => { for (const r of reqs)
        if (r.concept) {
            add('concept', r.concept, r.label);
            edge(owner, node('concept', r.concept), 'requirement', r.weight);
        } };
    for (const p of data.projects) {
        for (const c of p.tags)
            edge(node('project', p.id), node('concept', c.id), 'tag');
        requirements(node('project', p.id), p.requirements);
    }
    for (const v of data.vacancies) {
        edge(node('project', v.project), node('vacancy', v.id), 'vacancy');
        requirements(node('vacancy', v.id), v.requirements);
    }
    for (const f of data.friends)
        edge(node('user', f.a), node('user', f.b), 'friend');
    for (const m of data.members)
        edge(node('user', m.user), node('project', m.project), 'member');
    for (const c of data.courses)
        if (c.cine)
            for (const area of data.areas)
                if (c.cine.startsWith(area.id))
                    edge(node('course', c.id), node('area', area.id), 'cine', area.id === c.cine ? 1 : 0.5);
    for (const a of data.areas)
        if (a.parent)
            edge(node('area', a.id), node('area', a.parent), 'parent', 1, false);
    for (const o of data.offers)
        edge(node('institution', o.institution), node('course', o.course), 'offer');
    for (const r of data.relations) {
        if (r.type === 'relacionado_a')
            edge(node('concept', r.from), node('concept', r.to), 'related', MODEL.relatedFactor);
        else {
            edge(node('concept', r.from), node('concept', r.to), 'specific', MODEL.specificFactor, false);
            edge(node('concept', r.to), node('concept', r.from), 'specialization', MODEL.specificFactor, false);
        }
    }
    return graph.finalize();
}
export function technical(skills: Concept[], requirements: Requirement[], relations: Snapshot['relations']): Technical {
    const required = new Map<string, Requirement>();
    for (const r of requirements) {
        if (!Number.isInteger(r.weight) || r.weight < 1 || r.weight > 5)
            throw Error('Weight must be 1–5');
        const key = r.concept ?? r.key, old = required.get(key);
        if (!old || old.weight < r.weight)
            required.set(key, r);
    }
    const present = new Map(skills.map(c => [c.id, c])), identified: Technical['identified'] = [], unidentified: string[] = [];
    let total = 0, exact = 0, weighted = 0;
    for (const r of required.values()) {
        total += r.weight;
        const same = r.concept ? present.get(r.concept) : undefined;
        if (same) {
            exact += r.weight;
            weighted += r.weight;
            identified.push({ label: r.label, kind: same.raw && same.raw.toLocaleLowerCase('pt-BR') !== same.label.toLocaleLowerCase('pt-BR') ? 'alias' : 'exact', weight: r.weight, factor: 1 });
            continue;
        }
        const support = r.concept ? relations.filter(rel => rel.type === 'relacionado_a' && (rel.to === r.concept && present.has(rel.from) || rel.from === r.concept && present.has(rel.to)) || rel.type === 'mais_especifico_que' && rel.to === r.concept && present.has(rel.from)) : [];
        const factor = r.weight === MODEL.essential ? 0 : Math.max(0, ...support.map(rel => rel.type === 'mais_especifico_que' ? MODEL.specificFactor : MODEL.relatedFactor));
        if (factor) {
            weighted += r.weight * factor;
            identified.push({ label: r.label, kind: 'related', weight: r.weight, factor });
        }
        else
            unidentified.push(r.label);
    }
    return { evidenceCoverage: total && present.size ? [...required.values()].filter(r => r.concept).reduce((sum, r) => sum + r.weight, 0) / total : 0, percent: total ? rounding(100 * weighted / total) : null, exactPercent: total ? rounding(100 * exact / total) : null, total, identified, unidentified, jaccard: jaccard(present.keys(), [...required.values()].flatMap(r => r.concept ? [r.concept] : [])) };
}
export function academic(a: Person, b: Person, data: Snapshot) {
    const ac = new Set(a.educations.flatMap(e => e.course ? [e.course] : [])), bc = new Set(b.educations.flatMap(e => e.course ? [e.course] : []));
    const ai = new Set(a.educations.flatMap(e => e.institution ? [e.institution] : [])), bi = new Set(b.educations.flatMap(e => e.institution ? [e.institution] : []));
    const course = Number([...ac].some(c => bc.has(c))), institution = Number([...ai].some(i => bi.has(i)));
    let cine = 0;
    for (const x of data.courses.filter(c => ac.has(c.id)))
        for (const y of data.courses.filter(c => bc.has(c.id))) {
            if (x.id === y.id || !x.cine || !y.cine)
                continue;
            cine = Math.max(cine, x.cine === y.cine ? 0.8 : x.cine.slice(0, 4) === y.cine.slice(0, 4) ? 0.6 : x.cine.slice(0, 3) === y.cine.slice(0, 3) ? 0.35 : x.cine.slice(0, 2) === y.cine.slice(0, 2) ? 0.1 : 0);
        }
    const reasons = [...(course ? ['Mesmo curso canônico informado'] : []), ...(cine ? ['Cursos distintos com classificação CINE relacionada'] : []), ...(institution ? ['Instituição em comum nas formações informadas'] : [])];
    return { course, institution, cine, reasons, coverage: Number(ac.size > 0 && bc.size > 0) + Number(ai.size > 0 && bi.size > 0) };
}
function social(graph: Graph, a: Person, b: Person, data: Snapshot) {
    const acad = academic(a, b, data), skills = jaccard(ids(a.skills), ids(b.skills)), interests = jaccard(ids(a.interests), ids(b.interests));
    const friends = sharedNeighbors(graph, node('user', a.id), node('user', b.id), 'friend'), commonProjects = sharedNeighbors(graph, node('user', a.id), node('user', b.id), 'member');
    const neighbors = (id: string, type: 'friend' | 'member') => (graph.adjacent.get(node('user', id)) ?? []).filter(e => e.type === type).map(e => e.to);
    const values = { skills, interests, friends: jaccard(neighbors(a.id, 'friend'), neighbors(b.id, 'friend')), course: acad.course, cine: acad.cine, institution: acad.institution, projects: jaccard(neighbors(a.id, 'member'), neighbors(b.id, 'member')) };
    const coverage = (Number(a.skills.length > 0 && b.skills.length > 0) + Number(a.interests.length > 0 && b.interests.length > 0) + Number(neighbors(a.id, 'friend').length > 0 && neighbors(b.id, 'friend').length > 0) + Number(a.educations.some(e => e.course) && b.educations.some(e => e.course)) * 2 + Number(a.educations.some(e => e.institution) && b.educations.some(e => e.institution)) + Number(neighbors(a.id, 'member').length > 0 && neighbors(b.id, 'member').length > 0)) / 7;
    const score = rounding(100 * Object.entries(MODEL.social).reduce((sum, [key, w]) => sum + values[key as keyof typeof values] * w, 0));
    return { score, coverage: Math.min(1, coverage), academic: acad.reasons, reasons: [...(skills ? [`${sharedNeighbors(graph, node('user', a.id), node('user', b.id), 'skill').length} habilidade(s) declarada(s) em comum`] : []), ...(interests ? ['Interesses declarados em comum'] : []), ...(friends.length ? [`${friends.length} conexão(ões) de amizade compartilhada(s) e autorizada(s)`] : []), ...(commonProjects.length ? ['Participação em projeto acessível em comum'] : []), ...acad.reasons] };
}
export function recommend(data: Snapshot, kind: 'collaborators' | 'opportunities' | 'friends', projectId?: string, vacancyId?: string, limit = 12): RecommendationResult {
    const graph = buildGraph(data), actor = data.people.find(p => p.id === data.actor);
    const root = kind === 'collaborators' ? node('project', projectId ?? '') : node('user', data.actor);
    // Candidate discovery is an actual FIFO traversal. Academic offers are excluded:
    // an offered course never implies that a person attends the offering institution.
    const allow = new Set(kind === 'collaborators' ? ['vacancy', 'requirement', 'tag', 'skill', 'interest', 'related', 'specialization'] : kind === 'opportunities' ? ['skill', 'interest', 'requirement', 'tag', 'vacancy', 'related', 'specific'] : ['skill', 'interest', 'friend', 'course', 'institution', 'cine', 'parent', 'member', 'related']);
    const found = bfs(graph, root, { depth: MODEL.maxDepth, limit: MODEL.maxVisited, allow: e => allow.has(e.type) });
    const result: RecommendationResult = { items: [], limited: data.limited || found.truncated, sharing: data.sharing, context: { vertices: graph.vertices.size, edges: graph.edges.length }, notice: 'Resultados calculados em um subgrafo limitado. Ausência de informação não comprova ausência de competência.' };
    if (kind === 'collaborators')
        result.vacancies = data.vacancies.filter(v => v.project === projectId && v.open && v.available > 0).map(v => ({ id: v.id, title: v.title }));
    if (!actor)
        return result;
    const project = data.projects.find(p => p.id === projectId);
    if (kind === 'friends')
        for (const p of data.people) {
            if (p.id === actor.id || data.excludedFriends.includes(p.id) || !found.distance.has(node('user', p.id)))
                continue;
            const s = social(graph, actor, p, data);
            if (!s.score)
                continue;
            result.items.push({ id: p.id, name: p.name, avatar: p.avatar, ...s, tags: p.skills.filter(c => actor.skills.some(a => a.id === c.id)).map(c => c.label).slice(0, 4), path: path(found, node('user', p.id)) });
        }
    if (kind === 'opportunities')
        for (const v of data.vacancies) {
            const p = data.projects.find(p => p.id === v.project);
            if (!p || !p.open || !v.open || v.available <= 0 || p.joined || p.pending || !found.distance.has(node('vacancy', v.id)))
                continue;
            const t = technical(actor.skills, v.requirements, data.relations);
            const interests = jaccard(ids(actor.interests), ids(p.tags)), tags = jaccard(ids(actor.skills), ids(p.tags));
            const team = data.people.filter(person => data.members.some(m => m.user === person.id && m.project === p.id));
            const category = Number(actor.interests.some(c => c.label.normalize('NFC').toLocaleLowerCase('pt-BR') === p.category?.normalize('NFC').toLocaleLowerCase('pt-BR')));
            const projectAcademic = { ...actor, educations: [{ course: p.academicCourse ?? null, institution: p.academicInstitution ?? null, current: false, status: 'context', primary: true }] };
            const acads = [academic(actor, projectAcademic, data), ...team.map(member => academic(actor, member, data))];
            const acad = Math.max(0, ...acads.map(a => Math.max(a.course, a.cine, a.institution)));
            const connected = Number(team.some(member => data.friends.some(f => f.a === actor.id && f.b === member.id || f.b === actor.id && f.a === member.id)));
            const score = rounding((t.percent ?? 0) * MODEL.opportunity.technical + 100 * interests * MODEL.opportunity.interest + 100 * tags * MODEL.opportunity.tags + 100 * category * MODEL.opportunity.category + 100 * acad * MODEL.opportunity.academic + 100 * connected * MODEL.opportunity.connections);
            if (!score)
                continue;
            result.items.push({ id: v.id, name: p.title, project: p.id, slug: p.slug, vacancy: v.id, vacancyTitle: v.title, available: v.available, technical: t, score, coverage: t.evidenceCoverage * 0.60 + Number(actor.interests.length > 0 && p.tags.length > 0) * 0.20 + Number(actor.skills.length > 0 && p.tags.length > 0) * 0.10 + Number(actor.interests.length > 0 && Boolean(p.category)) * 0.05 + Number(acads.some(a => a.coverage > 0)) * 0.03 + Number(data.sharing && team.length > 0) * 0.02, reasons: [...(t.identified.length ? ['Competências do perfil relacionadas aos requisitos da vaga'] : []), ...(interests ? ['Interesses em comum com as tags do projeto'] : []), ...(tags ? ['Habilidades em comum com temas do projeto'] : []), ...(category ? ['Categoria entre os interesses declarados'] : []), ...(acad ? ['Contexto acadêmico relacionado ao projeto ou à equipe pública'] : []), ...(connected ? ['Amizade autorizada com integrante'] : [])], tags: p.tags.filter(c => [...actor.skills, ...actor.interests].some(a => a.id === c.id)).map(c => c.label), academic: [], path: path(found, node('vacancy', v.id)) });
        }
    if (kind === 'collaborators' && project?.open)
        for (const v of data.vacancies.filter(v => v.project === project.id && v.open && v.available > 0 && (!vacancyId || v.id === vacancyId)))
            for (const p of data.people) {
                if (p.id === actor.id || p.excluded || data.members.some(m => m.project === project.id && m.user === p.id) || !found.distance.has(node('user', p.id)))
                    continue;
                const t = technical(p.skills, v.requirements, data.relations), affinity = jaccard(ids(p.interests), ids(project.tags)), s = academic({ ...actor, educations: [{ course: project.academicCourse ?? null, institution: project.academicInstitution ?? null, current: false, status: 'context', primary: true }] }, p, data);
                const score = rounding((t.percent ?? 0) * MODEL.collaborator.technical + 100 * affinity * MODEL.collaborator.interest + 100 * Math.max(s.course, s.cine, s.institution) * MODEL.collaborator.academic);
                if (!score)
                    continue;
                result.items.push({ id: p.id + ':' + v.id, name: p.name, avatar: p.avatar, project: project.id, vacancy: v.id, vacancyTitle: v.title, technical: t, score, coverage: t.evidenceCoverage * 0.9 + Number(p.interests.length > 0 && project.tags.length > 0) * 0.05 + s.coverage / 2 * 0.05, reasons: [...(t.identified.length ? ['Cobertura ponderada de requisitos cadastrados'] : []), ...(affinity ? ['Interesses declarados relacionados ao projeto'] : []), ...s.reasons], tags: p.skills.map(c => c.label).slice(0, 4), academic: s.reasons, path: path(found, node('user', p.id)) });
            }
    result.items.sort((a, b) => kind === 'friends' ? b.score - a.score || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id) : ((b.technical?.exactPercent ?? 0) - (a.technical?.exactPercent ?? 0)) || b.score - a.score || (b.technical?.jaccard ?? 0) - (a.technical?.jaccard ?? 0) || a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id));
    result.items = result.items.slice(0, limit);
    return result;
}
