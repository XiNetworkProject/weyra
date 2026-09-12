const CACHE_PREFIX = "weyra-pwa";
const STATIC_CACHE = `${CACHE_PREFIX}-static-v2`;
const PAGE_CACHE = `${CACHE_PREFIX}-pages-v2`;
const PRECACHE = ["/offline", "/icon.svg"];
const MAX_PAGE_ENTRIES = 12;
let lowBandwidth = false;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && ![STATIC_CACHE, PAGE_CACHE].includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "NETWORK_MODE") lowBandwidth = Boolean(event.data.lowBandwidth);
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "CLEAR_WEYRA_CACHES") {
    event.waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name))),
        ),
    );
  }
});

async function trimCache(cacheName, maximum) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maximum)).map((key) => cache.delete(key)));
}

async function fetchWithTimeout(request, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAndCachePage(request) {
  const response = await fetchWithTimeout(request, lowBandwidth ? 3500 : 7000);
  const contentType = response.headers.get("content-type") ?? "";
  if (response.ok && contentType.includes("text/html")) {
    const cache = await caches.open(PAGE_CACHE);
    await cache.put(request, response.clone());
    await trimCache(PAGE_CACHE, MAX_PAGE_ENTRIES);
  }
  return response;
}

async function navigationResponse(request, event) {
  const cached = await caches.match(request);
  if (lowBandwidth && cached) {
    event.waitUntil(fetchAndCachePage(request).catch(() => undefined));
    return cached;
  }

  try {
    return await fetchAndCachePage(request);
  } catch {
    return cached ?? (await caches.match("/offline"));
  }
}

async function staticResponse(request, event) {
  const cached = await caches.match(request);
  const update = fetch(request).then(async (response) => {
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  });
  if (cached) {
    event.waitUntil(update.catch(() => undefined));
    return cached;
  }
  return update;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request, event));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/media/") ||
    url.pathname.startsWith("/map-styles/") ||
    url.pathname === "/icon.svg"
  ) {
    event.respondWith(staticResponse(request, event));
  }
});
