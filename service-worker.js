/* ==========================================================================
   DREAMBOARD - SERVICE WORKER (PWA OFFLINE CACHE)
   ========================================================================== */

const CACHE_NAME = 'dreamboard-v14';

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

// Активация: удаляем старые DreamBoard-кэши, но не чужие origin-кэши
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME && key.indexOf('dreamboard-') === 0)
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
