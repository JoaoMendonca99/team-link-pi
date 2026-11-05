/* Push only: deliberately no fetch handler or offline cache. */
const binding = (write,value) => new Promise((resolve,reject)=>{
  const request=indexedDB.open('team-link-push',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('binding');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result;const tx=db.transaction('binding',write?'readwrite':'readonly');const store=tx.objectStore('binding');const op=write?store.put(value,'user'):store.get('user');op.onsuccess=()=>resolve(op.result);tx.oncomplete=()=>db.close();};
});
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='PUSH_ACCOUNT')event.waitUntil(binding(true,event.data.user??null).then(async()=>{if(!event.data.user)for(const n of await self.registration.getNotifications())n.close();event.ports[0]?.postMessage('ok');}));});
self.addEventListener('push',event=>event.waitUntil((async()=>{
  const data=event.data?.json();if(!data||await binding(false)!==data.user)return;
  const url=new URL(data.href,self.location.origin);if(url.origin!==self.location.origin)return;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  if(windows.some(client=>client.visibilityState==='visible'&&new URL(client.url).pathname===url.pathname&&new URL(client.url).search===url.search))return;
  await self.registration.showNotification(data.title,{body:data.body,icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.tag,silent:data.silent,data:{href:url.href}});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const url=new URL(event.notification.data?.href||'/perfil',self.location.origin);if(url.origin!==self.location.origin)return;const target=self.location.origin+'/push/open?next='+encodeURIComponent(url.pathname+url.search+url.hash);const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows){if(new URL(client.url).origin===url.origin){await client.navigate(target);await client.focus();return;}}await self.clients.openWindow(target);})());});
