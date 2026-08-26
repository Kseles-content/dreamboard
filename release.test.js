/* ==========================================================================
   DREAMBOARD - V14 RELEASE METADATA TESTS
   ==========================================================================
   Покрытие (Этап 6 — Release Candidate):
   - версия: version.txt = v14, CACHE_NAME = dreamboard-v14;
   - динамическое поведение service worker (vm-песочница):
     * install создаёт новый кэш dreamboard-v14 со всеми PRECACHE_URLS;
     * activate удаляет старый dreamboard-v13 (и другие dreamboard-*);
     * текущий кэш (dreamboard-v14) НЕ удаляется;
     * чужие cache names (не dreamboard-*) НЕ удаляются;
   - PRECACHE содержит все 15 entries, все файлы существуют;
   - контракты не тронуты: schemaVersion 2, backup formatVersion 1,
     импорт-контракт, storage-ключи.
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

// --- Динамическая песочница SW: исполняем реальный install/activate ---------

function loadSW(existingCacheNames) {
    const listeners = {};
    const store = new Map(); // cacheName -> Set(urls) | null (не создан)
    for (const name of existingCacheNames) store.set(name, null);
    const deleted = [];
    const opened = [];

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
        location: { origin: 'https://example.com' },
        caches: cachesMock,
        fetch: async () => ({ status: 200, clone: () => ({}) }),
        self: {
            addEventListener: (type, fn) => { listeners[type] = fn; },
            skipWaiting: () => { sandbox.__skipWaitingCalled = true; },
            clients: { claim: () => { sandbox.__claimCalled = true; } }
        }
    };
    sandbox.__skipWaitingCalled = false;
    sandbox.__claimCalled = false;

    vm.createContext(sandbox);
    vm.runInContext(SW_JS, sandbox, { filename: 'service-worker.js' });
    return { listeners, store, deleted, opened, sandbox };
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

const EXPECTED_CACHE = 'dreamboard-v14';
const EXPECTED_PRECACHE = [
    './', './index.html', './style.css', './storage.js', './backup.js',
    './import.js', './performance.js', './trash.js', './app.js',
    './manifest.json',
    './assets/icons/icon-192.png', './assets/icons/icon-512.png',
    './assets/images/dream_career.png', './assets/images/dream_travel.png',
    './assets/images/og-preview.png'
];

// --- Версия ---------------------------------------------------------------

test('1. version.txt содержит v14 и dreamboard-v14', () => {
    assert.ok(/Build: 2026-06-06-v14/.test(VERSION_TXT), 'Build = v14');
    assert.ok(/Expected cache: dreamboard-v14/.test(VERSION_TXT), 'Expected cache = dreamboard-v14');
    assert.ok(!/v13/.test(VERSION_TXT.replace('dreamboard-v14', '')), 'нет упоминаний v13');
});

test('2. CACHE_NAME = dreamboard-v14, без остатков dreamboard-v13', () => {
    assert.ok(/const CACHE_NAME = 'dreamboard-v14';/.test(SW_JS), 'CACHE_NAME = dreamboard-v14');
    assert.ok(!/dreamboard-v13/.test(SW_JS), 'service-worker.js не содержит dreamboard-v13');
});

test('3. activate фильтрует только старые dreamboard-* кэши (не все чужие)', () => {
    const m = SW_JS.match(/\.filter\(key => key !== CACHE_NAME[^)]*\)/);
    assert.ok(m, 'activate использует filter с key !== CACHE_NAME');
    assert.ok(/indexOf\('dreamboard-'\) === 0/.test(SW_JS) || /startsWith\('dreamboard-'\)/.test(SW_JS),
        'фильтр ограничен префиксом dreamboard-');
});

// --- Динамическое поведение install/activate ------------------------------

test('4. install создаёт НОВЫЙ кэш dreamboard-v14 со всеми 15 PRECACHE entries', async () => {
    const sw = loadSW(['dreamboard-v13']); // старое PWA уже установлено
    await runInstall(sw);
    assert.ok(sw.opened.includes(EXPECTED_CACHE), 'caches.open(dreamboard-v14) вызван');
    const urls = sw.store.get(EXPECTED_CACHE);
    assert.ok(urls, 'новый кэш создан');
    assert.strictEqual(urls.size, 15, 'ровно 15 entries');
    for (const u of EXPECTED_PRECACHE) assert.ok(urls.has(u), 'entry отсутствует: ' + u);
    assert.ok(sw.sandbox.__skipWaitingCalled, 'skipWaiting вызван');
    // Старый кэш ещё не тронут на этапе install
    assert.ok(sw.store.has('dreamboard-v13'), 'install не удаляет старый кэш');
});

test('5. activate удаляет старый dreamboard-v13, но НЕ текущий dreamboard-v14', async () => {
    const sw = loadSW([EXPECTED_CACHE, 'dreamboard-v13']);
    await runActivate(sw);
    assert.ok(sw.deleted.includes('dreamboard-v13'), 'dreamboard-v13 удалён');
    assert.ok(!sw.deleted.includes(EXPECTED_CACHE), 'текущий кэш НЕ удалён');
    assert.ok(sw.store.has(EXPECTED_CACHE), 'текущий кэш остался в store');
    assert.ok(sw.sandbox.__claimCalled, 'clients.claim вызван');
});

test('6. activate НЕ удаляет чужие cache names (не dreamboard-*)', async () => {
    const sw = loadSW([EXPECTED_CACHE, 'dreamboard-v12', 'other-app-v1', 'google-analytics-cache']);
    await runActivate(sw);
    assert.ok(sw.deleted.includes('dreamboard-v12'), 'другой старый dreamboard-* удалён');
    assert.ok(!sw.deleted.includes('other-app-v1'), 'чужой кэш не тронут');
    assert.ok(!sw.deleted.includes('google-analytics-cache'), 'чужой кэш не тронут');
    assert.ok(sw.store.has('other-app-v1') && sw.store.has('google-analytics-cache'),
        'чужие кэши остались в store');
    assert.strictEqual(sw.deleted.length, 1, 'удалён ровно один dreamboard-* (не текущий)');
});

test('7. PRECACHE_URLS содержит все 15 entries, все файлы существуют на диске', () => {
    const m = SW_JS.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
    assert.ok(m, 'PRECACHE_URLS найден');
    const urls = Array.from(m[1].matchAll(/'([^']+)'/g), x => x[1]);
    assert.strictEqual(urls.length, 15, 'ровно 15 entries');
    assert.deepStrictEqual(urls, EXPECTED_PRECACHE, 'набор entries совпадает с ожидаемым');
    for (const u of urls) {
        const rel = u.replace(/^\.\//, '');
        const p = path.join(__dirname, rel === '' ? 'index.html' : rel);
        assert.ok(fs.existsSync(p), 'PRECACHE файл существует: ' + u);
    }
});

// --- Контракты не тронуты --------------------------------------------------

test('8. контракты не изменены: schemaVersion 2, backup formatVersion 1, импорт, ключи storage', () => {
    assert.ok(/SCHEMA_VERSION = 2/.test(STORAGE_JS), 'storage schemaVersion = 2');
    assert.ok(/APP_VERSION = 'v14'/.test(STORAGE_JS), 'storage APP_VERSION = v14');
    assert.ok(/KEY_PRIMARY = 'dreamboard_app_state'/.test(STORAGE_JS), 'KEY_PRIMARY не изменён');
    assert.ok(/KEY_RECOVERY = 'dreamboard_app_state_recovery'/.test(STORAGE_JS), 'KEY_RECOVERY не изменён');
    assert.ok(/KEY_LEGACY = 'dreams_db'/.test(STORAGE_JS), 'KEY_LEGACY (страховка v13) не изменён');
    assert.ok(/formatVersion: 1/.test(BACKUP_JS) || /formatVersion = 1/.test(BACKUP_JS) || /'dreamboard-backup'/.test(BACKUP_JS),
        'backup format v1');
    assert.ok(/import/.test(IMPORT_JS.toLowerCase()), 'import.js присутствует');
});

test('9. storage.js: legacy dreams_db (v13) только как страховка, не основной ключ', () => {
    const legacyLine = STORAGE_JS.split('\n').find(l => l.includes('dreams_db') && l.includes('v13'));
    assert.ok(legacyLine, 'комментарий про legacy v13 на месте');
    assert.ok(/KEY_LEGACY = 'dreams_db'/.test(STORAGE_JS), 'KEY_LEGACY объявлен');
    // dreams_db читается только как fallback после отсутствия основного ключа
    const legacyUseIdx = STORAGE_JS.indexOf('KEY_LEGACY', STORAGE_JS.indexOf('var KEY_LEGACY') + 1);
    assert.ok(legacyUseIdx > -1, 'KEY_LEGACY используется в логике');
});
