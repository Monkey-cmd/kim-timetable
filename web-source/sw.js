const CACHE='kim-timetable-v9';
const FILES=['./','./index.html','./style.css','./app.js','./core.js','./memos.js','./course-selection.js','./appearance.js','./pdf-import.js','./icon-32.png?v=9','./icon-180.png?v=9','./icon-192.png?v=9','./icon-512.png?v=9','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith('kim-timetable-')||k.startsWith('shu-timetable-'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin) return;
  // Only cache known app assets: never intercept school login or other origins.
  const url=new URL(event.request.url);
  const isApp=FILES.some(f=>new URL(f,self.registration.scope).pathname===url.pathname);
  if(!isApp)return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok&&!response.redirected){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
