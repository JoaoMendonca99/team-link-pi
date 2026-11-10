const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const exported={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/device-label.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exported})
const {deviceLabel}=exported

test('device names distinguish Edge, Chrome, Firefox and Safari without showing technical noise',()=>{
 for(const [agent,name] of [
  ['Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537 Edg/130','Microsoft Edge · Windows'],
  ['Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537','Chrome · Android'],
  ['Mozilla/5.0 (X11; Linux x86_64) Firefox/132','Firefox · Linux'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 18 like Mac OS X) Version/18 Mobile Safari/604','Safari · iOS / iPadOS'],
 ])assert.equal(deviceLabel(agent),name)
})
test('truncated stored agents never invent a browser that is no longer identifiable',()=>{
 assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)'),'Navegador · Windows')
 assert.equal(deviceLabel('Mozilla/5.0'),'Navegador')
})
test('custom device names and blank legacy labels remain useful',()=>{
 assert.equal(deviceLabel('Notebook pessoal'),'Notebook pessoal')
 assert.equal(deviceLabel(''),'Navegador')
})
