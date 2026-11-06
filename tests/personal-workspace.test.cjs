const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),Module=require('node:module'),ts=require('typescript'),vm=require('node:vm')
Module._extensions['.ts']=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const T=require('../src/lib/theme.ts'),A=require('../src/lib/auth/redirect.ts'),S=require('../src/lib/my-space.ts')
test('first paint defaults dark for either OS preference, with unavailable or invalid storage',()=>{
 for(const os of [false,true])for(const saved of [null,'system','invalid','dark','light'])for(const blocked of [false,true]){
  let dark=false,reads=0;const document={documentElement:{classList:{toggle:(name,value)=>{assert.equal(name,'dark');dark=value}},style:{}}}
  vm.runInNewContext(T.themeInitScript,{document,localStorage:{getItem:()=>{if(blocked)throw Error('blocked');return saved}},matchMedia:()=>{reads++;return {matches:os}}})
  assert.equal(reads,0);assert.equal(dark,blocked||saved!=='light');assert.equal(document.documentElement.style.colorScheme,dark?'dark':'light')
 }
 const layout=fs.readFileSync('src/app/layout.tsx','utf8');assert.match(layout,/className="dark"/);assert.ok(layout.indexOf('__html:themeInitScript')<layout.indexOf('<body'))
})
test('login default, specific destinations, and external/control/recursive redirects',()=>{
 for(const value of [null,'','https://evil.test','//evil.test','/\\evil.test','/x\ny','/%2F%2Fevil.test','/%5cevil.test','/%0afoo','/login','/login/?next=/perfil','/a/../login','/%6cogin'])assert.equal(A.getSafeRedirectPath(value),'/meu-espaco')
 for(const value of ['/meu-espaco','/projetos/teste/painel/atividades?atividade=1','/mensagens?projeto=1','/perfil?aba=candidaturas','/explorar?q=Team%20Link'])assert.equal(A.getSafeRedirectPath(value),value)
})
test('hub uses existing deep links, including multi-vacancy application details and project tools',()=>{
 assert.equal(S.taskHref({id:'task1',slug:'team-link',period_id:'period1'}),'/projetos/team-link/painel/atividades?atividade=task1&periodo=period1')
 assert.equal(S.applicationHref('request1'),'/perfil?aba=candidaturas&candidatura=request1')
 assert.equal(S.toolHref('team-link','support'),'/projetos/team-link/painel?ferramenta=support')
 assert.equal(S.toolHref('team-link','reports'),'/projetos/team-link/painel/relatorios')
})
