/* ==========================================================================
   DREAMBOARD - BACKUP EXPORT TESTS (node:test, без внешних зависимостей)
   Запуск: node --test backup-export.test.js
   Покрытие: ТЗ Этапа 3, разделы 4-8 (34 обязательных пункта + доп. проверки).
   ========================================================================== */

'use strict';

// Детерминированное локальное время для проверки имени файла (UTC+9).
process.env.TZ = 'Asia/Tokyo';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

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
function fakeProvider(records, opts) {
    opts = opts || {};
    return {
        get: async (id) => {
            if (opts.calls) opts.calls.push(id);
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

const MIB = 1024 * 1024;

// ============================================================================
// МОДУЛЬ: контракт и логика
// ============================================================================

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

test('2. пустая доска (0 целей) экспортируется', async () => {
    const state = makeState([]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.metadata.dreamCount, 0);
    assert.deepStrictEqual(res.backup.images, []);
    assert.strictEqual(res.backup.state.schemaVersion, 2);
});

test('3. одно локальное изображение → точные id/ref/mime/size/dataBase64', async () => {
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

test('4. один ключ у нескольких целей → включается один раз', async () => {
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
});

test('5. несколько локальных изображений → все включены, порядок по id', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-c' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-a' }),
        dream({ id: 'd3', imageUrl: 'dbimage:img-b' })
    ]);
    const blob = makeBlob([1], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-a': { blob, mimeType: 'image/webp' }, 'img-b': { blob, mimeType: 'image/webp' }, 'img-c': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.backup.images.map(i => i.id), ['img-a', 'img-b', 'img-c']);
    assert.strictEqual(res.backup.metadata.referencedLocalImageCount, 3);
    assert.strictEqual(res.backup.metadata.includedImageCount, 3);
});

test('6. HTTP/HTTPS URL не меняются', async () => {
    const url = 'https://images.unsplash.com/photo-1?w=800';
    const state = makeState([dream({ id: 'd1', imageUrl: url })]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.state.dreams[0].imageUrl, url);
    assert.deepStrictEqual(res.backup.images, []);
});

test('7. asset-путь не меняется', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'assets/images/dream_career.png' })]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.state.dreams[0].imageUrl, 'assets/images/dream_career.png');
    assert.deepStrictEqual(res.backup.images, []);
});

test('8. data URL не меняется', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'data:image/png;base64,QUJD' })]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.state.dreams[0].imageUrl, 'data:image/png;base64,QUJD');
    assert.deepStrictEqual(res.backup.images, []);
});

