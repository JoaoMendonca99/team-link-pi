import fs from 'node:fs'
// Input contains aggregate {context,term,n} rows only, never account/project identifiers.
const rows=JSON.parse(fs.readFileSync(process.argv[2],'utf8'))
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[^a-z0-9+#.]+/g,' ')
const main=rows.filter(r=>r.context!=='legacy_requirements')
function groups(values){const result=new Map();for(const r of values){const k=normalize(r.term),g=result.get(k)??{forms:new Set(),contexts:new Set()};g.forms.add(r.term);g.contexts.add(r.context);result.set(k,g)}return result}
const all=groups(rows),current=groups(main)
const report={contexts:{},main_contexts_entries:main.reduce((n,r)=>n+r.n,0),legacy_entries:rows.filter(r=>r.context==='legacy_requirements').reduce((n,r)=>n+r.n,0),
 distinct_raw:new Set(rows.map(r=>r.term)).size,distinct_normalized:all.size,
 shared_across_main_contexts:[...current].filter(([,g])=>g.contexts.size>1).map(([term,g])=>({term,contexts:[...g.contexts]})),
 shared_including_legacy:[...all.values()].filter(g=>g.contexts.size>1).length,
 case_only_groups:[...all.values()].filter(g=>g.forms.size>1&&new Set([...g.forms].map(s=>s.toLowerCase())).size===1).length,
 accent_spacing_groups:[...all.values()].filter(g=>g.forms.size>1&&new Set([...g.forms].map(s=>s.toLowerCase())).size>1).length,
 variants:[...all].filter(([,g])=>g.forms.size>1).map(([normalized,g])=>({normalized,forms:[...g.forms]})),
 null_arrays:{skills:0,interests:0},empty_arrays:{skills:6,interests:6},
 synonym_candidates:{existing_pairs:[['Webdev','Desenvolvimento Web'],['Automatização','Automação'],['Inteligente Artificial','Inteligência Artificial']],decision:'Revisão pendente; nenhuma equivalência presumida.'},
 ambiguous_terms:['IA','IHM','QA','CBA','Modelagem','Redes','Oxido','Design,programação','UX/UI'],
}
for(const r of rows){const c=report.contexts[r.context]??={entries:0,distinct_terms:0};c.entries+=r.n;c.distinct_terms++}
fs.writeFileSync('data/concepts/diagnosis.json',JSON.stringify(report,null,2)+'\n')
console.log({main_entries:report.main_contexts_entries,legacy_entries:report.legacy_entries,main_shared:report.shared_across_main_contexts.length,including_legacy_shared:report.shared_including_legacy,case_variants:report.case_only_groups,accent_spacing_variants:report.accent_spacing_groups})
