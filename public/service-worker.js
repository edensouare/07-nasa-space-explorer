const SHELL_CACHE_PREFIX = 'nasa-space-explorer-shell-';
const SHELL_CACHE = SHELL_CACHE_PREFIX + '__BUILD_VERSION__';
const RUNTIME_CACHE = 'nasa-space-explorer-runtime';
const APP_ROOT = new URL('./', self.registration.scope).href;
const NASA_API_ORIGIN = 'https://api.nasa.gov';
const NASA_API_PATH = '/planetary/apod';
const APP_SHELL_URLS = [
  APP_ROOT,
  new URL('./manifest.json', APP_ROOT).href,
  new URL('./img/favicon.png', APP_ROOT).href,
  new URL('./img/nasa-worm-logo.png', APP_ROOT).href,
  new URL('./img/icon-192.png', APP_ROOT).href,
  new URL('./img/icon-512.png', APP_ROOT).href,
];

async function saveResponse(cacheName, request, response) {
  if (response.ok || response.type === 'opaque') {
    try {
      const cache = await caches.open(cacheName);
      await cache.put(request, response.clone());
    } catch (error) {
      console.error('Unable to cache response:', error);
    }
  }

  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      return saveResponse(RUNTIME_CACHE, request, response);
    }

    const cache = await caches.open(RUNTIME_CACHE);
    return (await cache.match(request)) || response;
  } catch (error) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

async function cacheFirst(request, cacheKey, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(cacheKey);
  return cachedResponse || saveResponse(cacheName, cacheKey, await fetch(request));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(APP_SHELL_URLS.map((url) => new Request(url, { cache: 'reload' })));

    const appPage = await cache.match(APP_ROOT);
    const appHtml = await appPage.text();
    const builtAssets = Array.from(
      appHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
      (match) => new Request(new URL(match[1], APP_ROOT), { cache: 'reload' })
    );
    await cache.addAll(builtAssets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name === 'nasa-space-explorer-v1' ||
        (name.startsWith(SHELL_CACHE_PREFIX) && name !== SHELL_CACHE))
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const isNasaApiRequest =
    requestUrl.origin === NASA_API_ORIGIN &&
    requestUrl.pathname === NASA_API_PATH;
  const isImage = event.request.destination === 'image';

  if (
    event.request.method !== 'GET' ||
    (!isSameOrigin && !isNasaApiRequest && !isImage)
  ) {
    return;
  }

  if (isNasaApiRequest) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  const isAppPage = event.request.mode === 'navigate' &&
    (requestUrl.pathname === new URL(APP_ROOT).pathname ||
      requestUrl.pathname === new URL('index.html', APP_ROOT).pathname);
  const cacheName = isSameOrigin ? SHELL_CACHE : RUNTIME_CACHE;
  event.respondWith(cacheFirst(event.request, isAppPage ? APP_ROOT : event.request, cacheName));
});
