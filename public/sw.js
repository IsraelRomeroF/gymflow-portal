/*
 * Service worker del portal (UX7 Portal 10). Siempre red primero: lo que el
 * socio ve es lo de ahora. Sin señal, el marco abre con lo último que vio
 * (páginas, código y su cuenta) en vez del error del navegador. Al cerrar
 * sesión el portal borra esta caché.
 */
const CACHE = 'gf-portal-v2';
/*
 * La copia de la cuenta lleva la hora en que se guardó (fase 2, bloque 2.8 ·
 * 25-18): si un día se sirve sin señal, el portal dice «Datos de hace 2 h» en
 * vez de enseñar «Hoy entras» como si fuera de ahora.
 */
const conFecha = async (res) => {
  const h = new Headers(res.headers);
  h.set('x-gf-guardado', String(Date.now()));
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
};
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

const guardable = (req, url) => req.method === 'GET' && url.origin === self.location.origin && (
  req.mode === 'navigate' || url.pathname.startsWith('/_next/static/') || /\.(png|webmanifest|woff2?)$/.test(url.pathname)
  // De la API solo la cuenta: es lo que pinta el marco y "¿puedo entrar hoy?".
  || url.pathname === '/api/portal/me'
);

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (!guardable(e.request, url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(e.request);
      if (res.ok) await cache.put(e.request, url.pathname.startsWith('/api/') ? await conFecha(res.clone()) : res.clone());
      return res;
    } catch (err) {
      const guardada = await cache.match(e.request, { ignoreSearch: e.request.mode === 'navigate' })
        ?? (e.request.mode === 'navigate' ? await cache.match('/') : undefined);
      if (guardada) return guardada;
      throw err;
    }
  })());
});

/*
 * NOTIFICACIONES (fase 3, bloque 3.10; D-34 opción c): las del navegador, con
 * las llaves del propio servidor. Llega el aviso que ya nació en la campana
 * (título, texto y a qué pantalla lleva) y al tocarlo se abre el portal ahí.
 * Sin caché de por medio: el contenido se lee de la red al abrir.
 */
self.addEventListener('push', (e) => {
  let d = { title: 'Tu gimnasio', body: '', url: '/', tag: undefined };
  try { d = { ...d, ...e.data.json() }; } catch { d.body = e.data ? e.data.text() : ''; }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, tag: d.tag, icon: '/icon-192.png', badge: '/icon-192.png', data: { url: d.url },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // Solo pantallas del portal: una ruta propia, nunca una dirección de fuera.
  const pedida = e.notification.data && e.notification.data.url;
  const url = typeof pedida === 'string' && pedida.startsWith('/') && !pedida.startsWith('//') ? pedida : '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
    const abierta = ventanas.find((v) => 'focus' in v);
    if (abierta) { abierta.navigate(url); return abierta.focus(); }
    return self.clients.openWindow(url);
  }));
});
