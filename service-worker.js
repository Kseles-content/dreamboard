/* ==========================================================================
   DREAMBOARD - SERVICE WORKER (PWA OFFLINE CACHE)
   ========================================================================== */

// Runtime-имя кэша ИЗОЛИРОВАНО по service-worker scope: один и тот же
// source-файл вычисляет разные cache names во время исполнения.
//   production scope /dreamboard/            -> dreamboard-dreamboard-v14
//   preview scope   /dreamboard-v14-preview/ -> dreamboard-dreamboard-v14-preview-v14
function normalizeScopeName(scopeUrl) {
    var path = String(scopeUrl || '').replace(location.origin, '');
    path = path.replace(/^\/+|\/+$/g, '');
    return path.replace(/\//g, '-') || 'root';
}

var SCOPE_NAME = (function () {
    try {
        var regScope = self.registration && self.registration.scope ? self.registration.scope : '';
        if (regScope) return normalizeScopeName(regScope);
    } catch (e) { /* registration недоступна — fallback ниже */ }
    return normalizeScopeName(location.pathname.replace(/[^/]*$/, ''));
})();

var CACHE_NAME = 'dreamboard-' + SCOPE_NAME + '-v14';

// Старые scoped-версии ТЕКУЩЕГО scope: dreamboard-<scope>-v<digits>
var SCOPE_OLD_RE = new RegExp('^dreamboard-' + SCOPE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-v\\d+$');
// Legacy глобальный кэш (общий для всех scope до v14)
var LEGACY_CACHE_RE = /^dreamboard-v\d+$/;
// Legacy dreamboard-v13 разрешено удалять ТОЛЬКО production scope при реальном upgrade
var IS_PRODUCTION_SCOPE = SCOPE_NAME === 'dreamboard';

// Ресурсы для предварительного кэширования (Precache)
const PRECACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './storage.js',
    './backup.js',
    './import.js',
    './performance.js',
    './trash.js',
    './app.js',
    './manifest.json',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    './assets/images/dream_career.png',
    './assets/images/dream_travel.png',
    './assets/images/og-preview.png'
];

// Установка: предварительно кэшируем основные ресурсы
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Предварительное кэширование ресурсов...');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => self.skipWaiting()) // Активируем сразу
    );
});

// Активация: удаляем только старые кэши ТЕКУЩЕГО scope.
// Кэши другого DreamBoard scope, legacy dreamboard-v13 (для preview) и
// сторонние origin-кэши НЕ удаляются.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => {
                        if (key === CACHE_NAME) return false;           // текущий кэш
                        if (SCOPE_OLD_RE.test(key)) return true;        // старая версия текущего scope
                        if (IS_PRODUCTION_SCOPE && LEGACY_CACHE_RE.test(key)) return true; // legacy — только production
                        return false;                                    // чужой scope / сторонние кэши
                    })
                    .map(key => {
                        console.log('[SW] Удаление старого кэша:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim()) // Берём контроль над всеми вкладками
    );
});

// Стратегия: Сначала Кэш, потом Сеть (Cache First, Network Fallback)
// Для внешних ресурсов (шрифты, картинки Unsplash): Сначала Сеть, потом Кэш
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Для навигационных запросов и локальных файлов — Cache First
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        // Параллельно обновляем кэш в фоне (Stale While Revalidate)
                        fetch(event.request).then(freshResponse => {
                            if (freshResponse && freshResponse.status === 200) {
                                caches.open(CACHE_NAME).then(cache => {
                                    cache.put(event.request, freshResponse);
                                });
                            }
                        }).catch(() => {}); // Игнорируем сетевые ошибки

                        return cachedResponse;
                    }

                    // Если в кэше нет — идем в сеть и сохраняем
                    return fetch(event.request).then(response => {
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then(cache => {
                                cache.put(event.request, clone);
                            });
                        }
                        return response;
                    });
                })
        );
    } else {
        // Внешние ресурсы (Google Fonts, Unsplash) — Network First
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response && response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, clone);
                        });
                    }
                    return response;
                })
                .catch(() => {
                    // Если сеть недоступна — пробуем кэш
                    return caches.match(event.request);
                })
        );
    }
});

// Runtime-экспорт для тестов (node vm); в браузере no-op.
if (typeof self !== 'undefined' && typeof self.__DB_SW_RUNTIME__ === 'function') {
    self.__DB_SW_RUNTIME__({ cacheName: CACHE_NAME, scopeName: SCOPE_NAME, precacheUrls: PRECACHE_URLS.slice() });
}
