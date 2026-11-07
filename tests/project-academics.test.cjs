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

test('semester reference is chronological, excludes future records, and exposes ambiguity',()=>{
 const draft={...A.periodDraft(),name:'2027.1'}
 const periods=[{id:'future',name:'2028.1'},{id:'early',name:'2026.1'},{id:'prior',name:'2026.2'}]
 assert.equal(A.previousAcademicPeriod(periods,draft).period.id,'prior')
 assert.ok(!A.previousAcademicPeriod(periods,draft).candidates.some(p=>p.id==='future'))
 assert.equal(A.previousAcademicPeriod([...periods,{id:'same',name:'Mesmo semestre',academic_year:2026,academic_semester:2}],draft).period,undefined)
 assert.equal(A.previousAcademicPeriod([...periods,{id:'unknown',name:'Sem data'}],draft).ambiguous,true)
 assert.equal(A.previousAcademicPeriod(periods,{...draft,name:'2025.1'}).candidates.length,0)
 assert.equal(A.previousAcademicPeriod(periods,{...draft,name:'Semestre sem identificação'}).ambiguous,true)
})

test('keeping or editing previous information only prepares the new semester and preserves target dates',()=>{
 const defaults={institution:'Universidade atual',course:'Curso atual',city:'Cidade atual'}
 const prior={id:'old',name:'2026.2',version:4,academic_year:2026,academic_semester:2,discipline:'PI III',advisor:'Professora A',institution:'Universidade anterior',course:'Curso anterior',city:'Cidade anterior',academic_configured:true}
 const before=JSON.stringify(prior),draft={...A.periodDraft(),name:'2027.1',academic_year:'2027',academic_semester:'1'}
 const space={defaults,revision:2,periods:[prior]}
 for(const choice of ['keep','edit']){
  const next=A.keepPeriodInformation(draft,space,prior,choice),payload=A.periodPayload({...next,advisor:choice==='edit'?'Professor B':next.advisor},defaults)
  assert.equal(payload.name,'2027.1');assert.equal(payload.academic_year,'2027');assert.equal(payload.discipline,'PI III')
  assert.equal(payload.advisor,choice==='edit'?'Professor B':'Professora A');assert.equal(payload.institution,'Universidade anterior')
  assert.equal(payload.advisor_confirmed,true);assert.equal(payload.discipline_confirmed,true)
  assert.equal(payload.reference_choice,undefined);assert.equal(payload.custom_academics,undefined)
 }
 assert.equal(JSON.stringify(prior),before)
})

test('period saves derive compatibility flags from values, allow empty fields, and freeze real defaults',()=>{
 const defaults={institution:'Instituição',course:'Curso',city:'Cidade'},draft=A.periodDraft()
 const blank=A.periodPayload(draft,defaults);assert.equal(blank.discipline_confirmed,false);assert.equal(blank.advisor_confirmed,false);assert.equal(blank.institution,'Instituição')
 const filled=A.periodPayload({...draft,discipline:'Disciplina',advisor:'Professor'},defaults)
 assert.equal(A.periodPayload({...draft,custom_academics:true},defaults).institution,'Instituição')
 assert.equal(filled.discipline_confirmed,true);assert.equal(filled.advisor_confirmed,true)
 const historical=A.periodDraft({id:'old',name:'2026.1',academic_configured:true,institution:'Histórica',course:null,city:null,discipline:'PI',advisor:'A'})
 assert.equal(A.hasPeriodExceptions(historical,defaults),true)
 const saved=A.periodPayload(historical,defaults);assert.equal(saved.institution,'Histórica');assert.equal(saved.course,'');assert.equal(saved.city,'')
 assert.deepEqual(A.periodDefaultValues({...historical,custom_academics:false},defaults),defaults)
 assert.equal(historical.institution,'Histórica','changing presentation never destroys the loaded exception')
 const hidden=A.togglePeriodExceptions(historical,defaults,false),shown=A.togglePeriodExceptions(hidden,defaults,true)
 assert.equal(shown.institution,'Histórica');assert.equal(shown.course,'');assert.equal(shown.city,'')
 assert.deepEqual(A.periodDefaultValues(A.togglePeriodExceptions(A.periodDraft(),defaults,true),defaults),defaults)
})

test('continuing a historical report preserves source versions and snapshot date until metadata changes',()=>{
 const report=M.createReport('academic');report.meta.title='Título próprio';report.meta.authors='Autora B\nAutor A'
 const space={revision:3,defaults:{institution:'Instituição',course:'Curso',city:'Cidade'}},period={id:'p',version:2,name:'2026.2',academic_year:2026,discipline:'PI III',advisor:'Professor A'}
 const linked=A.applyAcademicSnapshot(report,space,period),original=JSON.stringify(linked)
 const changedSpace={...space,revision:9},changedPeriod={...period,version:8,advisor:'Professor B'}
 const continued=A.confirmAcademicValues(linked,changedSpace,changedPeriod,A.reportAcademicValues(linked))
 assert.deepEqual(continued.academic,linked.academic);assert.deepEqual(continued.meta,linked.meta)
 const edited=A.confirmAcademicValues(linked,changedSpace,changedPeriod,{...A.reportAcademicValues(linked),advisor:'Orientador personalizado'})
 assert.equal(edited.meta.advisor,'Orientador personalizado');assert.equal(edited.academic.periodVersion,2);assert.equal(edited.academic.projectRevision,3)
 assert.equal(edited.meta.title,'Título próprio');assert.equal(edited.meta.authors,'Autora B\nAutor A');assert.deepEqual(edited.sections,linked.sections)
 assert.equal(JSON.stringify(linked),original)
 const newPeriod={...changedPeriod,id:'p2'};assert.equal(A.confirmAcademicValues(edited,changedSpace,newPeriod,A.reportAcademicValues(edited)).academic.periodId,'p2')
})
