const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const exportsMap={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/activity-details.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exportsMap})
const {contextualStage,activityUuid,activitySelection}=exportsMap
test('contextual actions depend on stage semantics and mandatory review, not custom stage names',()=>{
 const task={requires_review:true}
 assert.equal(contextualStage(task,'todo').kind,'doing')
 assert.equal(contextualStage(task,'doing').kind,'review')
 assert.equal(contextualStage({...task,requires_review:false},'doing').kind,'done')
 assert.equal(contextualStage(task,'review'),null)
 assert.equal(contextualStage(task,'done'),null)
})
test('activity deep links preserve project UUID or slug for server ownership validation',()=>{
 const id='b51cbeee-0a9d-4d96-9124-aefceea4c100'
 assert.equal(activityUuid(id),true);assert.equal(activityUuid('not-a-uuid'),false)
 assert.equal(activitySelection(new URLSearchParams('projeto='+id+'&atividade='+id)).project,id)
 assert.equal(activitySelection(new URLSearchParams('projeto=team-link&atividade='+id)).slug,'team-link')
 assert.equal(activitySelection(new URLSearchParams('busca=teste')),null)
})
