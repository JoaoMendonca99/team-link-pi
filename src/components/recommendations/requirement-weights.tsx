"use client";
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getSupabaseClient } from '@/lib/supabase/client';
import { requirementWeights } from '@/lib/graph/actions';
import type { Requirement } from '@/lib/graph/types';
const labels = ['Baixa', 'Complementar', 'Moderada', 'Alta', 'Essencial'];
export function RequirementWeights({ project, onSaved }: {
    project: string;
    onSaved: () => void;
}) {
    const [rows, setRows] = useState<{
        title: string;
        requirements: Requirement[];
    }[]>(), [weights, setWeights] = useState<Record<string, number>>({}), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    async function read() { if (rows)
        return; setBusy(true); try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session)
            return;
        const result = await requirementWeights(session.access_token, project);
        if (!result.ok)
            throw Error(result.message);
        setRows([{ title: 'Requisitos gerais do projeto', requirements: result.data.project }, ...result.data.vacancies.map(v => ({ title: v.title, requirements: v.requirements }))]);
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function save(requirements: Requirement[]) { setBusy(true); setNotice(''); try {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session)
            return;
        const changes = requirements.filter(r => weights[r.key] !== undefined).map(r => ({ key: r.key, source: r.source, weight: weights[r.key] }));
        const result = await requirementWeights(session.access_token, project, changes);
        if (!result.ok)
            throw Error(result.message);
        setRows([{ title: 'Requisitos gerais do projeto', requirements: result.data.project }, ...result.data.vacancies.map(v => ({ title: v.title, requirements: v.requirements }))]);
        setWeights(current => { const next = { ...current }; for (const r of requirements)
            delete next[r.key]; return next; });
        setNotice('Pesos salvos.');
        onSaved();
    }
    catch (e) {
        setNotice((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <details onToggle={event => { if (event.currentTarget.open)
        void read(); }} className="rounded-xl border border-border p-3"><summary className="cursor-pointer font-medium">Importância das competências (1–5)</summary><div className="mt-3 space-y-4"><p className="text-sm text-muted-foreground">O peso representa a importância do requisito, não o conhecimento do estudante. Competências são editadas nos formulários existentes de vagas/projeto.</p>{busy && <p role="status">Carregando…</p>}{notice && <p role="status" className="text-sm">{notice}</p>}{rows?.map((row, index) => <section key={index} className="space-y-2"><h3 className="text-sm font-semibold">{row.title}</h3>{row.requirements.map(r => <label key={r.key} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="min-w-0 break-words">{r.label}{!r.concept ? ' · conceito ainda não resolvido' : ''}</span><select aria-label={'Importância de ' + r.label + ' em ' + row.title} disabled={busy} className="min-h-11 rounded-lg border bg-background p-2" value={weights[r.key] ?? r.weight} onChange={e => setWeights(current => ({ ...current, [r.key]: Number(e.target.value) }))}>{labels.map((label, i) => <option key={label} value={i + 1}>{i + 1} — {label}</option>)}</select></label>)}{row.requirements.length ? <Button type="button" size="sm" variant="outline" disabled={busy || !row.requirements.some(r => weights[r.key] !== undefined)} onClick={() => void save(row.requirements)}>Salvar pesos desta seção</Button> : <p className="text-xs text-muted-foreground">Nenhum requisito cadastrado.</p>}</section>)}</div></details>;
}
