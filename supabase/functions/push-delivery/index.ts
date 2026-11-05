import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import webpush from 'npm:web-push@3.6.7'
const cors={'Access-Control-Allow-Origin':'https://team-link-pi.vercel.app','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}
Deno.serve(async request=>{
 const publicKey=Deno.env.get('VAPID_PUBLIC_KEY'),privateKey=Deno.env.get('VAPID_PRIVATE_KEY'),secret=Deno.env.get('PUSH_DISPATCH_SECRET')
 const configured=Boolean(publicKey&&privateKey&&secret)
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}})
 if(request.method==='OPTIONS')return new Response(null,{headers:cors})
 if(request.method==='GET')return reply(200,{publicKey:configured?publicKey:null,configured})
 if(request.method!=='POST')return reply(405,{error:'Método indisponível'})
 if(!configured)return reply(503,{error:'Push não configurado'})
 const provided=request.headers.get('Authorization')?.replace(/^Bearer /,'')??''
 const digest=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))
 const [expected,received]=await Promise.all([digest(secret!),digest(provided)])
 if(expected.some((value,index)=>value!==received[index]))return reply(401,{error:'Acesso negado'})
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
 try{
  webpush.setVapidDetails('https://team-link-pi.vercel.app',publicKey!,privateKey!)
  const {data,error}=await db.rpc('claim_push_batch');if(error)throw new Error('claim')
  await Promise.all((data??[]).map(async(job:{id:number;subscription:unknown;payload:unknown})=>{
   let status=503
   try{const sent=await webpush.sendNotification(job.subscription,JSON.stringify(job.payload),{TTL:120,timeout:5000});status=sent.statusCode}
   catch(error){status=Number((error as {statusCode?:number}).statusCode)||503}
   const done=await db.rpc('finish_push',{p_id:job.id,p_status:status});if(done.error)throw new Error('finish')
  }))
  return reply(200,{processed:data?.length??0})
 }catch{console.error('Push delivery failed');return reply(500,{error:'Falha no processamento'})}
})
