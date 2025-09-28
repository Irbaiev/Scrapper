/**
 * Статический шаблон Service Worker
 * Заменяет авто-генерацию на простой и понятный код
 */

// Конфигурация (заполняется при сборке)
const CONFIG = {
  ASSET_MAP: {}, // Заполняется из mirrorIndex.json
  API_MOCKS: [], // Заполняется из apiMap.json
  CACHE_VERSION: 'offline-v1', // Заполняется при сборке
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

function normalizeUrlLoose(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    const pairs = [...u.searchParams.entries()]
      .filter(([k]) => !CONFIG.VOLATILE_PARAMS.includes(k.toLowerCase()))
      .sort((a, b) => a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0]));
    u.search = '';
    for (const [k, v] of pairs) u.searchParams.append(k, v);
    return u.toString();
  } catch {
    return url;
  }
}

function createMockKey(method, url, body = '') {
  const u = new URL(url);
  const pairs = [...u.searchParams.entries()].sort((a, b) => 
    a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])
  );
  const normalizedQuery = pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const bodyHash = body ? btoa(body).slice(0, 8) : '';
  return `${method.toUpperCase()}|${u.pathname || '/'}|${normalizedQuery}|${bodyHash}`;
}

// Создаем индекс API моков для быстрого поиска
const API_INDEX = CONFIG.API_MOCKS.reduce((acc, entry) => {
  acc[entry.key] = entry;
  return acc;
}, {});

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil((async () => {
    const cache = await caches.open(`assets-${CONFIG.CACHE_VERSION}`);
    const unique = [...new Set(Object.values(CONFIG.ASSET_MAP))];
    const base = getBase();
    
    for (const rel of unique) {
      const url = base + rel;
      try {
        await cache.add(url);
        console.log('[SW] Cached:', url);
      } catch (err) {
        console.warn('[SW] Cache add failed:', url, err?.message || err);
      }
    }
  })());
  
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
        name === `assets-${CONFIG.CACHE_VERSION}` ? null : caches.delete(name)
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

    // 1. Сначала пробуем кеш ассетов
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

    // 2. API моки
    try {
      const normalizedUrl = normalizeUrl(url);
      const looseUrl = normalizeUrlLoose(url);
      
      // Пробуем точное совпадение
      let mock = API_INDEX[createMockKey(request.method, normalizedUrl)];
      
      // Если не найдено, пробуем loose совпадение
      if (!mock) {
        mock = API_INDEX[createMockKey(request.method, looseUrl)];
      }
      
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

console.log('[SW] Service Worker loaded');

