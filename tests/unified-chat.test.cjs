const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const output={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/chat/unified.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:output})
test('unified project search matches normalized project and authorized group titles',()=>{
 const projects=[{id:'a',title:'Pesquisa',searchTerms:['Revisão de protótipos']},{id:'b',title:'Saúde',searchTerms:['Geral']}]
 assert.equal(output.matchingChatProjects(projects,'REVISAO')[0].id,'a')
 assert.equal(output.matchingChatProjects(projects,'saude')[0].id,'b')
 assert.equal(output.matchingChatProjects(projects,'inexistente').length,0)
})
test('project conversations stay ordered by recent messages with stable empty-date ties',()=>{
 const projects=[{id:'old',title:'Antigo',lastMessageAt:'2026-01-01'},{id:'empty-b',title:'Beta'},{id:'new',title:'Recente',lastMessageAt:'2026-11-01'},{id:'empty-a',title:'Alfa'}]
 assert.equal(output.matchingChatProjects(projects,'').map(p=>p.id).join(','),'new,old,empty-a,empty-b')
 assert.equal(projects[0].id,'old')
})
