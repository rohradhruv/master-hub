const CACHE = 'masterhub-v7';
const ASSETS = ['./', './index.html', './styles.css', './app.js', './manifest.json', './icon.svg',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if(url.pathname.startsWith('/api/')) return;   // database calls: always live, never cached
  if(url.origin !== location.origin) return;     // cloud/CDN calls: straight to network
  e.respondWith(
    fetch(e.request).then(res => {
      if(url.origin === location.origin){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
