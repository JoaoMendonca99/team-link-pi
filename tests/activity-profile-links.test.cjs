const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const exportsLink={},helper={}
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText
vm.runInNewContext(compile('src/lib/activity-details.ts'),{exports:helper})
vm.runInNewContext(compile('src/components/activities/activity-profile-link.tsx'),{exports:exportsLink,encodeURIComponent,require:id=>id==='next/link'?{default:props=>React.createElement('a',props,props.children)}:id==='@/lib/activity-details'?helper:require(id)})
test('equal display names still open each exact user ID in a safe new tab',()=>{
 const ids=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']
 for(const id of ids){const html=renderToStaticMarkup(React.createElement(exportsLink.ActivityProfileLink,{id,name:'Same name'},'Same name'));assert(html.includes('href="/usuarios/'+id+'"'));assert(html.includes('target="_blank"'));assert(html.includes('rel="noopener noreferrer"'));assert(!html.includes('/usuarios/Same'))}
})
test('unavailable and generic users never receive fabricated profile destinations',()=>{
 for(const id of [null,undefined,'Administradores do projeto','invalid']){const html=renderToStaticMarkup(React.createElement(exportsLink.ActivityProfileLink,{id,name:'Unavailable'},'Unavailable'));assert(!html.includes('<a'));assert(html.includes('Unavailable'))}
})
