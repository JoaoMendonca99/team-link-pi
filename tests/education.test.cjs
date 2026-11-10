const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const E=require('../src/lib/education.ts')
test('unknown legacy status and false status never imply graduation',()=>{
 assert.equal(E.educationDraft(undefined,{university:'Instituição',institution_id:null,course:null,course_id:null}).current,null)
 assert.equal(E.educationStatus(null),'Situação não informada')
 assert.equal(E.educationStatus(false),'Situação não informada')
 assert.equal(E.educationStatus(true),'Cursando atualmente')
})
test('official IDs and paired manual names survive the typed payload; client authority is discarded',()=>{
 const rows=[{...E.educationDraft(),institution:{id:'official-i',name:'Nome do catálogo'},course:{id:null,name:' Curso manual '},current:true,role:'admin',user_id:'other',origin:'legacy'}]
 assert.deepEqual(E.educationPayload(rows),[{id:rows[0].id,instituicao_id:'official-i',instituicao_manual:null,curso_id:null,curso_manual:'Curso manual',cursando_atualmente:true,duplicate_ack:false,inicio_mes:null,previsao_conclusao_mes:null,termino_mes:null,situacao_final:null}])
 assert.equal(E.educationDraft().current,false)
 assert.notEqual(E.educationDraft().id,E.educationDraft().id)
})
test('duplicate warning compares complete pairs without merging episodes or distinct official IDs',()=>{
 const a={...E.educationDraft(),institution:{id:null,name:'Instituição X'},course:{id:null,name:'  Ciência  de Dados'}}
 const b={...a,id:crypto.randomUUID(),institution:{id:null,name:'instituicao x'},course:{id:null,name:'ciencia de dados'}}
 assert.equal(E.sameEducation(a,b),true)
 assert.equal(E.sameEducation({...a,institution:{id:'one',name:'Mesmo nome'}},{...b,institution:{id:'two',name:'Mesmo nome'}}),false)
 assert.notEqual(a.id,b.id)
})
test('reviewed enrichment preserves source identities, explicit crosswalks and directed source relations',()=>{
 const rows=require('../data/concepts/enrichment-esco-v1.2.0.json'),edges=require('../data/concepts/enrichment-relations-esco-v1.2.0.json')
 assert.equal(rows.length,534);assert.equal(new Set(rows.map(r=>r.external_id)).size,534)
 assert.equal(rows.filter(r=>r.target_key).length,17)
 assert.equal(edges.length,92)
 for(const row of rows){assert.equal(row.reviewed,true);assert.match(JSON.stringify(row),/CC BY 4\.0/)}
})
