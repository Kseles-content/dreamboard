'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Importer = require('./import.js');
const Storage = require('./storage.js');
const Backup = require('./backup.js');

const WEBP = Uint8Array.from(Buffer.from('RIFF\x04\x00\x00\x00WEBP', 'binary'));
const WEBP_B64 = Buffer.from(WEBP).toString('base64');

function state(imageUrl = '') {
    return {
        schemaVersion: 2,
        appVersion: 'v14',
        savedAt: '2026-08-26T00:00:00.000Z',
        dreams: [{
            id: 'dream-1', title: 'Мечта ✨', category: 'growth', year: 2027,
            desc: 'Описание', imageUrl, milestones: [], status: 'active',
            canvasPos: { x: 0, y: 0, width: 320, height: 420 }, gratitudeNote: ''
        }],
        settings: { theme: 'light' }, uiState: { view: 'grid' }
    };
}

function backup(overrides = {}) {
    return Object.assign({
        format: 'dreamboard-backup', formatVersion: 1, appVersion: 'v14',
        exportedAt: '2026-08-26T00:00:00.000Z', metadata: {}, state: state(), images: []
    }, overrides);
}

function inspect(value, options = {}) {
    return Importer.inspectBackupText(JSON.stringify(value), Object.assign({ normalizeState: Storage.normalizeState }, options));
}

function image(id = 'img-1', bytes = WEBP, mimeType = 'image/webp') {
    return { id, ref: 'dbimage:' + id, mimeType, size: bytes.length, dataBase64: Buffer.from(bytes).toString('base64') };
}

async function materialize(result, ids = ['import-1']) {
    let index = 0;
    return Importer.materializeImport(result.inspected, {
        createId: () => ids[index++],
        decodeBase64: async value => Uint8Array.from(Buffer.from(value, 'base64'))
    });
}

test('accepts a valid empty-board backup', () => {
    const value = backup({ state: Object.assign(state(), { dreams: [] }) });
    const result = inspect(value);
    assert.equal(result.ok, true);
    assert.equal(result.inspected.dreamCount, 0);
});

test('rejects invalid JSON', () => {
    assert.equal(Importer.inspectBackupText('{', { normalizeState: Storage.normalizeState }).error.code, 'invalid-json');
});

test('rejects a non-DreamBoard JSON document', () => {
    assert.equal(inspect({ format: 'other', formatVersion: 1, state: state(), images: [] }).error.code, 'invalid-format');
});

test('rejects future backup format', () => {
    assert.equal(inspect(backup({ formatVersion: 2 })).error.code, 'unsupported-format');
});

test('rejects future state schema', () => {
    assert.equal(inspect(backup({ state: Object.assign(state(), { schemaVersion: 3 }) })).error.code, 'future-schema');
});

test('rejects duplicate dream ids', () => {
    const s = state(); s.dreams.push(structuredClone(s.dreams[0]));
    assert.equal(inspect(backup({ state: s })).error.code, 'duplicate-dream-id');
});

test('rejects oversized files before JSON parsing', () => {
    assert.equal(Importer.inspectBackupText('{}', { fileSize: 11, maxFileBytes: 10, normalizeState: Storage.normalizeState }).error.code, 'file-too-large');
});

test('rejects invalid and noncanonical base64', () => {
    const s = state('dbimage:img-1');
    const bad = image(); bad.dataBase64 = 'abc';
    assert.equal(inspect(backup({ state: s, images: [bad] })).error.code, 'invalid-base64');
});

test('rejects declared image size mismatch', () => {
    const s = state('dbimage:img-1'); const item = image(); item.size++;
    assert.equal(inspect(backup({ state: s, images: [item] })).error.code, 'image-size-mismatch');
});

test('rejects duplicate image entries', () => {
    const s = state('dbimage:img-1');
    assert.equal(inspect(backup({ state: s, images: [image(), image()] })).error.code, 'invalid-image-ref');
});

test('rejects unreferenced embedded images', () => {
    assert.equal(inspect(backup({ images: [image()] })).error.code, 'unreferenced-image');
});

