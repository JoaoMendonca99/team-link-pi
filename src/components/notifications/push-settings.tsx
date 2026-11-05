'use client'
import Link from 'next/link'
import { useEffect,useRef,useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSupabaseSession } from '@/hooks/use-supabase-session'
import { getSupabaseClient } from '@/lib/supabase/client'
import { bindPush,defaults,disablePush,pushWorker } from '@/lib/push'

const labels:Record<string,string>={private:'Mensagens privadas',projects:'Mensagens de projetos',social:'Candidaturas e amizades',activities:'Atividades e revisões',deadlines:'Prazos e atrasos',preview:'Mostrar conteúdo das mensagens nas notificações',sound:'Preferir alertas sonoros, quando suportados'}
export function PushSettings({ automatic=false }:{automatic?:boolean}){
 const {user,loading}=useSupabaseSession();const uid=user?.id
 const [offer,setOffer]=useState(false),[never,setNever]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[key,setKey]=useState(''),[configured,setConfigured]=useState(false)
 const [settings,setSettings]=useState(defaults),[devices,setDevices]=useState<{id:string;label:string;updated_at:string}[]>([])
 const visit=useRef<string|null>(null)
 const ios=typeof navigator!=='undefined'&&(/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1))
 const installed=typeof window!=='undefined'&&(matchMedia('(display-mode: standalone)').matches||(navigator as Navigator & {standalone?:boolean}).standalone===true)
 const supported=typeof window!=='undefined'&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window
 async function refresh(){const {data,error}=await getSupabaseClient().rpc('manage_push_device',{p_action:'list'});if(error)throw new Error('Não foi possível carregar os dispositivos.');setDevices(data??[])}
 useEffect(()=>{
  if(loading)return
  if(!uid){visit.current=null;setOffer(false);if('serviceWorker' in navigator)void bindPush(null).catch(()=>{});return}
  let current=true
  void (async()=>{
   if(supported){const registration=await pushWorker();const sub=await registration.pushManager.getSubscription();if(sub){const own=await getSupabaseClient().rpc('manage_push_device',{p_action:'owns',p_data:{endpoint:sub.endpoint}});if(!current)return;if(!own.error&&own.data)await bindPush(uid);else{await bindPush(null);await sub.unsubscribe()}}else await bindPush(null)}
   const {data,error}=await getSupabaseClient().functions.invoke('push-delivery',{method:'GET'})
   if(!current)return
   if(!error&&data?.publicKey){setKey(data.publicKey);setConfigured(true)}
   if(!automatic){const result=await getSupabaseClient().from('push_preferences').select('settings').eq('user_id',uid).maybeSingle();if(result.error)throw new Error('Não foi possível carregar as preferências.');if(current)setSettings({...defaults,...result.data?.settings});await refresh();return}
   if(visit.current===uid)return;visit.current=uid
   if(!localStorage.getItem('push-never:'+uid)&&!sessionStorage.getItem('push-visit:'+uid)&&(supported||ios)&&data?.publicKey){sessionStorage.setItem('push-visit:'+uid,'1');setOffer(!supported||Notification.permission!=='granted'||!(await (await pushWorker()).pushManager.getSubscription()))}
  })().catch(()=>{if(current&&!automatic)setError('Não foi possível carregar a configuração de notificações.')})
  return()=>{current=false}
 },[uid,loading,automatic,supported,ios])
 async function run(action:()=>Promise<void>){setBusy(true);setError('');try{await action()}catch(err){setError(err instanceof Error?err.message:'Não foi possível configurar as notificações.')}finally{setBusy(false)}}
 async function activate(){
  if(!supported||ios&&!installed)throw new Error('No iPhone/iPad, use Compartilhar → Adicionar à Tela de Início e abra o Team Link pelo ícone instalado.')
  if(!key)throw new Error('Envio push aguardando configuração do servidor.')
  if(Notification.permission==='denied')throw new Error('Notificações bloqueadas. Autorize o Team Link nas configurações do navegador e tente novamente.')
  // Native permission is requested synchronously from this explicit click.
  const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('As notificações não foram autorizadas. Você pode continuar usando o Team Link.')
  if(!key)throw new Error('Envio push aguardando configuração do servidor.')
  await disablePush()
  const registration=await pushWorker();const binary=atob(key.replace(/-/g,'+').replace(/_/g,'/'));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))
  const sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});const json=sub.toJSON()
  const result=await getSupabaseClient().rpc('manage_push_device',{p_action:'save',p_data:{endpoint:json.endpoint,...json.keys,label:navigator.userAgent.slice(0,100)}})
  if(result.error){await sub.unsubscribe();throw new Error('Não foi possível registrar este dispositivo.')}
  await bindPush(uid!);setOffer(false);await refresh()
 }
 if(loading||!uid)return null
 if(automatic&&!offer)return null
 return <section aria-label="Notificações push" className={automatic?'fixed bottom-4 right-4 z-40 max-h-[80dvh] w-[calc(100%-2rem)] max-w-sm space-y-3 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl':'space-y-4 rounded-2xl border border-border bg-card p-4'}>
  <h2 className="text-lg font-semibold">{automatic?'Ativar notificações?':'Notificações'}</h2><p className="text-sm text-muted-foreground">Receba alertas de mensagens, candidaturas, atividades e prazos diretamente no seu computador ou celular.</p>
  {ios&&!installed&&<p className="text-sm">No Safari, use Compartilhar → Adicionar à Tela de Início. Depois, abra o Team Link pelo ícone instalado para ativar notificações.</p>}
  {!supported&&!ios&&<p className="text-sm">Este navegador não oferece suporte a Web Push.</p>}
  {!configured&&!automatic&&<p className="text-sm">O envio push aguarda a configuração das chaves VAPID e do agendador no servidor.</p>}
  {supported&&Notification.permission==='denied'&&<p className="text-sm">Permissão bloqueada. Reative nas configurações do navegador.</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy||!configured||!supported||Boolean(ios&&!installed)} onClick={()=>void run(activate)}>Ativar notificações{!automatic?' neste dispositivo':''}</Button>
  {automatic?<Button type="button" variant="outline" disabled={busy} onClick={()=>{if(never)localStorage.setItem('push-never:'+uid,'1');setOffer(false)}}>Agora não</Button>:<Button type="button" variant="outline" disabled={busy} onClick={()=>void run(async()=>{await disablePush();await refresh()})}>Desativar neste dispositivo</Button>}</div>
  {automatic?<><label className="flex gap-2 text-sm"><input type="checkbox" checked={never} onChange={e=>setNever(e.target.checked)}/>Não pedir novamente</label><Link className="text-sm text-primary underline" href="/perfil/notificacoes">Configurar notificações</Link></>:<>
   {Object.entries(labels).map(([name,label])=><label key={name} className="flex gap-2 text-sm"><input type="checkbox" checked={settings[name as keyof typeof defaults]} disabled={busy} onChange={e=>void run(async()=>{const next={...settings,[name]:e.target.checked};const {error}=await getSupabaseClient().from('push_preferences').upsert({user_id:uid,settings:next});if(error)throw new Error('Não foi possível salvar a preferência.');setSettings(next)})}/>{label}</label>)}
   <Button type="button" variant="outline" onClick={()=>{localStorage.removeItem('push-never:'+uid);sessionStorage.removeItem('push-visit:'+uid);setError('Convites reativados para a próxima visita.')}}>Reativar convites</Button>
   <h3 className="font-semibold">Dispositivos autorizados</h3>{devices.map(device=><div key={device.id} className="flex flex-wrap items-center gap-2 border-t border-border py-2"><p className="min-w-0 flex-1 break-words text-xs">{device.label}</p><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void run(async()=>{const {error}=await getSupabaseClient().rpc('manage_push_device',{p_action:'remove',p_data:{id:device.id}});if(error)throw new Error('Não foi possível remover o dispositivo.');await refresh()})}>Remover dispositivo</Button></div>)}
   <p className="text-xs text-muted-foreground">As notificações internas continuam funcionando. Som e entrega dependem do navegador e do sistema operacional.</p>
  </>}
 </section>
}
