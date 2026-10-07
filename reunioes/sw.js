// Cache para o app abrir sem internet. Os dados (Firestore) têm cache próprio.
const CACHE = 'immb-reunioes-v2';
const ARQUIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'servidor.js', 'config.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((chaves) =>
    Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Só arquivos do próprio app e a biblioteca do Firebase (gstatic). Rede primeiro,
// para receber atualizações; cache como reserva quando estiver offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const doApp = url.origin === location.origin && !url.search;
  const biblioteca = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (e.request.method !== 'GET' || !(doApp || biblioteca)) return;
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        if (resp.ok) {
          const copia = resp.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
