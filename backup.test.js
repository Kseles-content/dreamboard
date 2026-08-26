/* ==========================================================================
   DREAMBOARD - BACKUP EXPORT TESTS (node:test, без внешних зависимостей)
   Запуск: node --test backup.test.js
   ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const Backup = require('./backup.js');

// --- helpers ---------------------------------------------------------------

function makeState(dreams) {
    return {
        schemaVersion: 2,
        appVersion: 'v14',
        savedAt: '2026-08-26T00:00:00.000Z',
        dreams: dreams,
        settings: {},
        uiState: {}
    };
}

function dream(overrides) {
    return Object.assign({
        id: 'dream-1',
        title: 'Цель',
        category: 'travel',
        year: 2026,
        desc: '',
        imageUrl: '',
        milestones: [],
        status: 'active',
        canvasPos: { x: 0, y: 0, width: 320, height: 420 },
        gratitudeNote: ''
    }, overrides);
}

function makeBlob(bytes, type) {
    return new Blob([new Uint8Array(bytes)], type ? { type: type } : {});
}

// records: { [id]: { blob, mimeType } | null | { error: true } }
function fakeProvider(records) {
    return {
        get: async (id) => {
            if (Object.prototype.hasOwnProperty.call(records, id)) {
                const r = records[id];
                if (r && r.error) throw new Error('boom');
                return r;
            }
            return null; // запись отсутствует
        }
    };
}

function fakeToBase64(blob) {
    return Promise.resolve('BASE64:' + blob.size);
}

function freezeDeep(v) {
    if (v && typeof v === 'object') {
        Object.keys(v).forEach(k => freezeDeep(v[k]));
        Object.freeze(v);
    }
    return v;
}

const NOW = new Date('2026-08-26T00:00:00.000Z');

function baseOpts(extra) {
    return Object.assign({
        provider: fakeProvider({}),
        toBase64: fakeToBase64,
        appVersion: 'v14',
        now: NOW
    }, extra);
}

// --- тесты ------------------------------------------------------------------

test('1. state без изображений → пустой images, корректные counts', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: '' }),
        dream({ id: 'd2', imageUrl: 'https://images.unsplash.com/photo-1?w=800' })
    ]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.format, 'dreamboard-backup');
    assert.strictEqual(res.backup.formatVersion, 1);
    assert.strictEqual(res.backup.appVersion, 'v14');
    assert.strictEqual(res.backup.exportedAt, '2026-08-26T00:00:00.000Z');
    assert.deepStrictEqual(res.backup.images, []);
    assert.strictEqual(res.backup.metadata.dreamCount, 2);
    assert.strictEqual(res.backup.metadata.activeCount, 2);
    assert.strictEqual(res.backup.metadata.manifestedCount, 0);
    assert.strictEqual(res.backup.metadata.referencedLocalImageCount, 0);
    assert.strictEqual(res.backup.metadata.includedImageCount, 0);
    assert.strictEqual(res.backup.metadata.skippedImageCount, 0);
    assert.deepStrictEqual(res.backup.metadata.warnings, []);
    assert.strictEqual(res.backup.state.schemaVersion, 2);
});

test('2. одно локальное изображение → точные id/ref/mime/size/dataBase64', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-1' })]);
    const blob = makeBlob([1, 2, 3, 4], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.images.length, 1);
    const img = res.backup.images[0];
    assert.strictEqual(img.id, 'img-1');
    assert.strictEqual(img.ref, 'dbimage:img-1');
    assert.strictEqual(img.mimeType, 'image/webp');
    assert.strictEqual(img.size, 4);
    assert.strictEqual(img.dataBase64, 'BASE64:4');
    assert.strictEqual(res.backup.metadata.referencedLocalImageCount, 1);
    assert.strictEqual(res.backup.metadata.includedImageCount, 1);
    assert.strictEqual(res.backup.metadata.totalRawImageBytes, 4);
    assert.strictEqual(res.backup.metadata.skippedImageCount, 0);
});

test('3. повторно используемое изображение экспортируется один раз', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-shared' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-shared' }),
        dream({ id: 'd3', imageUrl: 'dbimage:img-other' })
    ]);
    const blob = makeBlob([9], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-shared': { blob, mimeType: 'image/webp' }, 'img-other': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.images.length, 2);
    assert.strictEqual(res.backup.metadata.referencedLocalImageCount, 2);
    assert.strictEqual(res.backup.metadata.includedImageCount, 2);
    // детерминированный порядок по id
    assert.strictEqual(res.backup.images[0].id, 'img-other');
    assert.strictEqual(res.backup.images[1].id, 'img-shared');
});

test('4. внешние URL / asset-пути / data URL остаются строками в state', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'https://images.unsplash.com/photo-1?w=800' }),
        dream({ id: 'd2', imageUrl: 'assets/images/dream_career.png' }),
        dream({ id: 'd3', imageUrl: 'data:image/png;base64,QUJD' })
    ]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.backup.images, []);
    assert.strictEqual(res.backup.state.dreams[0].imageUrl, 'https://images.unsplash.com/photo-1?w=800');
    assert.strictEqual(res.backup.state.dreams[1].imageUrl, 'assets/images/dream_career.png');
    assert.strictEqual(res.backup.state.dreams[2].imageUrl, 'data:image/png;base64,QUJD');
    assert.strictEqual(res.backup.metadata.referencedLocalImageCount, 0);
});

test('5. отсутствующая запись → warning missing-record, partial', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-gone' })]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.images.length, 0);
    assert.strictEqual(res.backup.metadata.skippedImageCount, 1);
    assert.strictEqual(res.backup.metadata.includedImageCount, 0);
    assert.deepStrictEqual(res.backup.metadata.warnings, [
        { dreamId: 'd1', imageRef: 'dbimage:img-gone', reason: 'missing-record' }
    ]);
});

test('6. повреждённая запись → warning corrupt-record', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-bad' })]);
    // blob: null
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-bad': { blob: null, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.metadata.skippedImageCount, 1);
    assert.strictEqual(res.backup.metadata.warnings[0].reason, 'corrupt-record');
    // blob не Blob
    const res2 = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-bad': { blob: 'not-a-blob', mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res2.backup.metadata.warnings[0].reason, 'corrupt-record');
});

test('7. ошибка чтения одной записи → read-error, остальные экспортируются', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-ok' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-boom' })
    ]);
    const blob = makeBlob([5], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-ok': { blob, mimeType: 'image/webp' }, 'img-boom': { error: true } })
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.images.length, 1);
    assert.strictEqual(res.backup.images[0].id, 'img-ok');
    assert.strictEqual(res.backup.metadata.skippedImageCount, 1);
    assert.strictEqual(res.backup.metadata.warnings[0].reason, 'read-error');
});

test('8. Unicode/emoji проходят round-trip без искажений', async () => {
    const state = makeState([
        dream({ id: 'd1', title: 'Пожить на Бали 🏝️', desc: 'Кириллица: ёж, щука, съел', gratitudeNote: 'Спасибо 💖', imageUrl: 'dbimage:img-u' }),
        dream({ id: 'd2', title: '🎉 Эмодзи', milestones: [{ id: 'm1', text: '🚀', checked: true }] })
    ]);
    const blob = makeBlob([1], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-u': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    const round = JSON.parse(JSON.stringify(res.backup));
    assert.strictEqual(round.state.dreams[0].title, 'Пожить на Бали 🏝️');
    assert.strictEqual(round.state.dreams[0].gratitudeNote, 'Спасибо 💖');
    assert.strictEqual(round.state.dreams[1].milestones[0].text, '🚀');
});

test('9. экспорт не мутирует исходный state (deep-freeze + snapshot)', async () => {
    const state = freezeDeep(makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-1', milestones: [{ id: 'm1', text: 'x', checked: false }] })
    ]));
    const before = JSON.stringify(state);
    const blob = makeBlob([1, 2], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(JSON.stringify(state), before, 'state не изменён');
    assert.notStrictEqual(res.backup.state, state, 'snapshot независим');
});

test('10. имя файла и metadata (фиксированные часы)', async () => {
    assert.strictEqual(Backup.backupFileName(NOW), 'dreamboard-backup-2026-08-26.json');
    const state = makeState([
        dream({ id: 'd1', status: 'active', imageUrl: '' }),
        dream({ id: 'd2', status: 'manifested', imageUrl: 'dbimage:img-1' })
    ]);
    const blob = makeBlob([1, 2, 3, 4, 5, 6, 7], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.exportedAt, '2026-08-26T00:00:00.000Z');
    assert.strictEqual(res.backup.metadata.dreamCount, 2);
    assert.strictEqual(res.backup.metadata.activeCount, 1);
    assert.strictEqual(res.backup.metadata.manifestedCount, 1);
    assert.strictEqual(res.backup.metadata.totalRawImageBytes, 7);
    // контракт: только ожидаемые ключи верхнего уровня
    assert.deepStrictEqual(Object.keys(res.backup).sort(), ['appVersion', 'exportedAt', 'format', 'formatVersion', 'images', 'metadata', 'state']);
});

test('11. скачивание: revoke ровно один раз (включая путь ошибки)', () => {
    const backup = { format: 'dreamboard-backup', formatVersion: 1, appVersion: 'v14', exportedAt: 'x', metadata: {}, state: {}, images: [] };
    const calls = { create: 0, revoke: 0 };

    const ok = Backup.downloadJson(backup, {
        filename: 'dreamboard-backup-2026-08-26.json',
        createObjectURL: () => { calls.create++; return 'blob:url-1'; },
        revokeObjectURL: (u) => { calls.revoke++; assert.strictEqual(u, 'blob:url-1'); },
        triggerDownload: (u, f) => {
            assert.strictEqual(u, 'blob:url-1');
            assert.strictEqual(f, 'dreamboard-backup-2026-08-26.json');
        }
    });
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(calls.create, 1);
    assert.strictEqual(calls.revoke, 1);

    // путь ошибки: triggerDownload бросает → revoke всё равно вызван
    calls.create = 0; calls.revoke = 0;
    const fail = Backup.downloadJson(backup, {
        filename: 'x.json',
        createObjectURL: () => { calls.create++; return 'blob:url-2'; },
        revokeObjectURL: () => { calls.revoke++; },
        triggerDownload: () => { throw new Error('click-failed'); }
    });
    assert.strictEqual(fail.ok, false);
    assert.strictEqual(calls.create, 1);
    assert.strictEqual(calls.revoke, 1);

    // сериализация падает (циклическая ссылка) → URL вообще не создаётся
    calls.create = 0; calls.revoke = 0;
    const circular = { a: null }; circular.a = circular;
    const fail2 = Backup.downloadJson(circular, {
        filename: 'x.json',
        createObjectURL: () => { calls.create++; return 'u'; },
        revokeObjectURL: () => { calls.revoke++; },
        triggerDownload: () => {}
    });
    assert.strictEqual(fail2.ok, false);
    assert.strictEqual(fail2.error, 'serialize-failed');
    assert.strictEqual(calls.create, 0);
    assert.strictEqual(calls.revoke, 0);
});

test('12. повторный экспорт детерминирован', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-1' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-1' }),
        dream({ id: 'd3', imageUrl: 'https://x.example/a.png' })
    ]);
    const blob = makeBlob([3, 1, 4], 'image/webp');
    const opts = baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } })
    });
    const r1 = await Backup.exportBackup(opts);
    const r2 = await Backup.exportBackup(opts);
    assert.strictEqual(r1.ok, true);
    assert.deepStrictEqual(r1.backup, r2.backup);
});

test('13. MIME: blob.type → record.mimeType → octet-stream + missing-mime', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-a' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-b' }),
        dream({ id: 'd3', imageUrl: 'dbimage:img-c' })
    ]);
    const provider = fakeProvider({
        'img-a': { blob: makeBlob([1], 'image/webp'), mimeType: 'image/png' },
        'img-b': { blob: makeBlob([1], ''), mimeType: 'image/png' },
        'img-c': { blob: makeBlob([1], ''), mimeType: '' }
    });
    const res = await Backup.exportBackup(baseOpts({ state, provider }));
    assert.strictEqual(res.ok, true);
    const byId = {};
    res.backup.images.forEach(i => { byId[i.id] = i; });
    assert.strictEqual(byId['img-a'].mimeType, 'image/webp');
    assert.strictEqual(byId['img-b'].mimeType, 'image/png');
    assert.strictEqual(byId['img-c'].mimeType, 'application/octet-stream');
    assert.deepStrictEqual(res.backup.metadata.warnings, [
        { dreamId: 'd3', imageRef: 'dbimage:img-c', reason: 'missing-mime' }
    ]);
    assert.strictEqual(res.backup.metadata.skippedImageCount, 0, 'missing-mime не пропуск');
});

test('14. dataBase64: префикс data: срезается', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-1' })]);
    const blob = makeBlob([1], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } }),
        toBase64: () => Promise.resolve('data:image/webp;base64,QUJD')
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.images[0].dataBase64, 'QUJD');
});

test('15. size policy: warn ≥15MB, block ≥50MB (конфигурируемо)', () => {
    assert.strictEqual(Backup.checkSizePolicy(0, {}).level, 'ok');
    assert.strictEqual(Backup.checkSizePolicy(Backup.DEFAULT_WARN_BYTES - 1, {}).level, 'ok');
    assert.strictEqual(Backup.checkSizePolicy(Backup.DEFAULT_WARN_BYTES, {}).level, 'warn');
    assert.strictEqual(Backup.checkSizePolicy(Backup.DEFAULT_BLOCK_BYTES - 1, {}).level, 'warn');
    assert.strictEqual(Backup.checkSizePolicy(Backup.DEFAULT_BLOCK_BYTES, {}).level, 'block');
    assert.strictEqual(Backup.checkSizePolicy(100, { warnBytes: 50, blockBytes: 200 }).level, 'warn');
    assert.strictEqual(Backup.checkSizePolicy(200, { warnBytes: 50, blockBytes: 200 }).level, 'block');
});

test('16. блокирующий порог в exportBackup → fatal size-limit', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-1' })]);
    const blob = makeBlob(new Array(300).fill(1), 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } }),
        sizePolicy: { warnBytes: 10, blockBytes: 200 }
    }));
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.fatal.code, 'size-limit');
});

test('17. невалидный state / отсутствующий провайдер → fatal', async () => {
    const r1 = await Backup.exportBackup(baseOpts({ state: { foo: 1 } }));
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.fatal.code, 'invalid-state');
    const r2 = await Backup.exportBackup(baseOpts({ state: makeState([]), provider: null }));
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.fatal.code, 'images-store-unavailable');
});

test('18. warnings: только безопасные поля; пропуск у N целей → N warning', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-x' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-x' })
    ]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.metadata.skippedImageCount, 1, 'уникальных пропущенных — 1');
    assert.strictEqual(res.backup.metadata.warnings.length, 2, 'по warning на каждую цель');
    res.backup.metadata.warnings.forEach(w => {
        assert.deepStrictEqual(Object.keys(w).sort(), ['dreamId', 'imageRef', 'reason']);
    });
    assert.deepStrictEqual(res.backup.metadata.warnings[0], { dreamId: 'd1', imageRef: 'dbimage:img-x', reason: 'missing-record' });
});

test('19. изображения archived (manifested) целей тоже экспортируются', async () => {
    const state = makeState([dream({ id: 'd1', status: 'manifested', imageUrl: 'dbimage:img-m' })]);
    const blob = makeBlob([1], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-m': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.images.length, 1);
    assert.strictEqual(res.backup.metadata.manifestedCount, 1);
});

test('20. пустой state (0 целей) → валидный бэкап', async () => {
    const state = makeState([]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.metadata.dreamCount, 0);
    assert.deepStrictEqual(res.backup.images, []);
});

test('21. фатальность недоступности IDB зависит от наличия dbimage-ссылок', () => {
    assert.strictEqual(Backup.storeFailureIsFatal(0, false), null);
    assert.strictEqual(Backup.storeFailureIsFatal(2, true), null);
    const f = Backup.storeFailureIsFatal(1, false);
    assert.ok(f && f.code === 'images-store-unavailable');
});

test('22. collectImageRefs: порядок, id, только dbimage:', () => {
    const refs = Backup.collectImageRefs(makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-b' }),
        dream({ id: 'd2', imageUrl: 'https://x.example/a.png' }),
        dream({ id: 'd3', imageUrl: 'dbimage:img-a' })
    ]));
    assert.deepStrictEqual(refs, [
        { dreamId: 'd1', ref: 'dbimage:img-b', id: 'img-b' },
        { dreamId: 'd3', ref: 'dbimage:img-a', id: 'img-a' }
    ]);
});
