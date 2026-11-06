const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),{execFileSync}=require('node:child_process')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const M=require('../src/lib/reports/model.ts'),A=require('../src/lib/reports/assistant.ts')
test('legacy documents resume without mutation and preserve custom/required sections',()=>{
 for(const kind of ['academic','tap','abstract']){const r=M.createReport(kind);r.sections[0].title='Seção personalizada';r.sections[0].required=true;r.style.left=41;const before=JSON.stringify(r);assert.equal(A.resumeStep(r,'draft'),2);r.sections[0].content={type:'doc',content:[M.paragraph('Texto antigo')]};const filled=JSON.stringify(r);assert.equal(A.resumeStep(r,'draft'),4);assert.equal(A.resumeStep(r,'final'),5);assert.equal(JSON.stringify(r),filled);assert.equal(r.style.left,41);assert.ok(before.includes('Seção personalizada'))}
})
test('confirmed selections are immutable snapshots, exported only after explicit insertion',()=>{
 const r=M.createReport('academic'),record={id:'task1',title:'Atividade escolhida',detail:'Valor original',period:'2026.2'}
 r.assistant={step:3,section:r.sections[0].id,selections:[{id:'group1',category:'tasks',records:[structuredClone(record)],format:'table',capturedAt:'2026-11-06T12:00:00Z'}]}
 record.detail='Alterado na origem';const saved=JSON.parse(JSON.stringify(r));assert.equal(saved.assistant.selections[0].records[0].detail,'Valor original');assert.equal(A.resumeStep(saved,'draft'),3);assert.ok(!r.sections.some(A.sectionHasContent));
 const group=saved.assistant.selections[0],inserted=A.sourceContent(group.records,group.format,group.capturedAt);assert.equal(inserted[0].type,'academicTable');assert.match(JSON.stringify(inserted),/Valor original/);assert.ok(!JSON.stringify(inserted).includes('Alterado na origem'))
})
test('empty sections, figures, citations and tables produce accurate navigation indicators',()=>{
 const s=M.createReport('abstract').sections[0];assert.equal(A.sectionHasContent(s),false);for(const type of ['figure','citation','academicTable']){s.content={type:'doc',content:[{type,attrs:{}}]};assert.equal(A.sectionHasContent(s),true)}
 assert.ok(A.sectionHint('Riscos','tap').includes('riscos'));assert.ok(A.sectionHint('Resumo','abstract').includes('limite de palavras'))
})
test('formatter, migration and all schema/permission rules remain byte-for-byte identical',()=>{
 for(const file of ['src/lib/reports/export.ts','supabase/migrations/20261106121219_academic_reports.sql'])assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show','1bf113f:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'))
})
