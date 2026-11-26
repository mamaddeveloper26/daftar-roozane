const CACHE_NAME = "daftar-roozane-v__BUILD_VERSION__";
const CORE = ["./", "./index.html", "./styles.css?v=__BUILD_VERSION__", "./app.js?v=__BUILD_VERSION__", "./manifest.json", "./icon.svg", "./notification-bridge.js", "./reminders.js?v=__BUILD_VERSION__"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
    // Reload already-open WebViews so the newly installed APK's assets take effect immediately.
    const clients = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    await Promise.all(clients.map(client => client.navigate(client.url).catch(() => null)));
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const url = new URL(request.url);
    const appShell = request.mode === "navigate" || url.pathname.endsWith(".html") || /\\.(js|css)$/.test(url.pathname);
    if (appShell) {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || caches.match("./index.html");
      }
    }
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return caches.match("./index.html");
    }
  })());
});
