/* ==========================================================================
   DREAMBOARD - STORAGE LAYER TESTS (node:test, без внешних зависимостей)
   Запуск: node --test storage.test.js
   ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Storage = require('./storage.js');

const KEY_PRIMARY = 'dreamboard_app_state';
const KEY_RECOVERY = 'dreamboard_app_state_recovery';
const KEY_LEGACY = 'dreams_db';

// --- fake storage -----------------------------------------------------------

function makeStorage(initial, opts) {
    opts = opts || {};
    const data = new Map(Object.entries(initial || {}));
    return {
        _data: data,
        getItem(k) {
            if (opts.throwOnGet) {
                const e = opts.throwOnGet === true ? new Error('denied') : opts.throwOnGet;
                throw e;
            }
            return data.has(k) ? data.get(k) : null;
        },
        setItem(k, v) {
            if (opts.throwOnSet) {
                const e = opts.throwOnSet === true ? new Error('boom') : opts.throwOnSet;
                throw e;
            }
            data.set(k, String(v));
        },
        removeItem(k) {
            data.delete(k);
        }
    };
}

function quotaError() {
    return new DOMException('quota exceeded', 'QuotaExceededError');
}

function securityError() {
    return new DOMException('denied', 'SecurityError');
}

// --- fixtures ---------------------------------------------------------------

const LEGACY_DREAM = {
    id: 'dream-1',
    title: 'Мечта с русским текстом 💖',
    category: 'travel',
    year: 2027,
    desc: 'Описание на русском языке',
    imageUrl: 'dbimage:img-abc-123',
    milestones: [
        { id: 'm1', text: 'Первый шаг', checked: true },
        { id: 'm2', text: 'Второй шаг 🚀', checked: false }
    ],
    status: 'active',
    canvasPos: { x: 2350, y: 2200, width: 320, height: 420 },
    gratitudeNote: 'Благодарю за этот день ✨'
};

const LEGACY_JSON = JSON.stringify([LEGACY_DREAM]);

const DEFAULTS = [
    { id: 'd1', title: 'Дефолт 1', category: 'career', year: 2027, desc: 'x', imageUrl: 'a.png', milestones: [], status: 'active', canvasPos: { x: 1, y: 2, width: 320, height: 420 }, gratitudeNote: '' },
    { id: 'd2', title: 'Дефолт 2', category: 'wealth', year: 2026, desc: 'y', imageUrl: 'b.png', milestones: [], status: 'active', canvasPos: { x: 3, y: 4, width: 320, height: 420 }, gratitudeNote: '' }
];
const DEFAULTS_SNAPSHOT = JSON.stringify(DEFAULTS);

function makeValidState(dreams) {
    return {
        schemaVersion: 2,
        appVersion: 'v14',
        savedAt: '2026-08-25T00:00:00.000Z',
        dreams: dreams || [],
        settings: {},
        uiState: {}
    };
}

// --- тесты ------------------------------------------------------------------

test('1. Пустое хранилище → defaults', () => {
    const storage = makeStorage({});
    const res = Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(res.source, 'defaults');
    assert.strictEqual(res.shouldPersist, true);
    assert.deepStrictEqual(res.dreams, DEFAULTS);
    assert.deepStrictEqual(res.warnings, []);
});

test('2. Корректный legacy dreams_db → миграция schemaVersion 2', () => {
    const storage = makeStorage({ [KEY_LEGACY]: LEGACY_JSON });
    const res = Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(res.source, 'legacy');
    assert.strictEqual(res.shouldPersist, true);
    assert.strictEqual(res.legacyPreserved, true);
    assert.strictEqual(res.dreams.length, 1);
    assert.strictEqual(res.dreams[0].title, 'Мечта с русским текстом 💖');
    assert.strictEqual(res.dreams[0].gratitudeNote, 'Благодарю за этот день ✨');
    assert.strictEqual(res.dreams[0].imageUrl, 'dbimage:img-abc-123');
});

test('3. Legacy-строка после миграции не изменилась (байт-в-байт)', () => {
    const storage = makeStorage({ [KEY_LEGACY]: LEGACY_JSON });
    Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(storage.getItem(KEY_LEGACY), LEGACY_JSON);
});

test('4. Корректный primary v2 → нормальная загрузка', () => {
    const state = makeValidState([LEGACY_DREAM]);
    const storage = makeStorage({ [KEY_PRIMARY]: JSON.stringify(state) });
    const res = Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(res.source, 'primary');
    assert.strictEqual(res.shouldPersist, false);
    assert.strictEqual(res.dreams.length, 1);
    assert.strictEqual(res.dreams[0].id, 'dream-1');
});

test('5. Повреждённый primary + корректный recovery → recovery', () => {
    const state = makeValidState([LEGACY_DREAM]);
    const storage = makeStorage({
        [KEY_PRIMARY]: '{corrupted json!!!',
        [KEY_RECOVERY]: JSON.stringify(state)
    });
    const res = Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(res.source, 'recovery');
    assert.strictEqual(res.shouldPersist, true);
    assert.deepStrictEqual(res.warnings, ['primary-corrupt']);
    assert.strictEqual(res.dreams[0].title, 'Мечта с русским текстом 💖');
});

test('6. Повреждённые primary/recovery + корректный legacy → legacy', () => {
    const storage = makeStorage({
        [KEY_PRIMARY]: '{{{',
        [KEY_RECOVERY]: 'not-json',
        [KEY_LEGACY]: LEGACY_JSON
    });
    const res = Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(res.source, 'legacy');
    assert.strictEqual(res.dreams.length, 1);
    assert.deepStrictEqual(res.warnings, ['primary-corrupt', 'recovery-corrupt']);
});

test('7. Все источники повреждены → контролируемый fallback без исключения', () => {
    const storage = makeStorage({
        [KEY_PRIMARY]: '{{{',
        [KEY_RECOVERY]: '!!!',
        [KEY_LEGACY]: '###'
    });
    let res;
    assert.doesNotThrow(() => {
        res = Storage.load(storage, { defaultDreams: DEFAULTS });
    });
    assert.strictEqual(res.source, 'defaults');
    assert.strictEqual(res.shouldPersist, false); // повреждённые строки не перезаписываем
    assert.deepStrictEqual(res.dreams, DEFAULTS);
    assert.ok(res.warnings.includes('primary-corrupt'));
    assert.ok(res.warnings.includes('recovery-corrupt'));
    assert.ok(res.warnings.includes('legacy-corrupt'));
    // Повреждённые строки остаются на месте.
    assert.strictEqual(storage.getItem(KEY_PRIMARY), '{{{');
    assert.strictEqual(storage.getItem(KEY_RECOVERY), '!!!');
    assert.strictEqual(storage.getItem(KEY_LEGACY), '###');
});

test('8. schemaVersion выше 2 → защита от перезаписи', () => {
    const newer = makeValidState([]);
    newer.schemaVersion = 3;
    const storage = makeStorage({ [KEY_PRIMARY]: JSON.stringify(newer) });

    // Загрузка: режим защиты, никакого сохранения.
    const res = Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(res.source, 'protected');
    assert.strictEqual(res.protected, true);
    assert.strictEqual(res.shouldPersist, false);

    // Сохранение старым кодом запрещено.
    const saveRes = Storage.save(storage, DEFAULTS);
    assert.strictEqual(saveRes.ok, false);
    assert.strictEqual(saveRes.error, 'newer-schema-protected');
    assert.strictEqual(storage.getItem(KEY_PRIMARY), JSON.stringify(newer));
    assert.strictEqual(storage.getItem(KEY_RECOVERY), null);
});

test('9. QuotaExceededError при записи → структурированная ошибка, без падения', () => {
    const storage = makeStorage({}, { throwOnSet: quotaError() });
    const res = Storage.save(storage, DEFAULTS);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'quota');
    assert.strictEqual(storage.getItem(KEY_PRIMARY), null);
});

test('10. SecurityError / недоступный storage → контролируемая ошибка', () => {
    // SecurityError на setItem.
    const s1 = makeStorage({}, { throwOnSet: securityError() });
    const r1 = Storage.save(s1, DEFAULTS);
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.error, 'security');

    // SecurityError на getItem (недоступный storage) → load отдаёт defaults.
    const s2 = makeStorage({}, { throwOnGet: securityError() });
    const r2 = Storage.load(s2, { defaultDreams: DEFAULTS });
    assert.strictEqual(r2.source, 'defaults');
    assert.strictEqual(r2.shouldPersist, false);
    assert.ok(r2.warnings.includes('storage-unavailable'));

    // null storage → save контролируемо ошибается.
    const r3 = Storage.save(null, DEFAULTS);
    assert.strictEqual(r3.ok, false);
    assert.strictEqual(r3.error, 'storage-unavailable');

    // null storage → load отдаёт defaults.
    const r4 = Storage.load(null, { defaultDreams: DEFAULTS });
    assert.strictEqual(r4.source, 'defaults');
    assert.strictEqual(r4.shouldPersist, false);
});

test('11. Round-trip: русский, emoji, milestones, gratitudeNote, canvasPos, dbimage:*', () => {
    const storage = makeStorage({});
    const saveRes = Storage.save(storage, [LEGACY_DREAM]);
    assert.strictEqual(saveRes.ok, true);

    const stored = JSON.parse(storage.getItem(KEY_PRIMARY));
    assert.strictEqual(stored.schemaVersion, 2);
    assert.strictEqual(stored.appVersion, 'v14');
    assert.strictEqual(typeof stored.savedAt, 'string');
    assert.deepStrictEqual(stored.dreams[0], {
        id: 'dream-1',
        title: 'Мечта с русским текстом 💖',
        category: 'travel',
        year: 2027,
        desc: 'Описание на русском языке',
        imageUrl: 'dbimage:img-abc-123',
        milestones: [
            { id: 'm1', text: 'Первый шаг', checked: true },
            { id: 'm2', text: 'Второй шаг 🚀', checked: false }
        ],
        status: 'active',
        canvasPos: { x: 2350, y: 2200, width: 320, height: 420 },
        gratitudeNote: 'Благодарю за этот день ✨'
    });

    const res = Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(res.source, 'primary');
    assert.strictEqual(res.dreams[0].gratitudeNote, 'Благодарю за этот день ✨');
    assert.strictEqual(res.dreams[0].imageUrl, 'dbimage:img-abc-123');
    assert.strictEqual(res.dreams[0].milestones.length, 2);
});

test('12. Null, NaN/Infinity и неправильные типы не вызывают падение', () => {
    const messy = [
        null,
        42,
        'string',
        { title: null },
        { title: 123 },
        { title: 'ok', id: null, category: 7, status: 'weird', year: 'x', desc: null, imageUrl: null, gratitudeNote: null, canvasPos: { x: NaN, y: Infinity, width: 'w', height: -5 }, milestones: [null, 'str', { text: 5 }, { id: 'm1', text: 'ок', checked: 'yes' }] },
        { title: 'Эмодзи 🎉', gratitudeNote: '💖', imageUrl: 'dbimage:z', milestones: [{ text: 'm', checked: true }] }
    ];
    const storage = makeStorage({ [KEY_LEGACY]: JSON.stringify(messy) });
    let res;
    assert.doesNotThrow(() => {
        res = Storage.load(storage, { defaultDreams: DEFAULTS });
    });
    assert.strictEqual(res.source, 'legacy');
    assert.strictEqual(res.dreams.length, 2);

    const ok = res.dreams.find(d => d.title === 'ok');
    assert.ok(ok);
    assert.strictEqual(typeof ok.id, 'string');
    assert.ok(ok.id.length > 0);
    assert.strictEqual(ok.category, 'career'); // не-строка → дефолт
    assert.strictEqual(ok.status, 'active');
    assert.strictEqual(ok.year, null);
    assert.strictEqual(ok.desc, '');
    assert.strictEqual(ok.gratitudeNote, '');
    assert.ok(Number.isFinite(ok.canvasPos.x));
    assert.ok(Number.isFinite(ok.canvasPos.y));
    assert.ok(Number.isFinite(ok.canvasPos.width));
    assert.ok(Number.isFinite(ok.canvasPos.height));
    assert.strictEqual(ok.milestones.length, 2); // {text:5} сохранён с пустым текстом, {id:'m1'} сохранён
    assert.strictEqual(ok.milestones[0].text, '');
    assert.strictEqual(ok.milestones[1].id, 'm1');
    assert.strictEqual(ok.milestones[1].checked, false);

    const emoji = res.dreams.find(d => d.title === 'Эмодзи 🎉');
    assert.ok(emoji);
    assert.strictEqual(emoji.gratitudeNote, '💖');
    assert.strictEqual(emoji.imageUrl, 'dbimage:z');

    // NaN/Infinity в объекте при сохранении тоже не роняют.
    const s2 = makeStorage({});
    assert.doesNotThrow(() => Storage.save(s2, [{ title: 'NaN-цель', year: NaN, canvasPos: { x: NaN, y: Infinity, width: Infinity, height: NaN } }]));
    const reloaded = Storage.load(s2, { defaultDreams: DEFAULTS });
    assert.strictEqual(reloaded.dreams[0].year, null);
    assert.ok(Number.isFinite(reloaded.dreams[0].canvasPos.x));
});

test('13. Recovery действительно содержит предыдущее корректное primary', () => {
    const storage = makeStorage({});
    const dreamA = { ...LEGACY_DREAM, id: 'a', title: 'Цель A' };
    const dreamB = { ...LEGACY_DREAM, id: 'b', title: 'Цель B' };

    assert.strictEqual(Storage.save(storage, [dreamA]).ok, true);
    const firstPrimary = storage.getItem(KEY_PRIMARY);
    assert.strictEqual(storage.getItem(KEY_RECOVERY), null);

    assert.strictEqual(Storage.save(storage, [dreamB]).ok, true);
    assert.strictEqual(storage.getItem(KEY_RECOVERY), firstPrimary); // байт-в-байт
    const secondPrimary = storage.getItem(KEY_PRIMARY);
    assert.notStrictEqual(secondPrimary, firstPrimary);
    assert.ok(JSON.parse(secondPrimary).dreams[0].title === 'Цель B');
    assert.ok(JSON.parse(firstPrimary).dreams[0].title === 'Цель A');
});

test('14. DEFAULT_DREAMS не мутируются через загруженное состояние', () => {
    const storage = makeStorage({});
    const res = Storage.load(storage, { defaultDreams: DEFAULTS });
    assert.strictEqual(res.source, 'defaults');
    assert.strictEqual(JSON.stringify(DEFAULTS), DEFAULTS_SNAPSHOT);

    assert.strictEqual(Storage.save(storage, DEFAULTS).ok, true);
    assert.strictEqual(JSON.stringify(DEFAULTS), DEFAULTS_SNAPSHOT);

    // Загрузка из legacy тоже не мутирует источник.
    const s2 = makeStorage({ [KEY_LEGACY]: LEGACY_JSON });
    Storage.load(s2, { defaultDreams: DEFAULTS });
    assert.strictEqual(JSON.stringify(DEFAULTS), DEFAULTS_SNAPSHOT);
});

// --- дополнительные проверки схемы ------------------------------------------

test('prototype pollution: __proto__/constructor не проходят в state', () => {
    const evil = JSON.parse('{"schemaVersion":2,"appVersion":"v14","savedAt":"x","dreams":[{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted2":1}},"title":"ok","id":"safe"}],"settings":{"__proto__":{"x":1}},"uiState":{}}');
    const norm = Storage.normalizeState(evil);
    assert.strictEqual(norm.ok, true);
    const dream = norm.state.dreams[0];
    assert.strictEqual(Object.prototype.hasOwnProperty.call(dream, '__proto__'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(dream, 'constructor'), false);
    assert.strictEqual(dream.polluted, undefined);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(norm.state.settings, '__proto__'), false);
    assert.strictEqual({}.polluted, undefined);
});