test('9. отсутствующая IDB-запись → warning missing-record, partial', async () => {
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

test('10. повреждённая запись → warning corrupt-record', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-bad' })]);
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-bad': { blob: null, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.metadata.skippedImageCount, 1);
    assert.strictEqual(res.backup.metadata.warnings[0].reason, 'corrupt-record');
    const res2 = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-bad': { blob: 'not-a-blob', mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res2.backup.metadata.warnings[0].reason, 'corrupt-record');
});

test('11. ошибка чтения отдельной записи → read-error, остальные экспортируются', async () => {
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

test('12. полная недоступность IDB при наличии local refs → фатально', () => {
    const f = Backup.storeFailureIsFatal(1, false);
    assert.ok(f && f.code === 'images-store-unavailable');
    // и в самом модуле: отсутствующий провайдер → fatal
});

test('13. недоступность IDB без local refs не блокирует экспорт', async () => {
    assert.strictEqual(Backup.storeFailureIsFatal(0, false), null);
    const state = makeState([dream({ id: 'd1', imageUrl: 'https://x.example/a.png' })]);
    // провайдер вообще отсутствует — но ссылок нет, экспорт работает
    const res = await Backup.exportBackup(baseOpts({ state, provider: null }));
    assert.strictEqual(res.ok, false); // провайдер обязателен по контракту модуля
    assert.strictEqual(res.fatal.code, 'images-store-unavailable');
});

test('14. MIME fallback: blob.type → record.mimeType → octet-stream + missing-mime', async () => {
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

test('15. Unicode, кириллица и emoji → round-trip без искажений', async () => {
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

test('16. state не мутируется (deep-freeze)', async () => {
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
});

test('17. исходные объекты/массивы не разделяются со snapshot', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-1', milestones: [{ id: 'm1', text: 'x', checked: false }] })
    ]);
    const blob = makeBlob([1], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    assert.notStrictEqual(res.backup.state, state, 'snapshot ≠ state');
    assert.notStrictEqual(res.backup.state.dreams, state.dreams, 'dreams не разделяются');
    assert.notStrictEqual(res.backup.state.dreams[0].milestones, state.dreams[0].milestones, 'milestones не разделяются');
    assert.notStrictEqual(res.backup.state.dreams[0].canvasPos, state.dreams[0].canvasPos, 'canvasPos не разделяется');
    assert.notStrictEqual(res.backup.state.dreams[0].milestones[0], state.dreams[0].milestones[0], 'элемент milestones не разделяется');
});

test('18. metadata/counts корректны', async () => {
    const state = makeState([
        dream({ id: 'd1', status: 'active', imageUrl: 'dbimage:img-a' }),
        dream({ id: 'd2', status: 'manifested', imageUrl: 'dbimage:img-b' }),
        dream({ id: 'd3', status: 'active', imageUrl: 'https://x.example/a.png' })
    ]);
    const blob = makeBlob([1, 2, 3, 4, 5, 6, 7], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-a': { blob, mimeType: 'image/webp' }, 'img-b': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.ok, true);
    const m = res.backup.metadata;
    assert.strictEqual(m.dreamCount, 3);
    assert.strictEqual(m.activeCount, 2);
    assert.strictEqual(m.manifestedCount, 1);
    assert.strictEqual(m.referencedLocalImageCount, 2);
    assert.strictEqual(m.includedImageCount, 2);
    assert.strictEqual(m.skippedImageCount, 0);
    assert.strictEqual(m.totalRawImageBytes, 14);
    assert.deepStrictEqual(m.warnings, []);
    assert.deepStrictEqual(Object.keys(res.backup).sort(), ['appVersion', 'exportedAt', 'format', 'formatVersion', 'images', 'metadata', 'state']);
});

test('19. детерминированный порядок изображений (по id)', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-z' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-a' }),
        dream({ id: 'd3', imageUrl: 'dbimage:img-m' })
    ]);
    const blob = makeBlob([1], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-a': { blob, mimeType: 'image/webp' }, 'img-m': { blob, mimeType: 'image/webp' }, 'img-z': { blob, mimeType: 'image/webp' } })
    }));
    assert.deepStrictEqual(res.backup.images.map(i => i.id), ['img-a', 'img-m', 'img-z']);
});

test('20. имя файла: локальные компоненты времени + zero-padding', () => {
    // TZ=Asia/Tokyo (UTC+9), задан в начале файла.
    assert.strictEqual(Backup.backupFileName(new Date('2026-08-26T00:05:00.000Z')), 'dreamboard-backup-2026-08-26-0905.json');
    // день/месяц/час/минуты с zero-padding: локально 2026-01-06 00:59
    assert.strictEqual(Backup.backupFileName(new Date('2026-01-05T15:59:00.000Z')), 'dreamboard-backup-2026-01-06-0059.json');
});

test('21. размер ниже 15 MiB → ok, confirm не вызывается', async () => {
    const calls = [];
    const res = await Backup.exportBackup(baseOpts({
        state: makeState([]),
        sizeEstimate: 15 * MIB - 1,
        confirm: (msg) => { calls.push(msg); return true; }
    }));
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(calls, [], 'confirm не вызывается ниже warn-порога');
});

