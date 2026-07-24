const CACHE_NAME = 'kitchen-os-v311-delivery-site-seq-fix';

const ASSETS = [
  './',
  './index.html',
  './weekly.html',
  './daily.html',
  './import.html',
  './item-master.js',
  './item_master.json',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isKitchenPage(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin &&
    (
      url.pathname.endsWith('/daily.html') ||
      url.pathname.endsWith('/import.html')
    );
}

function injectMasterScript(html) {
  if (html.includes('item-master.js')) return html;
  return html.replace(
    '</head>',
    '<script src="./item-master.js?v=311" defer></script></head>'
  );
}

function patchDailyDelivery(html) {
  if (!html.includes('function applyDelivery(x)')) return html;

  const replacement = `function applyDelivery(x){
    if(!x)return;
    const fixed=window.KOSItemMaster
      ?window.KOSItemMaster.buildDeliveryIdMaps(x)
      :x;
    importedCentral=fixed;
    localStorage.setItem('kos-import-central-current',JSON.stringify(fixed));
    Object.values(centralData).flat().forEach(r=>{
      const value=window.KOSItemMaster
        ?window.KOSItemMaster.deliveryValue(fixed,r[5],r[0])
        :null;
      r[4]=Number.isFinite(value)?value:0;
    });
  }`;

  return html.replace(
    /function applyDelivery\(x\)\{[\s\S]*?\}\nlet deliveryLabel=/,
    `${replacement}\nlet deliveryLabel=`
  );
}

async function transform(response, request) {
  let html = await response.text();
  html = injectMasterScript(html);

  if (new URL(request.url).pathname.endsWith('/daily.html')) {
    html = patchDailyDelivery(html);
  }

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'text/html; charset=utf-8');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

self.addEventListener('fetch', event => {
  event.respondWith((async () => {
    try {
      const network = await fetch(event.request, { cache: 'no-store' });
      const output = isKitchenPage(event.request)
        ? await transform(network.clone(), event.request)
        : network.clone();

      if (event.request.method === 'GET') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, output.clone());
      }

      return output;
    } catch (error) {
      const cached = await caches.match(event.request);
      if (!cached) throw error;

      return isKitchenPage(event.request)
        ? transform(cached.clone(), event.request)
        : cached;
    }
  })());
});
