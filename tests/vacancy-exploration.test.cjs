const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const V=require('../src/lib/vacancy-exploration.ts'),id='12345678-1234-1234-1234-123456789012'
test('shareable URL round-trips search, category, UUID skill, stable order and page',()=>{
 const f={search:'Pesquisa & dados',category:'Engenharia',skill:id,skill_name:'SQL',sort:'name',page:3}
 const p=V.opportunityParams(f,id)
 assert.deepEqual(V.opportunityFilters(p),f);assert.equal(p.get('vaga'),id)
 assert.equal(p.has('access_token'),false)
})
test('untrusted URL input cannot introduce arbitrary sort, invalid UUID or unbounded page',()=>{
 assert.deepEqual(V.opportunityFilters(new URLSearchParams('sort=drop+table&skill=forged&page=-42')),{search:'',category:'',skill:'',skill_name:'',sort:'recommended',page:0})
 assert.equal(V.opportunityFilters(new URLSearchParams('page=1000000')).page,10000)
 assert.equal(V.opportunityFilters(new URLSearchParams('page=NaN')).page,0)
 assert.equal(V.opportunityFilters(new URLSearchParams('q='+('x'.repeat(121)))).search.length,120)
 assert.equal(V.opportunityParams(V.opportunityFilters(new URLSearchParams()),'https://evil.example/').size,0)
})
test('closed and filled vacancies never present a valid apply action',()=>{
 assert.equal(V.opportunityAvailable({open:true,available:1}),true)
 for(const v of [{open:false,available:3},{open:true,available:0},{open:true,available:-1}])assert.equal(V.opportunityAvailable(v),false)
 assert.equal(V.availablePositions(1),'1 posição disponível');assert.equal(V.availablePositions(2),'2 posições disponíveis')
})

test('explicit newest order round-trips independently from recommended default',()=>{
 const f=V.opportunityFilters(new URLSearchParams('sort=recent'))
 assert.equal(f.sort,'recent');assert.equal(V.opportunityParams(f).get('sort'),'recent')
 assert.equal(V.opportunityParams(V.opportunityFilters(new URLSearchParams())).has('sort'),false)
})
