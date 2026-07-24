const C='kitchen-os-item-id-v300b1';
const A=['./','./index.html','./weekly.html','./daily.html','./import.html','./item-id-fix.js','./manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(C).then(cache=>cache.addAll(A)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==C).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function shouldInject(request){
  if(request.method!=='GET')return false;
  const url=new URL(request.url);
  return url.origin===self.location.origin && (url.pathname.endsWith('/import.html') || url.pathname.endsWith('/daily.html'));
}

async function injectItemIdScript(response){
  const text=await response.text();
  if(text.includes('item-id-fix.js'))return new Response(text,response);
  const injected=text.replace('</body>','<script src="./item-id-fix.js?v=300b1"></script></body>');
  const headers=new Headers(response.headers);
  headers.delete('content-length');
  return new Response(injected,{status:response.status,statusText:response.statusText,headers});
}

self.addEventListener('fetch',event=>{
  event.respondWith((async()=>{
    try{
      const network=await fetch(event.request);
      const response=shouldInject(event.request)?await injectItemIdScript(network.clone()):network.clone();
      if(event.request.method==='GET'){
        const cache=await caches.open(C);
        cache.put(event.request,response.clone());
      }
      return response;
    }catch(error){
      const cached=await caches.match(event.request);
      if(!cached)throw error;
      return shouldInject(event.request)?injectItemIdScript(cached.clone()):cached;
    }
  })());
});
