const CACHE_NAME = 'nasa-space-explorer-v1';
const APP_ROOT = new URL('./', self.registration.scope).href;
const NASA_API_ORIGIN = 'https://science.nasa.gov';
const NASA_API_PATH = '/wp-json/wp/v2/apod-basic';
const APP_SHELL_URLS = [
  APP_ROOT,
  new URL('./manifest.json', APP_ROOT).href,
  new URL('./js/dateRange.js', APP_ROOT).href,
  new URL('./js/script.js', APP_ROOT).href,
  new URL('./img/nasa-worm-logo.png', APP_ROOT).href,
  new URL('./img/icon-192.png', APP_ROOT).href,
  new URL('./img/icon-512.png', APP_ROOT).href,
];

async function saveResponse(request, response) {
  if (response.ok || response.type === 'opaque') {
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    } catch (error) {
      console.error('Unable to cache response:', error);
    }
  }

  return response;
}

async function networkFirst(request) {
  try {
    return await saveResponse(request, await fetch(request));
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  if (request.mode !== 'navigate') {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }
  }

  async function getCachedAppPage() {
    if (request.mode !== 'navigate') {
      return null;
    }

    return cache.match(APP_ROOT);
  }

  try {
    const response = await fetch(request);

    if (!response.ok) {
      const cachedAppPage = await getCachedAppPage();
      if (cachedAppPage) {
        return cachedAppPage;
      }
    }

    return await saveResponse(request, response);
  } catch (error) {
    const cachedAppPage = await getCachedAppPage();
    if (cachedAppPage) {
      return cachedAppPage;
    }

    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(APP_SHELL_URLS);

      const appPage = await cache.match(APP_ROOT);
      const appHtml = await appPage.text();
      const builtAssets = Array.from(
        appHtml.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
        (match) => new URL(match[1], APP_ROOT).href
      );
      await cache.addAll(builtAssets);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith('nasa-space-explorer-') &&
              cacheName !== CACHE_NAME
          )
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  );
  self.clients.claim();
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

  event.respondWith(
    isNasaApiRequest ? networkFirst(event.request) : cacheFirst(event.request)
  );
});