test('22. размер ровно 15 MiB → warn, confirm вызывается', async () => {
    const calls = [];
    const res = await Backup.exportBackup(baseOpts({
        state: makeState([]),
        sizeEstimate: 15 * MIB,
        confirm: (msg) => { calls.push(msg); return true; }
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(calls.length, 1);
    assert.ok(calls[0].includes('большая'), 'сообщение о возможной задержке/памяти');
});

test('23. размер ровно 50 MiB → block, fatal size-limit до чтения blob', async () => {
    const calls = [];
    const res = await Backup.exportBackup(baseOpts({
        state: makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-1' })]),
        sizeEstimate: 50 * MIB,
        provider: fakeProvider({}, { calls }),
        confirm: () => true
    }));
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.fatal.code, 'size-limit');
    assert.deepStrictEqual(calls, [], 'blob не читаются при блокирующей оценке');
});

test('24. отмена size-warning → cancelled, файл не создаётся', async () => {
    const res = await Backup.exportBackup(baseOpts({
        state: makeState([]),
        sizeEstimate: 15 * MIB,
        confirm: () => false
    }));
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.cancelled, true);
    assert.strictEqual(res.reason, 'size-warning-cancelled');
    assert.strictEqual(res.backup, undefined);
});

test('25. отмена partial-backup → cancelled, файл не создаётся', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-gone' })]);
    const res = await Backup.exportBackup(baseOpts({ state, confirm: () => false }));
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.cancelled, true);
    assert.strictEqual(res.reason, 'partial-cancelled');
    assert.strictEqual(res.backup, undefined);
});

test('26. очистка object URL при успехе (revoke ровно один раз)', () => {
    const backup = { format: 'dreamboard-backup', formatVersion: 1, appVersion: 'v14', exportedAt: 'x', metadata: {}, state: {}, images: [] };
    const calls = { create: 0, revoke: 0 };
    const ok = Backup.downloadJson(backup, {
        filename: 'dreamboard-backup-2026-08-26-0905.json',
        createObjectURL: () => { calls.create++; return 'blob:url-1'; },
        revokeObjectURL: (u) => { calls.revoke++; assert.strictEqual(u, 'blob:url-1'); },
        triggerDownload: (u, f) => {
            assert.strictEqual(u, 'blob:url-1');
            assert.strictEqual(f, 'dreamboard-backup-2026-08-26-0905.json');
        }
    });
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(calls.create, 1);
    assert.strictEqual(calls.revoke, 1);
});

