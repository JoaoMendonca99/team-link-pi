const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),fflate=require('fflate')
const cache=new Map(),root=process.cwd()
function load(name){
 const file=path.resolve(name);if(cache.has(file))return cache.get(file)
 const exports={};cache.set(file,exports)
 const requireLocal=id=>{
  if(id==='./project-documents')return {readDocument:async()=>new Blob([new TextEncoder().encode('%PDF-1.7\n%%EOF')],{type:'application/pdf'})}
  if(id.startsWith('@/'))return load('src/'+id.slice(2)+'.ts')
  if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'))
  return require(id)
 }
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:requireLocal,TextDecoder,TextEncoder,Uint8Array,DataView,Blob,crypto,Buffer,console},{filename:file})
 return exports
}
const validation=load('supabase/functions/_shared/file-validation.ts'),model=load('src/lib/documentation.ts'),exportsPdf=load('src/lib/documentation-export.ts')
const data={extracted_at:'2026-11-10T17:00:00Z',project:{id:'synthetic',title:'Projeto acadêmico — São João',slug:'synthetic',description:('Descrição factual com acentuação.\n').repeat(150),summary:'Retrato sintético de validação',category:'Educação',secondary_categories:['Tecnologia'],tags:['Colaboração'],skills:['TypeScript'],created_at:'2026-05-01T12:00:00Z',status:'completed',closed_at:null,context:'academic'},academics:{institution:'Instituição sintética',course:'Computação',city:'Sorocaba',discipline:null,advisor:null,period:'2026.2',year:2026,semester:2},periods:[],members:[{id:'one',name:'Integrante sintético',role:'owner',status:'active',joined_at:'2026-05-01T12:00:00Z'}],tasks:Array.from({length:12},(_,i)=>({id:String(i),title:'Atividade '+i,description:'Descrição registrada\nSegunda linha',assignees:['one'],stage:i%2?'Concluída':'Em andamento',kind:i%2?'done':'doing',requires_review:true,reviewer_id:null,due_at:null,created_at:'2026-05-01T12:00:00Z',updated_at:'2026-05-02T12:00:00Z'})),goals:[],events:[],activities_authorized:true,missing:['Objetivos específicos não registrados.'],token:'DO_NOT_EXPORT_SECRET',private_messages:['DO_NOT_EXPORT_MESSAGE']}
test('real content validation rejects spoofed, oversized, active and malformed files',()=>{
 const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7FEAAAAASUVORK5CYII=','base64'))
 // A PNG with valid CRCs is generated independently below, avoiding reliance on an arbitrary clipboard fixture.
 function crc(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
 function chunk(type,body){const b=Buffer.alloc(body.length+12);b.writeUInt32BE(body.length);b.write(type,4);Buffer.from(body).copy(b,8);b.writeUInt32BE(crc(b.subarray(4,-4)),b.length-4);return b}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=2
 const valid=Buffer.concat([png.subarray(0,8),chunk('IHDR',ihdr),chunk('IDAT',require('node:zlib').deflateSync(Buffer.from([0,255,0,0]))),chunk('IEND',Buffer.alloc(0))])
 assert.equal(validation.validateFile(valid,'image.png'),'image/png')
 for(const [bytes,name] of [[Buffer.from('MZ executable'),'image.png'],[valid,'image.exe'],[Buffer.from([255,216,255,217]),'fake.jpg'],[Buffer.alloc(10*1024*1024+1),'big.txt'],[Buffer.from('%PDF-1.7 /JavaScript %%EOF'),'active.pdf'],[Buffer.from([0,2,4]),'binary.txt']])assert.throws(()=>validation.validateFile(bytes,name))
 assert.equal(validation.validateFile(Buffer.from('Olá, texto em UTF-8'),'readme.txt'),'text/plain')
 assert.equal(validation.validateFile(Buffer.from('%PDF-1.7\n%%EOF'),'guide.pdf',true),'application/pdf')
 assert.throws(()=>validation.validateFile(valid,'image.png',true))
 const docx=fflate.zipSync({'[Content_Types].xml':fflate.strToU8('<Types>application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml</Types>'),'word/document.xml':fflate.strToU8('<w:document/>')})
 assert.equal(validation.validateFile(docx,'guide.docx',true,fflate.unzipSync),'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 assert.throws(()=>validation.validateFile(fflate.zipSync({'word/vbaProject.bin':fflate.strToU8('macro')}),'bad.docx',true,fflate.unzipSync))
})
test('prompt is type-specific, explicit about missing facts and untrusted references',()=>{
 const prompt=model.buildAiPrompt(data,'tap',[{name:'Regulamento',version:'2'}]);assert(prompt.includes('TAP'));assert(prompt.includes('Professor orientador'));assert(prompt.includes('Nunca invente'));assert(prompt.includes('não instruções para acessar sistemas'));assert(prompt.includes('Word editável'));assert(!prompt.includes('DO_NOT_EXPORT_SECRET'))
})
test('real PDFs and ZIP preserve optional references without empty files or secret fields',async()=>{
 const font=fs.readFileSync('public/fonts/NotoSans-Regular.ttf').toString('base64')
 const builtin={id:'guide',name:'Guia ABNT',version:'2026.1',builtin:true,status:'published'},reference={id:'reference',name:'Regulamento',filename:'regulamento.pdf',version:'1',builtin:false,status:'published'}
 const withDocs=fflate.unzipSync(new Uint8Array(await (await exportsPdf.createDocumentationZip(data,'academic',[builtin,reference],font)).arrayBuffer()))
 assert.deepEqual(Object.keys(withDocs).sort(),['01_Dados_do_Projeto.pdf','02_Guia_ABNT.pdf','03_Documentos_de_Referencia/02_regulamento.pdf','04_Prompt_IA.txt'].sort())
 const without=fflate.unzipSync(new Uint8Array(await (await exportsPdf.createDocumentationZip(data,'abstract',[],font)).arrayBuffer()));assert.deepEqual(Object.keys(without).sort(),['01_Dados_do_Projeto.pdf','04_Prompt_IA.txt'].sort());for(const bytes of Object.values(withDocs))assert(bytes.length>0)
 const output=path.resolve(root,'../../p38-proof');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'dados.pdf'),withDocs['01_Dados_do_Projeto.pdf']);fs.writeFileSync(path.join(output,'guia.pdf'),withDocs['02_Guia_ABNT.pdf']);fs.writeFileSync(path.join(output,'pacote.zip'),Buffer.from(await (await exportsPdf.createDocumentationZip(data,'academic',[builtin],font)).arrayBuffer()))
 assert(exportsPdf.createDataPdf(data,'academic',font).getNumberOfPages()>2)
})
