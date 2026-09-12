const CACHE='tg-voca-v5';
const ASSETS=['./styles.css','./app.js','./manifest.webmanifest','./assets/tg-logo.svg'];
self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  const alwaysFresh=event.request.mode==='navigate'||url.pathname.endsWith('/config.js');
  if(alwaysFresh){
    event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(event.request.method==='GET'&&response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
    return response;
  })));
});
