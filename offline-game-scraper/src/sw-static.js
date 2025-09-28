/**
 * Статический Service Worker для offline-game-scraper
 * Простая версия без авто-генерации
 */

// Конфигурация (заполняется вручную или через build script)
const CONFIG = {
  CACHE_VERSION: 'offline-v1',
  VOLATILE_PARAMS: ['token', 'auth', '_', 'v', 'ver', 'verid', 'cb', 'cache', 't', 'ts', 'timestamp']
};

// Утилиты
function getBase() {
  return new URL(self.registration.scope).pathname.replace(/[^/]+$/, '');
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    const pairs = [...u.searchParams.entries()].sort((a, b) => 
      a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
    );
    u.search = '';
    for (const [k, v] of pairs) u.searchParams.append(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  self.skipWaiting();
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil((async () => {
    // Удаляем старые кеши
    const names = await caches.keys();
    await Promise.all(
      names.map((name) => 
        name.includes('offline-') ? null : caches.delete(name)
      )
    );
  })());
  
  self.clients.claim();
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;
  const parsed = new URL(url);
  
  // Игнорируем системные запросы
  if (parsed.protocol === 'chrome-extension:' || parsed.protocol === 'devtools:') {
    return;
  }

  event.respondWith((async () => {
    const base = getBase();
    
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': request.headers.get('origin') || '*',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': request.headers.get('access-control-request-headers') || '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        },
      });
    }

    // Аналитика - заглушки
    if (parsed.hostname === 'www.googletagmanager.com' || 
        parsed.hostname === 'static.cloudflareinsights.com' ||
        parsed.hostname === 'region1.analytics.google.com' || 
        parsed.hostname === 'stats.g.doubleclick.net') {
      return new Response('/* offline noop */', {
        status: 200,
        headers: { 'content-type': 'application/javascript' }
      });
    }
    
    if (/\/cdn-cgi\/rum/i.test(parsed.pathname)) {
      return new Response('', { status: 200 });
    }

    // 1. Пробуем кеш
    try {
      const cache = await caches.open(`assets-${CONFIG.CACHE_VERSION}`);
      const cached = await cache.match(request);
      if (cached) {
        console.log('[SW] Cache hit:', url);
        return cached;
      }
    } catch (err) {
      console.warn('[SW] Cache error:', err);
    }

    // 2. API моки (если есть apiMap.json)
    try {
      const apiMapResponse = await fetch(base + 'mocks/apiMap.json');
      if (apiMapResponse.ok) {
        const apiMocks = await apiMapResponse.json();
        const normalizedUrl = normalizeUrl(url);
        
        // Простой поиск по URL (можно улучшить)
        const mock = apiMocks.find(m => 
          m.url === normalizedUrl || 
          m.url === url ||
          new URL(m.url).pathname === parsed.pathname
        );
        
        if (mock) {
          console.log('[SW] API mock hit:', url);
          const response = await fetch(base + mock.file);
          const data = await response.json();
          
          // Декодируем base64 тело ответа если есть
          let body = '';
          if (data.response?.bodyB64) {
            body = atob(data.response.bodyB64);
          }
          
          return new Response(body, {
            status: data.response?.status || 200,
            headers: {
              'content-type': data.contentType || 'application/json',
              'access-control-allow-origin': '*',
              'access-control-allow-credentials': 'true',
              ...data.response?.headers
            }
          });
        }
      }
    } catch (err) {
      console.warn('[SW] API mock error:', err);
    }

    // 3. Fallback - пробуем сеть
    try {
      return await fetch(request);
    } catch (err) {
      console.warn('[SW] Network fallback failed:', err);
      return new Response('', { status: 204 });
    }
  })());
});

console.log('[SW] Static Service Worker loaded');

