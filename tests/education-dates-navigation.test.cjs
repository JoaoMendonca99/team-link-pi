const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const E=require('../src/lib/education.ts'),N=require('../src/lib/workspace-navigation.ts')
test('month precision, valid dates, chronology and outdated forecasts',()=>{
 assert.equal(E.parseEducationMonth('02/2025'),'2025-02');assert.equal(E.parseEducationMonth(''),null)
 for(const value of ['13/2025','00/2025','02/0000','02/25','2025-02-17'])assert.throws(()=>E.parseEducationMonth(value))
 const d={...E.educationDraft(),current:true,start:'02/2020',forecast:'12/2021'}
 assert.equal(E.educationValidation(d),'');assert.ok(E.educationValidation({...d,forecast:'01/2019'}));assert.ok(E.educationValidation({...d,end:'01/2019'}))
})
test('changing status retains forecast and real ending independently and requires a declaration',()=>{
 const original={...E.educationDraft(),current:true,start:'02/2020',forecast:'12/2029',end:'06/2023',ending:'interrompido'}
 const changed=E.changeCurrentEducation(original,false)
 assert.equal(changed.forecast,'12/2029');assert.equal(changed.end,'06/2023');assert.ok(E.educationValidation(changed))
 assert.equal(E.educationValidation({...changed,ending:'concluido'}),'')
 assert.equal(E.educationStatus(false,'concluido'),'Concluído');assert.equal(E.educationStatus(false,'interrompido'),'Interrompido/Trancado')
 assert.equal(E.educationStatus(null),'Situação não informada')
 assert.equal(E.educationDateLabel({cursando_atualmente:true,inicio_mes:'2025-02-01',previsao_conclusao_mes:'2029-12-01'}),'02/2025 — Previsão: 12/2029')
 assert.equal(E.educationDateLabel({cursando_atualmente:null}),'')
})
test('only workspace, real panel descendants and editing routes use the internal shell',()=>{
 for(const path of ['/meu-espaco','/meu-espaco/vagas','/projetos/site-team-link/painel','/projetos/teste/painel/atividades','/projetos/teste/editar'])assert.equal(N.isInternalWorkspace(path),true,path)
 for(const path of ['/','/explorar','/projetos/teste','/projetos/teste/painel-falso','/meu-espacofalso','/projetos/teste/editar/qualquer'])assert.equal(N.isInternalWorkspace(path),false,path)
 assert.equal(N.internalProject('/projetos/projeto%20teste/painel/relatorios').reference,'projeto teste')
 assert.notEqual(N.sidebarPreferenceKey('one'),N.sidebarPreferenceKey('two'))
})
