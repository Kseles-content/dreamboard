/* ==========================================================================
   DREAMBOARD - V14 RELEASE METADATA TESTS (scoped cache isolation)
   ==========================================================================
   Покрытие (Этап 6 corrective — FIX: изоляция cache names по scope):
   - runtime cache names: production и preview вычисляют РАЗНЫЕ имена из
     одного source-файла во время исполнения;
   - install создаёт scoped cache со всеми PRECACHE entries;
   - activate (preview) НЕ удаляет production cache и legacy dreamboard-v13;
   - activate (production) НЕ удаляет preview cache, но удаляет legacy
     dreamboard-v13 и старую scoped production версию;
   - preview удаляет только старую scoped preview версию;
   - текущие кэши и other-app-v1 сохраняются;
   - version.txt: честный release identifier 2026-08-26-v14, Expected cache
     описывает scoped runtime-name;
   - контракты не тронуты: schemaVersion 2, backup formatVersion 1,
     storage-ключи.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SW_JS = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
const VERSION_TXT = fs.readFileSync(path.join(__dirname, 'version.txt'), 'utf8');
const STORAGE_JS = fs.readFileSync(path.join(__dirname, 'storage.js'), 'utf8');
const BACKUP_JS = fs.readFileSync(path.join(__dirname, 'backup.js'), 'utf8');
const IMPORT_JS = fs.readFileSync(path.join(__dirname, 'import.js'), 'utf8');

const PROD_SCOPE = 'https://example.com/dreamboard/';
const PREVIEW_SCOPE = 'https://example.com/dreamboard-v14-preview/';
const PROD_CACHE = 'dreamboard-dreamboard-v15';
const PREVIEW_CACHE = 'dreamboard-dreamboard-v14-preview-v15';
const LEGACY_V13 = 'dreamboard-v13';
const OLD_PROD_SCOPED = 'dreamboard-dreamboard-v13';
const OLD_PREVIEW_SCOPED = 'dreamboard-dreamboard-v14-preview-v13';

const EXPECTED_PRECACHE = [
    './', './index.html', './style.css', './storage.js', './backup.js',
    './import.js', './performance.js', './trash.js', './config.js',
    './auth.js', './app.js', './sw-register.js', './manifest.json',
    './assets/vendor/html2canvas-1.4.1.min.js',
    './assets/vendor/supabase-js-2.112.2.min.js',
    './assets/icons/icon-192.png', './assets/icons/icon-512.png',
    './assets/images/dream_career.png', './assets/images/dream_travel.png',
    './assets/images/og-preview.png'
];

// --- Динамическая песочница SW: исполняем реальный install/activate ---------

function loadSW(scopeUrl, existingCacheNames) {
    const listeners = {};
    const store = new Map(); // cacheName -> Set(urls) | null
    for (const name of existingCacheNames) store.set(name, null);
    const deleted = [];
    const opened = [];
    let runtime = null;

    const cachesMock = {
        open: async (name) => {
            opened.push(name);
            if (!store.has(name)) store.set(name, null);
            return {
                addAll: async (urls) => { store.set(name, new Set(urls)); },
                put: async () => {}
            };
        },
        keys: async () => Array.from(store.keys()),
        delete: async (name) => { deleted.push(name); store.delete(name); return true; },
        match: async () => undefined
    };

    const sandbox = {
        console,
        Promise,
        URL,
        location: { origin: 'https://example.com', pathname: new URL(scopeUrl).pathname },
        caches: cachesMock,
        fetch: async () => ({ status: 200, clone: () => ({}) }),
        self: {
            addEventListener: (type, fn) => { listeners[type] = fn; },
            skipWaiting: () => { sandbox.__skipWaitingCalled = true; },
            clients: { claim: () => { sandbox.__claimCalled = true; } },
            registration: { scope: scopeUrl },
            __DB_SW_RUNTIME__: (info) => { runtime = info; }
        }
    };
    sandbox.__skipWaitingCalled = false;
    sandbox.__claimCalled = false;

    vm.createContext(sandbox);
    vm.runInContext(SW_JS, sandbox, { filename: 'service-worker.js' });
    return { listeners, store, deleted, opened, sandbox, runtime: () => runtime };
}

function runInstall(sw) {
    return new Promise((resolve, reject) => {
        const ev = { waitUntil: (p) => p.then(resolve, reject) };
        sw.listeners.install(ev);
    });
}

function runActivate(sw) {
    return new Promise((resolve, reject) => {
        const ev = { waitUntil: (p) => p.then(resolve, reject) };
        sw.listeners.activate(ev);
    });
}

// --- version.txt -----------------------------------------------------------

test('1. version.txt: Stage 7B v15 identifier', () => {
    assert.ok(/Build: 2026-08-27-v15-stage7b/.test(VERSION_TXT), 'Build = v15 Stage 7B');
    assert.ok(!/2026-06-06-v13/.test(VERSION_TXT), 'нет старого v13 build identifier');
});

test('2. version.txt: Expected cache описывает scoped runtime-name, не один глобальный', () => {
    assert.ok(/Expected cache: runtime scoped cache name/.test(VERSION_TXT), 'описан runtime scoped cache');
    assert.ok(/dreamboard-<scope>-v15/.test(VERSION_TXT), 'формула dreamboard-<scope>-v15');
    assert.ok(/dreamboard-dreamboard-v15/.test(VERSION_TXT), 'пример production имени');
    assert.ok(/dreamboard-dreamboard-v14-preview-v15/.test(VERSION_TXT), 'пример preview имени');
    assert.ok(!/Expected cache: dreamboard-v14\s*$/.test(VERSION_TXT), 'не обещает один глобальный cache name');
});

// --- Runtime cache names (динамически, из реального исполнения SW) ---------

test('3. production scope: runtime cache name = dreamboard-dreamboard-v14', () => {
    const sw = loadSW(PROD_SCOPE, []);
    const rt = sw.runtime();
    assert.ok(rt, 'SW вызвал __DB_SW_RUNTIME__');
    assert.strictEqual(rt.cacheName, PROD_CACHE, 'production cache name');
    assert.strictEqual(rt.scopeName, 'dreamboard', 'scope name нормализован');
    assert.strictEqual(rt.precacheUrls.length, 20, '20 PRECACHE entries');
});

test('4. preview scope: runtime cache name = dreamboard-dreamboard-v14-preview-v14', () => {
    const sw = loadSW(PREVIEW_SCOPE, []);
    const rt = sw.runtime();
    assert.ok(rt, 'SW вызвал __DB_SW_RUNTIME__');
    assert.strictEqual(rt.cacheName, PREVIEW_CACHE, 'preview cache name');
    assert.strictEqual(rt.scopeName, 'dreamboard-v14-preview', 'scope name нормализован');
    assert.notStrictEqual(rt.cacheName, PROD_CACHE, 'имена различаются');
});

test('5. один source-файл вычисляет разные cache names (production != preview)', () => {
    const prod = loadSW(PROD_SCOPE, []).runtime();
    const prev = loadSW(PREVIEW_SCOPE, []).runtime();
    assert.notStrictEqual(prod.cacheName, prev.cacheName, 'cache names изолированы по scope');
    assert.ok(prod.cacheName.startsWith('dreamboard-') && prev.cacheName.startsWith('dreamboard-'),
        'оба в namespace DreamBoard');
    assert.ok(prod.cacheName.endsWith('-v15') && prev.cacheName.endsWith('-v15'), 'оба версии v15');
});

// --- install ---------------------------------------------------------------

test('6. install (production) создаёт НОВЫЙ scoped cache со всеми 20 PRECACHE entries', async () => {
    const sw = loadSW(PROD_SCOPE, [LEGACY_V13]);
    await runInstall(sw);
    assert.ok(sw.opened.includes(PROD_CACHE), 'caches.open(dreamboard-dreamboard-v14) вызван');
    const urls = sw.store.get(PROD_CACHE);
    assert.ok(urls, 'новый кэш создан');
    assert.strictEqual(urls.size, 20, 'ровно 20 entries');
    for (const u of EXPECTED_PRECACHE) assert.ok(urls.has(u), 'entry отсутствует: ' + u);
    assert.ok(sw.sandbox.__skipWaitingCalled, 'skipWaiting вызван');
    assert.ok(sw.store.has(LEGACY_V13), 'install не трогает legacy');
});

// --- activate: изоляция по scope -------------------------------------------

test('7. preview activation НЕ удаляет production cache и legacy dreamboard-v13', async () => {
    const sw = loadSW(PREVIEW_SCOPE, [PREVIEW_CACHE, PROD_CACHE, LEGACY_V13, OLD_PREVIEW_SCOPED]);
    await runActivate(sw);
    assert.ok(sw.deleted.includes(OLD_PREVIEW_SCOPED), 'старая scoped preview удалена');
    assert.ok(!sw.deleted.includes(PROD_CACHE), 'production cache НЕ удалён');
    assert.ok(!sw.deleted.includes(LEGACY_V13), 'legacy dreamboard-v13 НЕ удалён preview-ом');
    assert.ok(!sw.deleted.includes(PREVIEW_CACHE), 'текущий preview cache НЕ удалён');
    assert.ok(sw.store.has(PROD_CACHE) && sw.store.has(LEGACY_V13), 'production и legacy целы');
    assert.ok(sw.sandbox.__claimCalled, 'clients.claim вызван');
});

test('8. production activation удаляет legacy dreamboard-v13 и старую scoped production', async () => {
    const sw = loadSW(PROD_SCOPE, [PROD_CACHE, LEGACY_V13, OLD_PROD_SCOPED, PREVIEW_CACHE]);
    await runActivate(sw);
    assert.ok(sw.deleted.includes(LEGACY_V13), 'legacy dreamboard-v13 удалён production-ом');
    assert.ok(sw.deleted.includes(OLD_PROD_SCOPED), 'старая scoped production удалена');
    assert.ok(!sw.deleted.includes(PREVIEW_CACHE), 'preview cache НЕ удалён');
    assert.ok(!sw.deleted.includes(PROD_CACHE), 'текущий production cache НЕ удалён');
    assert.ok(sw.store.has(PREVIEW_CACHE) && sw.store.has(PROD_CACHE), 'preview и текущий целы');
});

test('9. preview удаляет ТОЛЬКО старую scoped preview версию', async () => {
    const sw = loadSW(PREVIEW_SCOPE, [PREVIEW_CACHE, OLD_PREVIEW_SCOPED, PROD_CACHE, OLD_PROD_SCOPED, LEGACY_V13]);
    await runActivate(sw);
    assert.deepStrictEqual(sw.deleted, [OLD_PREVIEW_SCOPED], 'удалён ровно один кэш — старая scoped preview');
});

test('10. production activation удаляет только dreamboard-* своего scope + legacy', async () => {
    const sw = loadSW(PROD_SCOPE, [PROD_CACHE, OLD_PROD_SCOPED, LEGACY_V13, PREVIEW_CACHE, 'other-app-v1', 'google-analytics-cache']);
    await runActivate(sw);
    assert.deepStrictEqual(sw.deleted.slice().sort(), [LEGACY_V13, OLD_PROD_SCOPED].sort(),
        'удалены только legacy v13 и старая scoped production');
    assert.ok(sw.store.has('other-app-v1') && sw.store.has('google-analytics-cache'),
        'сторонние кэши не тронуты');
    assert.ok(sw.store.has(PREVIEW_CACHE), 'preview cache не тронут');
});

test('11. текущие кэши (production и preview) всегда сохраняются', async () => {
    const p1 = loadSW(PROD_SCOPE, [PROD_CACHE, OLD_PROD_SCOPED]);
    await runActivate(p1);
    assert.ok(p1.store.has(PROD_CACHE), 'production текущий сохранён');
    const p2 = loadSW(PREVIEW_SCOPE, [PREVIEW_CACHE, OLD_PREVIEW_SCOPED]);
    await runActivate(p2);
    assert.ok(p2.store.has(PREVIEW_CACHE), 'preview текущий сохранён');
});

// --- PRECACHE --------------------------------------------------------------

test('12. PRECACHE_URLS содержит все 20 entries, все файлы существуют на диске', () => {
    const m = SW_JS.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
    assert.ok(m, 'PRECACHE_URLS найден');
    const urls = Array.from(m[1].matchAll(/'([^']+)'/g), x => x[1]);
    assert.strictEqual(urls.length, 20, 'ровно 20 entries');
    assert.deepStrictEqual(urls, EXPECTED_PRECACHE, 'набор entries совпадает с ожидаемым');
    for (const u of urls) {
        const rel = u.replace(/^\.\//, '');
        const p = path.join(__dirname, rel === '' ? 'index.html' : rel);
        assert.ok(fs.existsSync(p), 'PRECACHE файл существует: ' + u);
    }
});

// --- Контракты не тронуты --------------------------------------------------

test('13. контракты не изменены: schemaVersion 2, backup formatVersion 1, ключи storage', () => {
    assert.ok(/SCHEMA_VERSION = 2/.test(STORAGE_JS), 'storage schemaVersion = 2');
    assert.ok(/APP_VERSION = 'v14'/.test(STORAGE_JS), 'storage APP_VERSION = v14');
    assert.ok(/KEY_PRIMARY = 'dreamboard_app_state'/.test(STORAGE_JS), 'KEY_PRIMARY не изменён');
    assert.ok(/KEY_RECOVERY = 'dreamboard_app_state_recovery'/.test(STORAGE_JS), 'KEY_RECOVERY не изменён');
    assert.ok(/KEY_LEGACY = 'dreams_db'/.test(STORAGE_JS), 'KEY_LEGACY (страховка v13) не изменён');
    assert.ok(/'dreamboard-backup'/.test(BACKUP_JS), 'backup format dreamboard-backup');
    assert.ok(/import/.test(IMPORT_JS.toLowerCase()), 'import.js присутствует');
});

test('14. SW: scope-изоляция реализована (SCOPE_NAME, SCOPE_OLD_RE, IS_PRODUCTION_SCOPE)', () => {
    assert.ok(/var CACHE_NAME = 'dreamboard-' \+ SCOPE_NAME \+ '-v15';/.test(SW_JS),
        'CACHE_NAME строится из scope во время исполнения');
    assert.ok(/SCOPE_OLD_RE/.test(SW_JS) && /IS_PRODUCTION_SCOPE/.test(SW_JS) && /LEGACY_CACHE_RE/.test(SW_JS),
        'механика activate-фильтра на месте');
    assert.ok(!/const CACHE_NAME = 'dreamboard-v13'/.test(SW_JS), 'нет статического dreamboard-v13');
    assert.ok(!/const CACHE_NAME = 'dreamboard-v14'/.test(SW_JS), 'нет статического dreamboard-v14');
});