test('detects a partial backup with a missing local image', () => {
    const result = inspect(backup({ state: state('dbimage:img-1') }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.inspected.missingRefs, ['dbimage:img-1']);
});

test('preserves external, asset and data URLs', async () => {
    for (const url of ['https://example.com/a.png', 'assets/images/a.png', 'data:image/png;base64,AA==']) {
        const result = inspect(backup({ state: state(url) }));
        const ready = await materialize(result, []);
        assert.equal(ready.plan.state.dreams[0].imageUrl, url);
    }
});

test('remaps embedded image to a fresh id', async () => {
    const result = inspect(backup({ state: state('dbimage:img-1'), images: [image()] }));
    const ready = await materialize(result);
    assert.equal(ready.ok, true);
    assert.equal(ready.plan.state.dreams[0].imageUrl, 'dbimage:import-1');
    assert.equal(ready.plan.records[0].id, 'import-1');
});

test('remaps missing image ref to a collision-free placeholder ref', async () => {
    const ready = await materialize(inspect(backup({ state: state('dbimage:img-1') })));
    assert.equal(ready.plan.state.dreams[0].imageUrl, 'dbimage:import-1');
    assert.equal(ready.plan.records.length, 0);
    assert.equal(ready.plan.missingImageCount, 1);
});

test('deduplicates a shared image', async () => {
    const s = state('dbimage:img-1');
    s.dreams.push(Object.assign(structuredClone(s.dreams[0]), { id: 'dream-2' }));
    const ready = await materialize(inspect(backup({ state: s, images: [image()] })));
    assert.equal(ready.plan.records.length, 1);
    assert.equal(ready.plan.state.dreams[0].imageUrl, ready.plan.state.dreams[1].imageUrl);
});

test('rejects unsafe generated ids', async () => {
    const result = inspect(backup({ state: state('dbimage:img-1'), images: [image()] }));
    const ready = await Importer.materializeImport(result.inspected, { createId: () => '__proto__', decodeBase64: async () => WEBP });
    assert.equal(ready.error.code, 'unsafe-generated-id');
});

test('rejects SVG and unknown image payloads', async () => {
    const bytes = Uint8Array.from(Buffer.from('<svg></svg>'));
    const result = inspect(backup({ state: state('dbimage:img-1'), images: [image('img-1', bytes, 'image/svg+xml')] }));
    const ready = await materialize(result);
    assert.equal(ready.error.code, 'unsafe-image-type');
});

test('rejects MIME/content mismatch', async () => {
    const result = inspect(backup({ state: state('dbimage:img-1'), images: [image('img-1', WEBP, 'image/png')] }));
    const ready = await materialize(result);
    assert.equal(ready.error.code, 'mime-mismatch');
});

test('rejects HTML-bearing user text before it can reach legacy innerHTML renderers', () => {
    const s = state(); s.dreams[0].title = '<img src=x onerror=alert(1)>';
    assert.equal(inspect(backup({ state: s })).error.code, 'invalid-dream');
});

test('rejects attribute injection in external image URLs and SVG data URLs', () => {
    let s = state('https://example.com/x" onerror="alert(1)');
    assert.equal(inspect(backup({ state: s })).error.code, 'invalid-dream');
    s = state('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=');
    assert.equal(inspect(backup({ state: s })).error.code, 'invalid-dream');
});

test('rejects prototype-pollution ids from JSON', () => {
    const value = backup({ state: state('dbimage:__proto__'), images: [] });
    assert.equal(inspect(value).error.code, 'invalid-dream');
});

test('does not mutate parsed or normalized state', async () => {
    const result = inspect(backup({ state: state('dbimage:img-1'), images: [image()] }));
    const before = JSON.stringify(result.inspected.state);
    await materialize(result);
    assert.equal(JSON.stringify(result.inspected.state), before);
});

test('round-trips the exact Stage 3 export contract into a fresh-ID import plan', async () => {
    const source = state('dbimage:img-1');
    const exported = await Backup.exportBackup({
        state: source,
        provider: { get: async () => ({ blob: new Blob([WEBP], { type: 'image/webp' }), mimeType: 'image/webp' }) },
        toBase64: async () => WEBP_B64,
        appVersion: Storage.APP_VERSION,
        now: new Date('2026-08-26T00:00:00.000Z')
    });
    assert.equal(exported.ok, true);
    const checked = inspect(exported.backup);
    assert.equal(checked.ok, true);
    const ready = await materialize(checked, ['import-roundtrip']);
    assert.equal(ready.ok, true);
    assert.equal(ready.plan.records[0].mimeType, 'image/webp');
    assert.equal(ready.plan.state.dreams[0].imageUrl, 'dbimage:import-roundtrip');
});

test('writes images before state', async () => {
    const calls = [];
    const result = await Importer.applyImport({ records: [{}], createdIds: ['x'], state: state(), dreamCount: 1, imageCount: 1, missingImageCount: 0 }, {
        writeImages: async () => calls.push('images'),
        saveState: async () => { calls.push('state'); return { ok: true }; },
        cleanupImages: async () => calls.push('cleanup')
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ['images', 'state']);
});

test('cleans staged images when state save fails', async () => {
    const calls = [];
    const result = await Importer.applyImport({ records: [{}], createdIds: ['x'], state: state(), dreamCount: 1, imageCount: 1, missingImageCount: 0 }, {
        writeImages: async () => calls.push('images'),
        saveState: async () => ({ ok: false, error: 'quota' }),
        cleanupImages: async ids => calls.push('cleanup:' + ids.join(','))
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'quota');
    assert.deepEqual(calls, ['images', 'cleanup:x']);
});

test('does not clean old data or write state after image transaction failure', async () => {
    const calls = [];
    const result = await Importer.applyImport({ records: [{}], createdIds: ['x'], state: state(), dreamCount: 1, imageCount: 1, missingImageCount: 0 }, {
        writeImages: async () => { throw new Error('quota'); },
        saveState: async () => calls.push('state'),
        cleanupImages: async () => calls.push('cleanup')
    });
    assert.equal(result.ok, false);
    assert.deepEqual(calls, []);
});

test('saveState preserves settings/uiState and writes previous primary to recovery', () => {
    const map = new Map();
    const storage = { getItem: k => map.has(k) ? map.get(k) : null, setItem: (k, v) => map.set(k, v) };
    const old = Storage.createState([]); map.set(Storage.KEY_PRIMARY, JSON.stringify(old));
    const incoming = state();
    const result = Storage.saveState(storage, incoming, { savedAt: '2026-08-26T01:00:00.000Z' });
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(map.get(Storage.KEY_PRIMARY)).settings, incoming.settings);
    assert.deepEqual(JSON.parse(map.get(Storage.KEY_PRIMARY)).uiState, incoming.uiState);
    assert.deepEqual(JSON.parse(map.get(Storage.KEY_RECOVERY)), old);
});

test('saveState refuses future schema without writing', () => {
    let writes = 0;
    const storage = { getItem: () => null, setItem: () => { writes++; } };
    const result = Storage.saveState(storage, Object.assign(state(), { schemaVersion: 3 }));
    assert.equal(result.error, 'newer-schema-protected');
    assert.equal(writes, 0);
});

test('saveState obeys write protection', () => {
    let writes = 0;
    const storage = { getItem: () => null, setItem: () => { writes++; } };
    const result = Storage.saveState(storage, state(), { writeProtected: true });
    assert.equal(result.error, 'write-protected');
    assert.equal(writes, 0);
});

test('browser wiring exposes import button and keeps file input hidden', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const button = html.split('\n').find(line => line.includes('id="import-json-btn"'));
    const input = html.split('\n').find(line => line.includes('id="import-file-input"'));
    assert.ok(button && !button.includes('hidden'));
    assert.ok(input && input.includes('hidden'));
});

test('scripts and precache include import.js before app.js', () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const sw = fs.readFileSync('service-worker.js', 'utf8');
    assert.ok(html.indexOf('src="import.js"') > html.indexOf('src="backup.js"'));
    assert.ok(html.indexOf('src="import.js"') < html.indexOf('src="app.js"'));
    assert.ok(sw.includes("'./import.js'"));
});

test('app import has busy guard, confirmation, recovery save and finally reset', () => {
    const app = fs.readFileSync('app.js', 'utf8');
    assert.ok(app.includes('if (importBusy) return'));
    assert.ok(app.includes('window.confirm('));
    assert.ok(app.includes('DreamBoardStorage.saveState'));
    assert.match(app, /finally\s*\{[\s\S]*?importBusy = false;[\s\S]*?fileInput\.value = '';/);
});

test('app uses one IDB transaction for batch image write and add prevents collisions', () => {
    const app = fs.readFileSync('app.js', 'utf8');
    const fn = app.match(/function writeImportedImages[\s\S]*?\n    }\n\n    function cleanupImportedImages/);
    assert.ok(fn);
    assert.ok(fn[0].includes("db.transaction(LOCAL_IMAGE_STORE, 'readwrite')"));
    assert.ok(fn[0].includes('store.add('));
});