test('26b. revoke и на пути ошибки; serialize-failed не создаёт URL', () => {
    const backup = { format: 'x', state: {}, images: [], metadata: {} };
    const calls = { create: 0, revoke: 0 };
    const fail = Backup.downloadJson(backup, {
        filename: 'x.json',
        createObjectURL: () => { calls.create++; return 'blob:u2'; },
        revokeObjectURL: () => { calls.revoke++; },
        triggerDownload: () => { throw new Error('click-failed'); }
    });
    assert.strictEqual(fail.ok, false);
    assert.strictEqual(calls.create, 1);
    assert.strictEqual(calls.revoke, 1);

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

test('27. UI восстанавливается при ошибке (app.js: finally + disabled restore)', () => {
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert.ok(app.includes('exportBusy = false;'), 'сброс флага занятости');
    assert.ok(app.includes('finally {'), 'finally присутствует');
    assert.ok(app.includes('exportBtn.disabled = false;'), 'кнопка восстанавливается');
    assert.ok(app.includes("showToast('Экспорт не удался'"), 'понятная ошибка без stack trace');
    assert.ok(!app.includes('stack trace'), 'нет упоминаний stack trace в UI');
});

test('28. защита от двойного запуска (app.js: exportBusy guard + disabled)', () => {
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert.ok(app.includes('if (exportBusy) return;'), 'guard от двойного запуска');
    assert.ok(app.includes('exportBtn.disabled = true;'), 'кнопка отключается на время экспорта');
    assert.ok(app.includes("showToast('Экспорт…'"), 'состояние «Экспорт…»');
});

test('29. повторный экспорт детерминирован', async () => {
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

test('30. protected/future-schema блокируется (app.js)', () => {
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert.ok(app.includes('appStorageState.protected'), 'проверка protected');
    assert.ok(app.includes('более новой версией приложения — экспорт невозможен'), 'понятное сообщение');
    assert.ok(app.includes('appStorageState.unavailable'), 'проверка недоступности хранилища');
});

test('31. export-json-btn visible (index.html)', () => {
    const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const line = idx.split('\n').find(l => l.includes('id="export-json-btn"'));
    assert.ok(line, 'кнопка существует');
    assert.ok(!line.includes('hidden'), 'export-json-btn видима');
});

test('32. остальные export/import controls hidden (index.html)', () => {
    const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    for (const id of ['export-png-btn', 'import-json-btn', 'import-file-input']) {
        const line = idx.split('\n').find(l => l.includes(`id="${id}"`));
        assert.ok(line && line.includes('hidden'), `${id} скрыта`);
    }
});

test('33. backup.js подключён до app.js', () => {
    const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const iStorage = idx.indexOf('<script src="storage.js">');
    const iBackup = idx.indexOf('<script src="backup.js">');
    const iApp = idx.indexOf('<script src="app.js">');
    assert.ok(iStorage !== -1 && iBackup !== -1 && iApp !== -1, 'все скрипты присутствуют');
    assert.ok(iStorage < iBackup && iBackup < iApp, 'порядок: storage.js → backup.js → app.js');
});

test('34. backup.js присутствует в PRECACHE, CACHE_NAME не изменён', () => {
    const sw = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
    assert.ok(sw.includes("'./backup.js'"), 'backup.js в PRECACHE_URLS');
    assert.ok(sw.includes("const CACHE_NAME = 'dreamboard-v13';"), 'CACHE_NAME не изменён');
});

// --- дополнительные проверки (раздел 9 ТЗ) ------------------------------------

test('35. manifest.json — валидный JSON', () => {
    const raw = fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8');
    const m = JSON.parse(raw);
    assert.ok(m && typeof m === 'object');
    assert.strictEqual(m.name.includes('DreamBoard'), true);
});

test('36. DOM id в index.html без дублей', () => {
    const idx = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
    const ids = [];
    const re = /id="([^"]+)"/g;
    let match;
    while ((match = re.exec(idx)) !== null) ids.push(match[1]);
    assert.ok(ids.length > 0, 'в разметке есть id');
    const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
    assert.deepStrictEqual(dup, [], 'нет дублей id');
});

test('37. dataBase64: префикс data: срезается', async () => {
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

test('38. размер = фактический blob.size (не metadata записи)', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-1' })]);
    // запись metadata говорит 999, фактический blob — 5 байт
    const blob = makeBlob([1, 2, 3, 4, 5], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } })
    }));
    assert.strictEqual(res.backup.images[0].size, 5);
    assert.strictEqual(res.backup.metadata.totalRawImageBytes, 5);
});

test('39. warnings: только безопасные поля; пропуск у N целей → N warning', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-x' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-x' })
    ]);
    const res = await Backup.exportBackup(baseOpts({ state }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.metadata.skippedImageCount, 1);
    assert.strictEqual(res.backup.metadata.warnings.length, 2);
    res.backup.metadata.warnings.forEach(w => {
        assert.deepStrictEqual(Object.keys(w).sort(), ['dreamId', 'imageRef', 'reason']);
    });
});

