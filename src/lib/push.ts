import { getSupabaseClient } from '@/lib/supabase/client'
export const defaults={private:true,projects:true,social:true,activities:true,deadlines:true,preview:false,sound:false}
export async function pushWorker(){return navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready)}
export async function bindPush(user:string|null){
 if(!('serviceWorker' in navigator))return
 const registration=await pushWorker();const channel=new MessageChannel()
 await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Não foi possível proteger este dispositivo.')),5000);channel.port1.onmessage=()=>{clearTimeout(timer);resolve()};registration.active?.postMessage({type:'PUSH_ACCOUNT',user},[channel.port2])})
}
export async function disablePush(){
 if(!('serviceWorker' in navigator))return
 const existing=await navigator.serviceWorker.getRegistration('/')
 if(!existing)return
 const sub=await existing.pushManager?.getSubscription()
 if(!sub){await bindPush(null).catch(()=>{});return}
 await bindPush(null)
 if(!await sub.unsubscribe())throw new Error('Não foi possível cancelar a assinatura neste navegador.')
 await getSupabaseClient().rpc('manage_push_device',{p_action:'remove',p_data:{endpoint:sub.endpoint}})
}
