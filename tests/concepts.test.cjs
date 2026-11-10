const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const C=require('../src/lib/concepts.ts'),F=require('../src/lib/projects/form.ts')
test('draft choices keep UUID and domain, but never gain authority from stored status',()=>{
 const id='11111111-2222-3333-4444-555555555555'
 const choices=C.restoreConcepts([{id,label:'React',status:'validado',domain:'Tecnologia'},{id:null,label:'Novo',proposal:true,domain:'Saúde',role:'admin'}],[],10)
 assert.equal(choices[0].id,id);assert.equal(choices[1].proposal,true);assert.equal(choices[1].domain,'Saúde');assert.equal(choices[1].role,undefined)
 assert.deepEqual(C.legacyConcepts(['IA']),[{id:null,label:'IA',raw:'IA',status:'pendente'}])
 assert.deepEqual(C.restoreConcepts([null,{}, {label:' '},{label:'x'.repeat(121)}],[],10),[])
})
test('catalog selections and proposal drafts survive wizard restore and reach the correct typed payload',()=>{
 const concept={id:'11111111-2222-3333-4444-555555555555',label:'React',domain:'Tecnologia',status:'validado'}
 const v={...F.emptyProjectWizard(),context:'general',tags:['stale'],tagConcepts:[concept],vacancies:[null,{key:'a',id:'forged-vacancy-id',title:'Pesquisa',skills:['stale'],skillConcepts:[{id:null,label:'Conceito novo',domain:'Ciências',proposal:true}],positions:'2',open:true}]}
 const restored=F.restoreProjectWizard(JSON.stringify({version:1,values:v}))
 assert.deepEqual(restored.tags,['React']);assert.deepEqual(restored.vacancies[0].skills,['Conceito novo']);assert.equal(restored.vacancies[0].id,null)
 const payload=F.projectWizardPayload(restored).p_form
 assert.equal(payload.p_tag_choices[0].id,concept.id);assert.equal(payload.p_vacancies[0].concept_refs[0].proposal,true)
 assert.deepEqual(payload.p_tags,['React']);assert.deepEqual(payload.p_vacancies[0].skills,['Conceito novo'])
})
test('seed keys are unique; reviewed identities, provisional compounds and related concepts remain distinct',()=>{
 const rows=require('../data/concepts/seed.json'),relations=require('../data/concepts/relations.json')
 assert.equal(rows.length,99);assert.equal(new Set(rows.map(r=>r.key)).size,99)
 assert.equal(rows.filter(r=>r.status==='validado').length,90);assert.equal(rows.filter(r=>r.status==='provisorio').length,9)
 const find=n=>rows.find(r=>r.name===n)
 for(const [a,b] of [['Java','JavaScript'],['React','React Native'],['Experiência do Usuário','Interface do Usuário'],['Inteligência Artificial','Aprendizado de Máquina'],['C','C++'],['C++','C#']])assert.notEqual(find(a).key,find(b).key)
 assert.equal(find('JavaScript').aliases.find(a=>a.name==='JS').confirm,false)
 assert.equal(find('Inteligência Artificial').aliases.find(a=>a.name==='IA').confirm,true)
 assert.equal(find('UX/UI').status,'provisorio');assert.equal(relations.length,3)
})
