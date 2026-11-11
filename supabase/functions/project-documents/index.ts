import {createClient} from 'npm:@supabase/supabase-js@2.105.4'
import {unzipSync} from 'npm:fflate@0.8.3'
import {inspectFile} from '../_shared/file-validation.ts'

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}
const reply=(status:number,body:unknown)=>Response.json(body,{status,headers:cors})
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const admin=()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}})
async function boundedBody(request:Request,limit=51*1024*1024){
 const reader=request.body?.getReader();if(!reader)throw Error('Envio vazio.')
 const parts:Uint8Array[]=[];let size=0
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error(limit<10000?'Solicitação inválida.':'O envio excede 50 MB de arquivos.')}parts.push(value)}
 return new Blob(parts)
}
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{headers:cors})
 if(request.method!=='POST')return reply(405,{error:'Método inválido.'})
 const service=admin()
 try{
  // Maintenance has no caller-controlled IDs, paths or SQL. It only claims old, uncommitted batches.
  if(request.headers.get('content-type')?.startsWith('application/json')){
   if(Number(request.headers.get('content-length')||0)>2048)return reply(413,{error:'Solicitação inválida.'})
   const text=await(await boundedBody(request,2048)).text()
   const args=JSON.parse(text)
   if(args.action==='cleanup'){
    const {data,error}=await service.rpc('claim_document_upload_cleanup');if(error)throw error
    for(const batch of data??[]){const removed=await service.storage.from(batch.bucket).remove(batch.paths);if(removed.error){console.error('project-documents.cleanup',{code:removed.error.statusCode});continue}const done=await service.rpc('finish_document_upload_cleanup',{p_id:batch.id});if(done.error)throw done.error}
    return reply(200,{ok:true})
   }
   const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
   if(!token)return reply(401,{error:'Entre na sua conta.'})
   const {data:{user},error}=await service.auth.getUser(token);if(error||!user)return reply(401,{error:'Sessão inválida.'})
   const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}})

   if(args.action==='delete'&&args.scope==='project'){
    if(!id.test(args.id??''))return reply(400,{error:'Arquivo indisponível.'})
    const res=await client.rpc('delete_project_file',{p_file_id:args.id})
    if(res.error)return reply(403,{error:res.error.message||'Exclusão não autorizada.'})
    if(res.data?.path){await service.storage.from('project-files').remove([res.data.path])}
    return reply(200,{ok:true})
   }

   if(args.action!=='download'||!id.test(args.id??'')||!['activity','reference','project'].includes(args.scope))return reply(400,{error:'Arquivo indisponível.'})
   let path:string|undefined,filename:string|undefined,bucketName:string
   if(args.scope==='project'){
    const found=await client.from('project_files').select('path,filename').eq('id',args.id).single()
    if(found.error||!found.data||!found.data.path)return reply(404,{error:'Arquivo indisponível.'})
    path=found.data.path;filename=found.data.filename;bucketName='project-files'
   }else{
    const table=args.scope==='activity'?'activity_comment_attachments':'reference_documents'
    const found=await client.from(table).select('*').eq('id',args.id).single()
    if(found.error||!found.data||!found.data.path)return reply(404,{error:'Arquivo indisponível.'})
    path=found.data.path;filename=found.data.filename;bucketName=args.scope==='activity'?'activity-evidence':'academic-references'
   }
   const signed=await service.storage.from(bucketName).createSignedUrl(path,60,{download:filename})
   if(signed.error)throw signed.error
   return reply(200,{url:signed.data.signedUrl})
  }
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
  if(!token)return reply(401,{error:'Entre na sua conta.'})
  const {data:{user},error}=await service.auth.getUser(token);if(error||!user)return reply(401,{error:'Sessão inválida.'})
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))return reply(400,{error:'Formato de envio inválido.'})
  const blob=await boundedBody(request),form=await new Response(blob,{headers:{'Content-Type':request.headers.get('content-type')!}}).formData()
  const scope=String(form.get('scope')??''),client=String(form.get('client_id')??''),target=String(form.get('task_id')??''),body=String(form.get('body')??'').trim(),parent=String(form.get('reply_to')??'')
  const files=form.getAll('files')

  if(scope==='project'){
   const projectId=String(form.get('project_id')??'')
   const replaceId=form.get('replace_id')?String(form.get('replace_id')):null
   const customName=String(form.get('name')??'').trim()
   if(!id.test(projectId)||(replaceId&&!id.test(replaceId)))return reply(400,{error:'Projeto ou arquivo inválido.'})
   if(!files.length||files.length>1||!(files[0] instanceof File))return reply(400,{error:'Envie um único arquivo PDF ou DOCX.'})
   const file=files[0] as File
   const inspected=await inspectFile(file,true,unzipSync)

   const userClient=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}})
   const storagePath=`${projectId}/${crypto.randomUUID()}_${inspected.info.name}`
   const bucket=service.storage.from('project-files')
   const uploadRes=await bucket.upload(storagePath,inspected.bytes,{contentType:inspected.info.mime,upsert:false,cacheControl:'60'})
   if(uploadRes.error)throw uploadRes.error

   const saveRes=await userClient.rpc('save_project_file',{
    p_project_id:projectId,
    p_name:customName||inspected.info.name,
    p_filename:inspected.info.name,
    p_path:storagePath,
    p_mime:inspected.info.mime,
    p_size:inspected.info.size,
    p_sha256:inspected.info.sha256,
    p_replace_id:replaceId||null
   })

   if(saveRes.error){
    await bucket.remove([storagePath])
    return reply(403,{error:saveRes.error.message||'Envio não autorizado.'})
   }

   if(saveRes.data?.old_path){
    await bucket.remove([saveRes.data.old_path])
   }

   return reply(200,{ok:true,file:saveRes.data?.file})
  }

  if(!['activity','reference'].includes(scope)||!id.test(client)||scope==='activity'&&!id.test(target)||parent&&!id.test(parent)||body.length>4000||!files.length||files.length>(scope==='reference'?1:5)||files.some(f=>!(f instanceof File)))return reply(400,{error:'Envie até cinco arquivos válidos por mensagem.'})
  const inspected=[]
  for(const file of files)inspected.push(await inspectFile(file as File,scope==='reference',unzipSync))
  let metadata:Record<string,unknown>={}
  try{
   const text=String(form.get('metadata')??'{}');if(text.length>6000)throw Error('metadata limit')
   const raw=JSON.parse(text);if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('metadata shape')
   if(scope==='reference')metadata={name:String(raw.name??'').slice(0,180),description:String(raw.description??'').slice(0,2000),document_type:String(raw.document_type??'Orientações').slice(0,100),institution:String(raw.institution??'').slice(0,300),version:String(raw.version??'1').slice(0,80),distribution_authorized:raw.distribution_authorized===true}
  }catch{return reply(400,{error:'Informações do documento inválidas.'})}
  const begin=await service.rpc('begin_document_upload',{p_actor:user.id,p_scope:scope,p_target:scope==='activity'?target:null,p_client:client,p_body:body,p_reply:parent||null,p_files:inspected.map(f=>f.info),p_metadata:metadata,p_historical:form.get('historical_edit')==='true'})
  if(begin.error){console.error('project-documents.begin',{code:begin.error.code});return reply(403,{error:'Envio não autorizado, projeto em somente leitura ou tentativa expirada.'})}
  if(begin.data.state==='ready')return reply(200,{id:begin.data.result})
  const bucket=service.storage.from(scope==='activity'?'activity-evidence':'academic-references')
  for(let index=0;index<inspected.length;index++){
   const item=inspected[index],path=user.id+'/'+begin.data.id+'/'+index
   const result=await bucket.upload(path,item.bytes,{contentType:item.info.mime,upsert:false,cacheControl:'60'})
   if(result.error&&String(result.error.statusCode)!=='409')throw result.error
  }
  const completed=await service.rpc('complete_document_upload',{p_actor:user.id,p_client:client})
  if(completed.error)throw completed.error
  return reply(200,{id:completed.data})
 }catch(error){
  // No filenames, contents, tokens, raw requests or signed URLs in logs.
  console.error('project-documents.failed',{code:typeof error==='object'&&error&&'code'in error?String(error.code):'validation_or_storage'})
  const safe=error instanceof Error&&/^(Cada arquivo|Envie TXT|O arquivo não é|Formato inválido|PDF com|DOCX|A biblioteca aceita|O envio excede)/.test(error.message)
  return reply(safe?400:500,{error:safe?error.message:'Não foi possível concluir o envio. Seus arquivos e texto foram preservados para tentar novamente.'})
 }
})