/* Offline support for 다국어 성경.
   - App shell (page, manifest, icons, book list): network first, cached copy when offline,
     so edits you upload reach the device the next time it is online.
   - Bible text (data/NN.json): cache first. The page downloads all 66 books into
     DATA_CACHE in the background; bump DATA_CACHE only when the text itself changes. */
const CORE_CACHE = "core-v1";
const DATA_CACHE = "bible-data-v1";
const CORE_FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./data/meta.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CORE_CACHE).then(c => c.addAll(CORE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CORE_CACHE && k !== DATA_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

async function networkFirst(req) {
  const cache = await caches.open(CORE_CACHE);
  try {
    const res = await Promise.race([fetch(req), timeout(4000)]);
    if (res && res.ok) cache.put(req.mode === "navigate" ? "./index.html" : req, res.clone());
    return res;
  } catch (e) {
    const hit = req.mode === "navigate"
      ? await cache.match("./index.html")
      : await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw e;
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isBook = /\/data\/\d\d\.json$/.test(url.pathname);
  if (isBook) event.respondWith(cacheFirst(req, DATA_CACHE));
  else if (req.mode === "navigate" || /\.(html|webmanifest|json)$/.test(url.pathname) || url.pathname.endsWith("/")) event.respondWith(networkFirst(req));
  else event.respondWith(cacheFirst(req, CORE_CACHE));
});
