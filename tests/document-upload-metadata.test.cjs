const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),fflate=require('fflate')
function handler(){
 let serve,metadata
 const globals={Error,TextDecoder,TextEncoder,Uint8Array,DataView,File,Blob,Request,Response,FormData,crypto,console:{error(){}}},shared={}
 const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 vm.runInNewContext(compile('supabase/functions/_shared/file-validation.ts'),{...globals,exports:shared})
 const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}},error:null})},rpc:async(name,args)=>{assert.equal(name,'begin_document_upload');metadata=args.p_metadata;return {data:{state:'ready',result:'done'},error:null}}})
 vm.runInNewContext(compile('supabase/functions/project-documents/index.ts'),{...globals,exports:{},require:id=>id.includes('supabase-js')?{createClient}:id.includes('fflate')?fflate:shared,Deno:{env:{get:()=>''},serve:fn=>{serve=fn}}})
 return {call:async meta=>{const form=new FormData();form.set('scope','reference');form.set('client_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');form.set('metadata',meta);form.append('files',new File(['%PDF-1.7\n%%EOF'],'reference.pdf',{type:'application/pdf'}));return serve(new Request('http://localhost',{method:'POST',headers:{Authorization:'Bearer synthetic'},body:form}))},metadata:()=>metadata}
}
test('reference metadata is bounded and unknown fields never reach the database',async()=>{
 const edge=handler()
 assert.equal((await edge.call('x'.repeat(6001))).status,400)
 assert.equal((await edge.call('[]')).status,400)
 assert.equal((await edge.call(JSON.stringify({name:'Reference',description:'Registered instructions',distribution_authorized:true,untrusted_payload:'must not be stored'}))).status,200)
 assert.equal(edge.metadata().name,'Reference');assert.equal(edge.metadata().distribution_authorized,true);assert.equal('untrusted_payload' in edge.metadata(),false)
})