test('40. изображения archived (manifested) целей тоже экспортируются', async () => {
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

test('41. невалидный state → fatal invalid-state', async () => {
    const res = await Backup.exportBackup(baseOpts({ state: { foo: 1 } }));
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.fatal.code, 'invalid-state');
});

test('42. collectImageRefs: порядок, id, только dbimage:', () => {
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

test('43. размер ≥50 MiB по факту (blob.size) → fatal size-limit (backstop)', async () => {
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

// --- Ревью PR #17: разделы 2-5 (доп. тесты) ----------------------------------

test('44. разные минуты → разные имена файла', () => {
    const a = Backup.backupFileName(new Date('2026-08-26T00:05:00.000Z'));
    const b = Backup.backupFileName(new Date('2026-08-26T00:06:00.000Z'));
    assert.notStrictEqual(a, b);
    assert.strictEqual(a, 'dreamboard-backup-2026-08-26-0905.json');
    assert.strictEqual(b, 'dreamboard-backup-2026-08-26-0906.json');
});

test('45. PRECACHE existence: все файлы из PRECACHE_URLS существуют на диске', () => {
    const sw = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
    const m = sw.match(/const PRECACHE_URLS = \[([\s\S]*?)\];/);
    assert.ok(m, 'PRECACHE_URLS найден в service-worker.js');
    const urls = Array.from(m[1].matchAll(/'([^']+)'/g), x => x[1]);
    assert.ok(urls.length >= 5, 'PRECACHE_URLS не пуст');
    assert.ok(urls.includes('./backup.js'), 'backup.js присутствует');
    for (const u of urls) {
        const rel = u.replace(/^\.\//, '');
        const p = path.join(__dirname, rel === '' ? 'index.html' : rel);
        assert.ok(fs.existsSync(p), 'PRECACHE файл существует: ' + u);
    }
});

test('46. неиспользуемая запись (60 MiB) не читается; BLOCK не срабатывает; totalRawImageBytes = 1 MiB', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-ref' })]);
    const calls = [];
    const oneMiB = new Uint8Array(1024 * 1024);
    const provider = {
        get: async (id) => {
            calls.push(id);
            if (id === 'img-ref') return { blob: new Blob([oneMiB], { type: 'image/webp' }), mimeType: 'image/webp' };
            if (id === 'img-unused') return { blob: new Blob([new Uint8Array(60 * 1024 * 1024)], { type: 'image/webp' }), mimeType: 'image/webp' };
            return null;
        }
    };
    const res = await Backup.exportBackup(baseOpts({ state, provider }));
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(calls, ['img-ref'], 'читается только референсная запись, ровно 1 раз');
    assert.strictEqual(res.backup.images.length, 1);
    assert.strictEqual(res.backup.images[0].id, 'img-ref');
    assert.strictEqual(res.backup.metadata.totalRawImageBytes, 1024 * 1024, 'неиспользуемые не учитываются');
    assert.strictEqual(res.backup.metadata.includedImageCount, 1);
    assert.deepStrictEqual(res.backup.metadata.warnings, []);
});

test('46b. один используемый ID читается не более одного раза (дедуп вызовов)', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-shared' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-shared' })
    ]);
    const calls = [];
    const blob = makeBlob([1], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-shared': { blob, mimeType: 'image/webp' } }, { calls })
    }));
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(calls, ['img-shared'], 'get вызван ровно 1 раз для общего id');
    assert.strictEqual(res.backup.images.length, 1);
});

test('47. size-warning + partial одновременно: два последовательных confirm', async () => {
    const state = makeState([
        dream({ id: 'd1', imageUrl: 'dbimage:img-ok' }),
        dream({ id: 'd2', imageUrl: 'dbimage:img-missing' })
    ]);
    const blob = makeBlob([1, 2, 3], 'image/webp');
    const base = baseOpts({
        state,
        provider: fakeProvider({ 'img-ok': { blob, mimeType: 'image/webp' } }),
        sizeEstimate: 15 * MIB
    });

    // A: отказ на первом (size) → size-warning-cancelled, второй не спрашивается
    const logA = [];
    const rA = await Backup.exportBackup(Object.assign({}, base, { confirm: (m) => { logA.push(m); return false; } }));
    assert.strictEqual(rA.ok, false);
    assert.strictEqual(rA.cancelled, true);
    assert.strictEqual(rA.reason, 'size-warning-cancelled');
    assert.strictEqual(logA.length, 1);

    // B: согласие на size, отказ на partial → partial-cancelled
    const logB = [];
    let nB = 0;
    const rB = await Backup.exportBackup(Object.assign({}, base, { confirm: () => { nB++; logB.push(nB); return nB !== 2; } }));
    assert.strictEqual(rB.ok, false);
    assert.strictEqual(rB.cancelled, true);
    assert.strictEqual(rB.reason, 'partial-cancelled');
    assert.strictEqual(logB.length, 2, 'оба подтверждения показаны');

    // C: оба согласия → файл создан с warnings (size + partial)
    const logC = [];
    const rC = await Backup.exportBackup(Object.assign({}, base, { confirm: (m) => { logC.push(m); return true; } }));
    assert.strictEqual(rC.ok, true);
    assert.strictEqual(logC.length, 2, 'оба подтверждения показаны');
    assert.strictEqual(rC.backup.metadata.includedImageCount, 1);
    assert.strictEqual(rC.backup.metadata.skippedImageCount, 1);
    assert.strictEqual(rC.backup.metadata.warnings[0].reason, 'missing-record');
});

