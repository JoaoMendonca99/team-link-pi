const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const F=require('../src/lib/projects/form.ts')
const example=()=>({...F.emptyProjectWizard(),context:'general',title:'Projeto de teste',slug:'projeto-de-teste',summary:'Resumo',description:'Descrição',category:'Engenharia',tags:['pesquisa']})

test('academic has seven stages, general has five, and validation only covers the active stage',()=>{
 assert.deepEqual(F.projectSteps('academic'),['type','presentation','classification','academics','period','team','review'])
 assert.deepEqual(F.projectSteps('general'),['type','presentation','classification','team','review'])
 const blank=F.emptyProjectWizard();assert.ok(F.projectStepErrors('type',blank)['project-context'])
 assert.deepEqual(F.projectStepErrors('type',{...blank,context:'general'}),{})
 const v=example();assert.deepEqual(F.projectStepErrors('presentation',{...v,category:'',tags:[]}),{})
 assert.ok(F.projectStepErrors('classification',{...v,category:'',tags:[]})['project-category'])
 for(const slug of ['', '-abc','Abc','abc--def','abc/def'])assert.ok(F.projectStepErrors('presentation',{...v,slug})['project-slug'])
})
test('automatic slug and semester suggestions respect user customizations',()=>{
 let v=F.changeProjectTitle(F.emptyProjectWizard(),'Pesquisa & Educação');assert.equal(v.slug,'pesquisa-educacao')
 v=F.changeProjectTitle({...v,slug:'endereco-proprio',slugEdited:true},'Outro título');assert.equal(v.slug,'endereco-proprio')
 let p=F.changeFirstPeriod(v.period,{academic_year:'2027',academic_semester:'1'});assert.equal(p.name,'2027.1')
 p=F.changeFirstPeriod(p,{academic_semester:'2'});assert.equal(p.name,'2027.2')
 p=F.changeFirstPeriod({...p,name:'Pesquisa anual'},{academic_year:'2028'});assert.equal(p.name,'Pesquisa anual')
})
test('optional academic fields stay empty; dates, semester and category limits reject invalid input',()=>{
 const v={...example(),context:'academic'};assert.deepEqual(F.projectStepErrors('period',v),{})
 assert.ok(F.projectStepErrors('period',{...v,period:{...v.period,academic_year:'1800'}})['period-year'])
 assert.ok(F.projectStepErrors('period',{...v,period:{...v.period,starts_on:'2027-02-29'}})['period-start'])
 assert.ok(F.projectStepErrors('period',{...v,period:{...v.period,starts_on:'2027-09-01',ends_on:'2027-02-01'}})['period-end'])
 for(const secondary of [['Engenharia'],['Robótica','Robótica'],['Robótica','Educação e inclusão','Sustentabilidade']])assert.ok(F.projectStepErrors('classification',{...v,secondary})['project-secondary'])
})
test('context switches preserve drafts but general payloads contain no academic data',()=>{
 const v={...example(),context:'academic',defaults:{institution:'Instituição',course:'Curso',city:'Cidade'},period:{...example().period,name:'2027.1',discipline:'Pesquisa',advisor:'Orientadora'}}
 const before=JSON.stringify(v),general={...v,context:'general'},payload=F.projectWizardPayload(general)
 assert.equal(JSON.stringify(v),before);assert.deepEqual(general.period,v.period)
 assert.deepEqual(payload.p_academic,{context:'general',defaults:{institution:'',course:'',city:''}})
 const academic=F.projectWizardPayload(v).p_academic
 assert.equal(academic.period.discipline_confirmed,true);assert.equal(academic.period.advisor_confirmed,true)
 const blank=F.projectWizardPayload({...v,period:example().period}).p_academic
 assert.equal(blank.period.discipline,'');assert.equal(blank.period.advisor,'');assert.equal(blank.period.advisor_confirmed,false)
})
test('vacancies can be deferred without destroying their data and creation never accepts existing IDs',()=>{
 const v={...example(),vacancies:[{key:'draft',id:'foreign-id',title:'Pesquisa',description:'Descrição',skills:['Pesquisa'],positions:'2',occupied:7,open:true,changed:false}]}
 assert.equal(F.projectWizardPayload(v).p_form.p_vacancies[0].id,null)
 assert.equal(F.projectWizardPayload(v).p_form.p_vacancies[0].positions,2)
 assert.equal(F.projectWizardPayload({...v,deferVacancies:true}).p_form.p_vacancies.length,0)
 assert.equal(v.vacancies.length,1);assert.ok(F.projectStepErrors('team',{...v,vacancies:[{...v.vacancies[0],positions:'0'}]})['draft-positions'])
 assert.deepEqual(F.projectStepErrors('team',{...v,deferVacancies:true}),{})
 const edited=F.projectFormPayload({...v,vacancies:[{...v.vacancies[0],changed:true}]},'own-project')
 assert.equal(edited.p_project_id,'own-project');assert.equal(edited.p_vacancies[0].id,'foreign-id','editor IDs are retained for server authorization checks')
})
test('local draft restores only allowed fields, rejects corruption and cannot restore server identities',()=>{
 const v=example();v.defaults.institution='Instituição';v.vacancies=[{key:'old',id:'foreign',occupied:10,title:'Pesquisa',positions:'2',description:'',skills:[],open:true,changed:false}]
 const restored=F.restoreProjectWizard(JSON.stringify({version:1,values:{...v,owner_id:'another-user',role:'owner'},step:'review'}))
 assert.equal(restored.title,v.title);assert.equal(restored.defaults.institution,'Instituição');assert.equal(restored.vacancies[0].id,null);assert.equal(restored.vacancies[0].occupied,0)
 assert.equal(restored.owner_id,undefined);assert.equal(restored.role,undefined);assert.equal(F.restoreProjectWizard('{broken'),null);assert.equal(F.restoreProjectWizard('{"version":2,"values":{}}'),null)
})

test('institution references survive academic drafts without leaking into professional projects or period snapshots',()=>{
 const id='1abcde12-1234-4321-8abc-123456789012',v={...example(),context:'academic',defaults:{institution:'Universidade',institution_id:id,course:'',city:''}}
 const restored=F.restoreProjectWizard(JSON.stringify({version:1,values:v}))
 assert.equal(restored.defaults.institution_id,id)
 const academic=F.projectWizardPayload(restored).p_academic
 assert.equal(academic.defaults.institution_id,id);assert.equal(academic.period.institution_id,undefined)
 assert.equal(F.projectWizardPayload({...restored,context:'general'}).p_academic.defaults.institution_id,undefined)
 assert.equal(F.restoreProjectWizard(JSON.stringify({version:1,values:{...v,defaults:{...v.defaults,institution_id:'not-a-valid-id'}}})).defaults.institution_id,undefined)
})
