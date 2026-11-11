"use client";
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Network, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/team-link/user-avatar';
import { FriendshipControls } from '@/components/profile/friendships';
import { useSupabaseSession } from '@/hooks/use-supabase-session';
import { getSupabaseClient } from '@/lib/supabase/client';
import { FRIENDSHIPS_CHANGED, PROFILE_CHANGED } from '@/lib/profile-social';
import { loadRecommendations } from '@/lib/graph/actions';
import type { RecommendationResult } from '@/lib/graph/types';
import { GraphDemo } from './graph-demo';
import { RequirementWeights } from './requirement-weights';
const graphChanged = 'team-link:graph-changed';
export function Recommendations({ kind, project }: {
    kind: 'collaborators' | 'opportunities' | 'friends';
    project?: string;
}) {
    const [vacancyFilter, setVacancyFilter] = useState(''), [expanded, setExpanded] = useState(false);
    const { user } = useSupabaseSession(), uid = user?.id, scope = (uid ?? '') + ':' + kind + ':' + project + ':' + vacancyFilter;
    const [result, setResult] = useState<{
        scope: string;
        data: RecommendationResult;
    }>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const sequence = useRef(0);
    const invalidate = useCallback(() => { sequence.current++; }, []);
    const data = result?.scope === scope ? result.data : undefined;
    const load = useCallback(async () => { if (!uid)
        return; const request = ++sequence.current; setResult(undefined); setBusy(true); setError(''); try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session || session.user.id !== uid)
            return;
        const next = await loadRecommendations(session.access_token, kind, project, vacancyFilter || undefined);
        if (!next.ok)
            throw Error(next.message);
        if (sequence.current === request)
            setResult({ scope, data: next.data });
    }
    catch (e) {
        if (sequence.current === request)
            setError(e instanceof Error ? e.message : 'Recomendações indisponíveis.');
    }
    finally {
        if (sequence.current === request)
            setBusy(false);
    } }, [uid, kind, project, scope, vacancyFilter]);
    useEffect(() => { setResult(undefined); void load(); const refresh = () => { if (!document.hidden)
        void load(); }; window.addEventListener('focus', refresh); window.addEventListener(graphChanged, refresh); window.addEventListener(FRIENDSHIPS_CHANGED, refresh); window.addEventListener(PROFILE_CHANGED, refresh); document.addEventListener('visibilitychange', refresh); return () => { invalidate(); window.removeEventListener('focus', refresh); window.removeEventListener(graphChanged, refresh); window.removeEventListener(FRIENDSHIPS_CHANGED, refresh); window.removeEventListener(PROFILE_CHANGED, refresh); document.removeEventListener('visibilitychange', refresh); }; }, [load, invalidate]);
    if (!uid)
        return null;
    const title = kind === 'collaborators' ? 'Pessoas recomendadas' : kind === 'friends' ? 'Pessoas que você pode conhecer' : 'Recomendados para você';
    return <section aria-label={title} className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Network className="size-5 text-link" aria-hidden/>{title}</h2><p className="mt-1 max-w-prose text-sm text-muted-foreground">Conexões e critérios calculados a partir de informações cadastradas. Nenhuma solicitação é enviada automaticamente.</p></div><Button variant="ghost" size="sm" disabled={busy} onClick={() => void load()}><RefreshCw className="size-4" aria-hidden/>Atualizar</Button></header>
  {kind === 'friends' && data && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={data.sharing} disabled={busy} onChange={event => { const checked = event.target.checked; setResult(current => current?.scope === scope ? { ...current, data: { ...current.data, sharing: checked } } : current); setBusy(true); void getSupabaseClient().from('graph_preferences').upsert({ user_id: uid, share_connections: checked }).then(({ error }) => { if (error) {
        setResult(current => current?.scope === scope ? { ...current, data: { ...current.data, sharing: !checked } } : current);
        setError('Não foi possível salvar essa preferência.');
        setBusy(false);
    }
    else
        window.dispatchEvent(new Event(graphChanged)); }); }}/><span>Permitir minhas conexões de amizade nos grafos de sugestões.<span className="block text-xs text-muted-foreground">Desativado por padrão. Uma aresta só é usada quando as duas pessoas permitem; mensagens e conteúdo de conversas nunca são utilizados.</span></span></label>}
  {busy && <p role="status" className="text-sm text-muted-foreground">Calculando conexões…</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  {data && <>{kind === 'collaborators' && Boolean(data.vacancies?.length) && <label className="block space-y-2 text-sm"><span className="block font-medium">Pessoas para a vaga</span><select className="min-h-11 w-full rounded-lg border bg-background p-2" value={vacancyFilter} onChange={event => { setVacancyFilter(event.target.value); setExpanded(false); }}><option value="">Todas as vagas abertas</option>{data.vacancies?.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}</select></label>}<div className="grid min-w-0 items-start gap-3 @container/recommendations sm:grid-cols-2">{data.items.slice(0, expanded ? 12 : 4).map(item => <article key={item.id} className="min-w-0 space-y-3 rounded-xl border border-border p-4">
   <div className="flex items-start gap-3">{kind !== 'opportunities' && <UserAvatar name={item.name} imageUrl={item.avatar ?? undefined} sizeClassName="size-10 shrink-0"/>}<div className="min-w-0"><h3 className="break-words font-semibold">{item.name}</h3>{item.vacancyTitle && <p className="break-words text-sm text-muted-foreground">{item.vacancyTitle}{item.available !== undefined ? ' · ' + item.available + ' posição(ões) disponível(is)' : ''}</p>}</div></div>
   {item.technical && <div className="space-y-1"><p className="text-sm font-medium text-link">{item.technical.percent === null ? 'Sem requisitos técnicos para calcular cobertura' : item.technical.percent + '% de correspondência ponderada'}</p>{item.technical.percent !== null && <p className="text-xs text-muted-foreground">{item.technical.exactPercent}% em conceitos exatos ou aliases validados. Relações semânticas têm crédito reduzido e não suprem requisitos essenciais.</p>}</div>}
   {kind === 'friends' && <p className="text-sm text-link">Afinidade calculada: {item.score}%</p>}<p className="text-xs text-muted-foreground">Cobertura dos componentes de informação: {Math.round(item.coverage * 100)}%. Compatibilidade indica evidências cadastradas, não desempenho ou proficiência.</p>
   <ul className="space-y-1 text-xs text-muted-foreground">{item.reasons.slice(0, 4).map(reason => <li key={reason}>• {reason}</li>)}</ul>
   <details className="text-sm"><summary className="cursor-pointer font-medium">Entender a sugestão</summary><div className="mt-2 space-y-2 text-xs text-muted-foreground">{item.technical && <><p>Identificadas: {item.technical.identified.map(match => match.label + (match.kind === 'related' ? ' (relacionada, fator ' + match.factor + ')' : match.kind === 'alias' ? ' (alias validado)' : '') + ' · peso ' + match.weight).join('; ') || 'nenhuma competência identificada'}.</p><p>Não identificadas no perfil: {item.technical.unidentified.join(', ') || 'nenhuma entre os requisitos cadastrados'}.</p></>}<p>{item.tags.length ? 'Conceitos em destaque: ' + item.tags.join(', ') : 'Sem outros conceitos compartilhados identificados.'}</p>{item.academic.map(text => <p key={text}>{text}</p>)}</div></details>
   {kind === 'opportunities' ? <Button asChild variant="outline" size="sm"><Link href={'/meu-espaco/vagas?vaga=' + item.vacancy}>Ver oportunidade</Link></Button> : <div className="flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={'/usuarios/' + item.id.split(':')[0]}>Ver perfil{kind === 'collaborators' ? ' e contato' : ''}</Link></Button>{kind === 'friends' && <FriendshipControls userId={item.id} relationship="none" onChanged={() => void load()}/>}</div>}
  </article>)}</div>{data.items.length > 4 && <Button type="button" variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Mostrar menos' : 'Ver mais sugestões (' + data.items.length + ')'}</Button>}{!data.items.length && <div className="space-y-2 text-sm text-muted-foreground"><p>{kind === 'collaborators' ? 'Nenhuma pessoa elegível identificada para as vagas abertas neste recorte.' : 'Ainda não há conexões suficientes para sugerir resultados neste recorte.'}</p><p>Habilidades, interesses e formação são opcionais e ajudam quando informados.</p>{kind !== 'collaborators' && <Link href="/meu-espaco/perfil/editar" className="text-link hover:underline">Revisar meu perfil</Link>}</div>}
   {data.limited && <p className="text-xs text-muted-foreground">A análise usa um recorte limitado; esta lista não representa todos os usuários ou oportunidades.</p>}</>}
  {kind === 'collaborators' && project && <><RequirementWeights project={project} onSaved={() => window.dispatchEvent(new Event(graphChanged))}/><GraphDemo project={project}/></>}
 </section>;
}
