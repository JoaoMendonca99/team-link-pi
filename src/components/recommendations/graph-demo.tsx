"use client";
import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { loadGraphDemo } from '@/lib/graph/actions';
import { syntheticDemo, type Demo } from '@/lib/graph/demo';
const colors: Record<string, string> = { user: '#60a5fa', project: '#fb923c', vacancy: '#facc15', concept: '#2dd4bf', course: '#c4b5fd', institution: '#f9a8d4', area: '#cbd5e1' };
const names: Record<string, string> = { user: 'Usuário', project: 'Projeto', vacancy: 'Vaga', concept: 'Conceito', course: 'Curso', institution: 'Instituição', area: 'Área CINE' };
const edgeNames: Record<string, string> = { skill: 'Habilidade declarada', interest: 'Interesse declarado', tag: 'Tag', requirement: 'Requisito', vacancy: 'Vaga do projeto', member: 'Participação', friend: 'Amizade autorizada', course: 'Formação: curso', institution: 'Formação: instituição', cine: 'Classificação CINE', parent: 'Área superior', offer: 'Oferta (não indica matrícula)', related: 'Relacionado', specific: 'Mais específico que', specialization: 'Tem especialização (descoberta)' };
export function GraphDemo({ project }: {
    project: string;
}) {
    const [data, setData] = useState<Demo>(syntheticDemo), [method, setMethod] = useState<'bfs' | 'dfs'>('bfs'), [step, setStep] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const marker = useId().replaceAll(':', ''), [mobile, setMobile] = useState(false);
    useEffect(() => { const query = matchMedia('(max-width:639px)'); const change = () => setMobile(query.matches); change(); query.addEventListener('change', change); return () => query.removeEventListener('change', change); }, []);
    const columns = mobile ? 2 : 4;
    const run = data[method], frame = run.trace[Math.min(step, run.trace.length - 1)], label = (id: string) => data.vertices.find(v => v.id === id)?.label ?? id;
    const positions = useMemo(() => new Map(data.vertices.map((v, i) => [v.id, { x: 85 + (i % columns) * 180, y: 65 + Math.floor(i / columns) * 110 }])), [data.vertices, columns]);
    async function real() { setBusy(true); setError(''); try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session)
            return;
        const result = await loadGraphDemo(session.access_token, project);
        if (!result.ok)
            throw Error(result.message);
        setData(result.data);
        setStep(0);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <details className="rounded-xl border border-border p-3"><summary className="cursor-pointer font-medium">Demonstração técnica: grafos, BFS e DFS</summary><div className="mt-4 min-w-0 space-y-4">
  <p className="text-sm text-muted-foreground">O mesmo construtor e os mesmos algoritmos usados no recomendador. {data.synthetic ? 'Dados sintéticos, sem pessoas reais. React (5) + Supabase (3) de um total 10 = 80% de cobertura exata.' : 'Recorte autorizado do contexto atual, limitado a 24 vértices para leitura. A recomendação usa o subgrafo maior e filtros adicionais.'}</p>
  <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setData(syntheticDemo()); setStep(0); }}>Exemplo sintético</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => void real()}>Carregar contexto real autorizado</Button></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  <p className="text-xs text-muted-foreground">{data.vertices.length} vértices de {data.totalVertices} · {data.edges.length} arcos (relações bidirecionais contam duas vezes) · {data.components} componente(s) fraco(s)</p>
  <div className="flex flex-wrap gap-2 text-xs" aria-label="Legenda de vértices">{Object.entries(colors).map(([type, color]) => <span key={type} className="flex items-center gap-1"><span aria-hidden style={{ background: color }} className="size-2 rounded-full"/>{names[type]}</span>)}</div>
  <div role="region" aria-label="Visualização do subgrafo" tabIndex={0} className="max-h-[60dvh] overflow-y-auto rounded-xl border border-border focus-visible:outline-2 focus-visible:outline-ring"><svg viewBox={'0 0 ' + (columns * 180) + ' ' + (Math.ceil(data.vertices.length / columns) * 110 + 30)} role="img" aria-label="Subgrafo autorizado: vértices tipados e arestas ponderadas" className="w-full rounded-xl border border-border bg-background"><defs><marker id={marker} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker></defs>{data.edges.map((e, i) => { const a = positions.get(e.from)!, b = positions.get(e.to)!, active = run.path.some((id, index) => id === e.from && run.path[index + 1] === e.to); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={active ? '#fb923c' : '#64748b'} strokeWidth={active ? 3 : 1} markerEnd={"url(#" + marker + ")"}><title>{label(e.from) + ' → ' + label(e.to) + ' · ' + edgeNames[e.type] + ' · peso ' + e.weight}</title></line>; })}{data.vertices.map(v => { const pos = positions.get(v.id)!; return <g key={v.id}><circle cx={pos.x} cy={pos.y} r={frame?.id === v.id ? 19 : 14} fill={colors[v.type]} stroke={frame?.id === v.id ? '#f8fafc' : '#0b1120'} strokeWidth={3}/><text x={pos.x} y={pos.y + 34} textAnchor="middle" fill="currentColor" fontSize="11">{v.label.length > 24 ? v.label.slice(0, 22) + '…' : v.label}<title>{v.label + ' · ' + names[v.type]}</title></text></g>; })}</svg></div>
  <div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-sm"><span className="block">Algoritmo</span><select className="min-h-11 rounded-lg border bg-background p-2" value={method} onChange={e => { setMethod(e.target.value as 'bfs' | 'dfs'); setStep(0); }}><option value="bfs">BFS · busca em largura</option><option value="dfs">DFS · busca em profundidade</option></select></label><Button variant="outline" size="sm" disabled={step === 0} onClick={() => setStep(i => i - 1)}>Passo anterior</Button><Button variant="outline" size="sm" disabled={step >= run.trace.length - 1} onClick={() => setStep(i => i + 1)}>Próximo passo</Button><span role="status" className="text-xs">Passo {step + 1} de {run.trace.length}</span></div>
  <dl className="space-y-2 break-words text-sm"><div><dt className="font-medium">Início → destino</dt><dd>{label(data.start)} → {label(data.target)}</dd></div><div><dt className="font-medium">{method === 'bfs' ? 'Fila FIFO após processar o vértice' : 'Pilha / chamadas ativas'}</dt><dd>{frame?.frontier.map(label).join(' → ') || 'Vazia'}</dd></div><div><dt className="font-medium">Evento atual e nível</dt><dd>{frame ? label(frame.id) + ' · ' + (frame.event === 'return' ? 'retorno/backtracking' : 'descoberta') + ' · nível ' + frame.depth : 'Sem percurso'}</dd></div><div><dt className="font-medium">Visitados até este passo</dt><dd>{run.trace.slice(0, step + 1).filter(event => event.event === 'discover').map(event => label(event.id)).join(' → ')}</dd></div><div><dt className="font-medium">Níveis BFS</dt><dd>{data.bfs.order.map(id => label(id) + ': ' + data.bfs.distance[id]).join('; ')}</dd></div><div><dt className="font-medium">Ordem de visita completa</dt><dd>{run.order.map(label).join(' → ')}</dd></div><div><dt className="font-medium">Conectividade e caminho calculado</dt><dd>{run.connected ? 'Conectados neste recorte: ' + run.path.map(label).join(' → ') : 'Sem caminho neste recorte.'}</dd></div></dl>
  <details><summary className="cursor-pointer text-sm font-medium">Arestas e pesos do recorte</summary><ul className="mt-2 space-y-1 break-words text-xs text-muted-foreground">{data.edges.map((e, i) => <li key={i}>{label(e.from)} → {label(e.to)} · {edgeNames[e.type]} · peso {e.weight}</li>)}</ul></details>
 </div></details>;
}