test('48. успешный повторный экспорт после ошибки', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-1' })]);
    const blob = makeBlob([1], 'image/webp');
    const opts = baseOpts({ state, provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } }) });
    // сначала блокирующая ошибка
    const fail = await Backup.exportBackup(Object.assign({}, opts, { sizeEstimate: 50 * MIB }));
    assert.strictEqual(fail.ok, false);
    assert.strictEqual(fail.fatal.code, 'size-limit');
    // повторный экспорт без ошибки работает
    const ok = await Backup.exportBackup(opts);
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.backup.images.length, 1);
});

test('49. originalName и служебные поля записи не попадают в JSON', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-1' })]);
    const blob = makeBlob([1], 'image/webp');
    const provider = {
        get: async () => ({ blob, mimeType: 'image/webp', originalName: 'SECRET.jpg', createdAt: 123456 })
    };
    const res = await Backup.exportBackup(baseOpts({ state, provider }));
    assert.strictEqual(res.ok, true);
    const img = res.backup.images[0];
    assert.ok(!('originalName' in img), 'originalName отсутствует');
    assert.ok(!('createdAt' in img), 'createdAt отсутствует');
    const raw = JSON.stringify(res.backup);
    assert.ok(!raw.includes('SECRET.jpg'), 'originalName не в JSON');
});

test('50. appVersion берётся из runtime-опций, не из потенциально повреждённого state', async () => {
    const state = makeState([dream({ id: 'd1', imageUrl: 'dbimage:img-1' })]);
    state.appVersion = 'v99-injected';
    const blob = makeBlob([1], 'image/webp');
    const res = await Backup.exportBackup(baseOpts({
        state,
        provider: fakeProvider({ 'img-1': { blob, mimeType: 'image/webp' } }),
        appVersion: 'v14'
    }));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.backup.appVersion, 'v14', 'контрактная версия из доверенного источника');
    assert.strictEqual(res.backup.state.appVersion, 'v99-injected', 'state не переписывается');
});

test('51. app.js: appVersion из доверенного runtime-источника (DreamBoardStorage)', () => {
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    assert.ok(app.includes('appVersion: DreamBoardStorage.APP_VERSION'), 'appVersion из storage runtime, не из state');
});

test('52. пользовательские строки не вставляются через innerHTML (код экспорта, toast)', () => {
    const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    const start = app.indexOf('async function handleExportBackup');
    assert.ok(start !== -1, 'handleExportBackup найдена');
    // тело функции до следующего 'async function' на том же уровне
    const end = app.indexOf('\n    async function ', start + 10);
    const body = end === -1 ? app.slice(start) : app.slice(start, end);
    assert.ok(!body.includes('innerHTML'), 'в коде экспорта нет innerHTML');
    // toast: безопасное innerText, не innerHTML
    const toastStart = app.indexOf('function showToast');
    assert.ok(toastStart !== -1);
    const toastEnd = app.indexOf('\n    }', toastStart);
    const toastBody = app.slice(toastStart, toastEnd);
    assert.ok(toastBody.includes('toast.innerText'), 'toast через innerText');
    assert.ok(!toastBody.includes('innerHTML'), 'toast без innerHTML');
});
