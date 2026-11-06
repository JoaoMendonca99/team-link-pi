const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),{execFileSync}=require('node:child_process')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const A=require('../src/lib/projects/academics.ts'),M=require('../src/lib/reports/model.ts')
test('new semesters never copy a professor or discipline implicitly',()=>{
 const next=A.periodDraft();assert.equal(next.discipline,'');assert.equal(next.advisor,'');assert.equal(next.activate,false);assert.equal(next.discipline_confirmed,false);assert.equal(next.advisor_confirmed,false)
})
test('configured semester snapshots take precedence over later project defaults, including blank values',()=>{
 const space={revision:4,defaults:{institution:'Nova',course:'Novo',city:'Nova'},periods:[]},period={id:'p1',version:2,name:'2026.2',academic_configured:true,institution:'Histórica',course:null,city:null,advisor:'Professor B',academic_year:2026}
 assert.deepEqual(A.academicSnapshot(space,period),{institution:'Histórica',course:'',city:'',advisor:'Professor B',discipline:'',year:'2026',period:'2026.2'})
 assert.equal(A.academicSnapshot(space,{...period,academic_configured:false}).course,'Novo')
})
test('report linking and explicit copying preserve all content, and future source edits do not mutate reports',()=>{
 const report=M.createReport('academic');report.meta.title='Título próprio';report.meta.authors='Autora escolhida';report.sections[0].content={type:'doc',content:[M.paragraph('Texto preservado')]};const original=JSON.stringify(report)
 const space={revision:3,defaults:{institution:'Universidade',course:'Curso',city:'Cidade'}},period={id:'p1',version:4,name:'2026.2',advisor:'Professor B'}
 const linked=A.applyAcademicSnapshot(report,space,period,undefined,false);assert.deepEqual(linked.meta,report.meta);assert.equal(linked.academic.periodId,'p1')
 const copied=A.applyAcademicSnapshot(report,space,period);period.advisor='Professor C';space.defaults.institution='Outra'
 assert.equal(copied.meta.advisor,'Professor B');assert.equal(copied.meta.institution,'Universidade');assert.equal(copied.meta.title,'Título próprio');assert.equal(copied.meta.authors,'Autora escolhida');assert.deepEqual(copied.sections,report.sections);assert.equal(JSON.stringify(report),original)
})
test('PDF/DOCX engine and existing report migration remain unchanged',()=>{
 for(const file of ['src/lib/reports/export.ts','supabase/migrations/20261106121219_academic_reports.sql'])assert.equal(fs.readFileSync(file,'utf8').replaceAll('\r\n','\n'),execFileSync('git',['show','01281d3:'+file],{encoding:'utf8'}).replaceAll('\r\n','\n'))
})
