/* ============================================================
   Service worker — estrategias por tipo de archivo
   - Datos (data.js)  -> network-first : se actualiza desde Git
   - Imágenes         -> cache-first   : las nuevas se bajan solas
   - Código (shell)   -> cache-first versionado (subí VERSION al cambiar código)
   ============================================================ */

const VERSION = "v4";               // 👈 SUBÍ ESTO cuando cambies HTML/CSS/app.js
const SHELL_CACHE   = "shell-" + VERSION;
const RUNTIME_CACHE = "runtime";    // datos + imágenes (persiste entre versiones)

// Archivos de CÓDIGO (no incluir data.js acá: se maneja network-first)
const SHELL = [
  "./",
  "index.html",
  "css/estilos.css",
  "js/app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/favicon.png",
  "icons/apple-touch-icon.png"
];

// ¿Es un archivo de datos que debe venir siempre fresco?
function esDatos(url) {
  return url.pathname.endsWith("/data.js") || url.pathname.endsWith("/data.json");
}
// ¿Es una imagen de figura?
function esImagen(url) {
  return /\/Images\//i.test(url.pathname) || /\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname);
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL);
    // pre-cacheo data.js en runtime para que el primer arranque offline funcione
    try {
      const run = await caches.open(RUNTIME_CACHE);
      await run.add(new Request("js/data.js", { cache: "reload" }));
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // borro shells viejos, conservo el shell actual y el runtime (datos/imágenes)
    await Promise.all(keys.map(k => {
      if (k !== SHELL_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) Datos: network-first (online = lo último de Git; offline = última copia)
  if (sameOrigin && esDatos(url)) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "reload" });   // ignora caché HTTP
        const run = await caches.open(RUNTIME_CACHE);
        run.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }

  // 2) Imágenes: cache-first (las nuevas se descargan y quedan guardadas)
  if (esImagen(url)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        const run = await caches.open(RUNTIME_CACHE);
        run.put(req, res.clone());
        return res;
      } catch (_) {
        return hit || Response.error();
      }
    })());
    return;
  }

  // 3) Navegación: network-first con fallback al index cacheado
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("index.html"))
    );
    return;
  }

  // 4) Resto del shell (css/js/iconos): cache-first
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req))
  );
});
