const WORKER = `
const CACHE = "foundly-staff-assets-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("foundly-staff-assets-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => new Response(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0C4A3E"><title>Foundly offline</title><style>body{margin:0;background:#f7f6f2;color:#18352f;font:16px system-ui;display:grid;min-height:100vh;place-items:center}main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.4rem}p{line-height:1.6;color:#50645f}</style></head><body><main><h1>You are offline</h1><p>Return to the open Foundly capture screen. New captures are kept on this device and retry automatically when the connection returns.</p></main></body></html>',
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    )));
    return;
  }
  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    }));
  }
});
`;

export function GET() {
  return new Response(WORKER, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/staff/",
    },
  });
}
