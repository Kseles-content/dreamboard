'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Trash = require('./trash.js');

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        map,
        getItem: key => map.has(key) ? map.get(key) : null,
        setItem: (key, value) => map.set(key, value)
    };
}

function dream(id = 'dream-1', imageUrl = 'dbimage:img-1') {
    return {
        id, title: 'Мечта ✨', category: 'growth', year: 2027, desc: 'Описание', imageUrl,
        milestones: [{ id: 'm1', text: 'Шаг', checked: false }], status: 'active',
        canvasPos: { x: 1, y: 2, width: 320, height: 420 }, gratitudeNote: 'Спасибо'
    };
}

function addOne(storage, value = dream(), index = 0, id = 'trash-1', now = new Date('2026-08-26T00:00:00Z')) {
    return Trash.add(storage, value, index, { makeId: () => id, now });
}

test('empty storage loads as writable empty trash', () => {
    const result = Trash.load(memoryStorage());
    assert.equal(result.ok, true); assert.deepEqual(result.items, []); assert.equal(result.protected, false);
});

test('add writes versioned envelope before returning success', () => {
    const storage = memoryStorage(); const result = addOne(storage);
    assert.equal(result.ok, true);
    const saved = JSON.parse(storage.map.get(Trash.KEY));
    assert.equal(saved.formatVersion, 1); assert.equal(saved.items[0].dream.title, 'Мечта ✨');
});

test('add preserves Unicode, milestones, gratitude and canvas', () => {
    const storage = memoryStorage(); addOne(storage);
    assert.deepEqual(Trash.load(storage).items[0].dream, dream());
});

test('trash copy does not share objects with source', () => {
    const storage = memoryStorage(); const source = dream(); const result = addOne(storage, source);
    source.title = 'changed'; source.milestones[0].text = 'changed';
    assert.equal(result.record.dream.title, 'Мечта ✨'); assert.equal(result.record.dream.milestones[0].text, 'Шаг');
});

test('add failure leaves active input untouched', () => {
    const source = dream(); const storage = memoryStorage();
    storage.setItem = () => { const e = new Error(); e.name = 'QuotaExceededError'; throw e; };
    const result = addOne(storage, source);
    assert.equal(result.ok, false); assert.equal(result.error, 'quota'); assert.equal(source.title, 'Мечта ✨');
});

test('corrupt JSON is protected and never overwritten by add', () => {
    const storage = memoryStorage({ [Trash.KEY]: '{' }); let writes = 0; storage.setItem = () => writes++;
    const loaded = Trash.load(storage); const added = addOne(storage);
    assert.equal(loaded.protected, true); assert.equal(added.protected, true); assert.equal(writes, 0);
});

test('future trash format is protected', () => {
    const storage = memoryStorage({ [Trash.KEY]: JSON.stringify({ formatVersion: 2, items: [] }) });
    const result = Trash.load(storage); assert.equal(result.future, true); assert.equal(result.protected, true);
});

test('duplicate record ids protect the store', () => {
    const item = addOne(memoryStorage()).record;
    const storage = memoryStorage({ [Trash.KEY]: JSON.stringify({ formatVersion: 1, items: [item, item] }) });
    assert.equal(Trash.load(storage).error, 'invalid-record');
});

test('invalid records protect the store', () => {
    const storage = memoryStorage({ [Trash.KEY]: JSON.stringify({ formatVersion: 1, items: [{}] }) });
    assert.equal(Trash.load(storage).protected, true);
});

test('prototype pollution keys are dropped in stored dream copy', () => {
    const value = dream(); Object.defineProperty(value, '__proto__', { value: { polluted: true }, enumerable: true });
    const storage = memoryStorage(); addOne(storage, value);
    const restored = Trash.load(storage).items[0].dream;
    assert.equal(Object.prototype.polluted, undefined); assert.equal(Object.hasOwn(restored, '__proto__'), false);
});

test('HTML-like user text round-trips as data without blocking deletion', () => {
    const item = { id: 'trash-x', deletedAt: '2026-08-26T00:00:00Z', originalIndex: 0, dream: dream() };
    item.dream.desc = '<img src=x onerror=alert(1)>';
    const storage = memoryStorage({ [Trash.KEY]: JSON.stringify({ formatVersion: 1, items: [item] }) });
    const loaded = Trash.load(storage);
    assert.equal(loaded.ok, true);
    assert.equal(loaded.items[0].dream.desc, '<img src=x onerror=alert(1)>');
});

test('attribute injection in a trashed image URL is rejected', () => {
    const item = { id: 'trash-x', deletedAt: '2026-08-26T00:00:00Z', originalIndex: 0, dream: dream() };
    item.dream.imageUrl = 'https://example.com/x" onerror="alert(1)';
    const storage = memoryStorage({ [Trash.KEY]: JSON.stringify({ formatVersion: 1, items: [item] }) });
    assert.equal(Trash.load(storage).protected, true);
});

test('runtime renderers escape stored text and build modal milestones with textContent', () => {
    assert.ok(APP.includes('<h4 class="card-title">${escapeHtml(dream.title)}</h4>'));
    assert.ok(APP.includes('<p class="card-desc">${escapeHtml(dream.desc)}</p>'));
    assert.ok(APP.includes('${escapeHtml(m.text)}'));
    assert.ok(APP.includes('label.textContent = m.text'));
    assert.ok(APP.includes("remove.dataset.mid = m.id"));
    assert.ok(!APP.includes('<span>${m.text}</span>'));
});

test('remove returns removed record and keeps others', () => {
    const storage = memoryStorage(); addOne(storage, dream('d1'), 0, 't1'); addOne(storage, dream('d2'), 1, 't2');
    const result = Trash.remove(storage, 't1'); assert.equal(result.ok, true); assert.equal(result.record.id, 't1'); assert.deepEqual(result.items.map(x => x.id), ['t2']);
});

test('remove missing record does not write', () => {
    const storage = memoryStorage(); let writes = 0; storage.setItem = () => writes++;
    const result = Trash.remove(storage, 'missing'); assert.equal(result.error, 'not-found'); assert.equal(writes, 0);
});

test('remove write failure preserves stored trash', () => {
    const storage = memoryStorage(); addOne(storage); const before = storage.map.get(Trash.KEY);
    storage.setItem = () => { throw new Error('fail'); };
    assert.equal(Trash.remove(storage, 'trash-1').ok, false); assert.equal(storage.map.get(Trash.KEY), before);
});

test('buildRestore inserts at original index', () => {
    const record = addOne(memoryStorage(), dream('restored'), 1).record;
    const result = Trash.buildRestore([dream('a'), dream('b')], record);
    assert.equal(result.ok, true); assert.deepEqual(result.dreams.map(x => x.id), ['a', 'restored', 'b']);
});

test('buildRestore clamps original index to current length', () => {
    const record = addOne(memoryStorage(), dream('restored'), 99).record;
    assert.equal(Trash.buildRestore([dream('a')], record).index, 1);
});

test('buildRestore rejects active id conflict', () => {
    const record = addOne(memoryStorage(), dream('same'), 0).record;
    assert.equal(Trash.buildRestore([dream('same')], record).error, 'id-conflict');
});

test('buildRestore does not mutate active list or record', () => {
    const list = [dream('a')]; const record = addOne(memoryStorage(), dream('b'), 0).record;
    const before = JSON.stringify(record); const result = Trash.buildRestore(list, record);
    result.dreams[0].title = 'changed'; assert.equal(list[0].title, 'Мечта ✨'); assert.equal(JSON.stringify(record), before);
});

test('active shared image counts as in use', () => {
    assert.equal(Trash.isLocalImageRefInUse('dbimage:x', [dream('a', 'dbimage:x')], []), true);
});

test('excluding one active dream still finds another shared reference', () => {
    const dreams = [dream('a', 'dbimage:x'), dream('b', 'dbimage:x')];
    assert.equal(Trash.isLocalImageRefInUse('dbimage:x', dreams, [], 'a'), true);
});

test('excluding the only active reference reports unused', () => {
    assert.equal(Trash.isLocalImageRefInUse('dbimage:x', [dream('a', 'dbimage:x')], [], 'a'), false);
});

test('trash reference keeps image in use', () => {
    const item = addOne(memoryStorage(), dream('a', 'dbimage:x')).record;
    assert.equal(Trash.isLocalImageRefInUse('dbimage:x', [], [item]), true);
});

test('external URL is never treated as local image reference', () => {
    assert.equal(Trash.isLocalImageRefInUse('https://example.com/a.jpg', [dream('a', 'https://example.com/a.jpg')], []), false);
});

test('prune removes records at retention boundary', () => {
    const storage = memoryStorage(); addOne(storage, dream(), 0, 'old', new Date('2026-07-27T00:00:00Z'));
    const result = Trash.pruneExpired(storage, { now: new Date('2026-08-26T00:00:00Z') });
    assert.equal(result.ok, true); assert.equal(result.removed.length, 1); assert.equal(result.items.length, 0);
});

test('prune keeps fresh records', () => {
    const storage = memoryStorage(); addOne(storage, dream(), 0, 'fresh', new Date('2026-08-25T00:00:00Z'));
    const result = Trash.pruneExpired(storage, { now: new Date('2026-08-26T00:00:00Z') });
    assert.equal(result.removed.length, 0); assert.equal(result.items.length, 1);
});

test('prune write failure reports no removed records', () => {
    const storage = memoryStorage(); addOne(storage, dream(), 0, 'old', new Date('2026-07-01T00:00:00Z'));
    storage.setItem = () => { throw new Error('fail'); };
    const result = Trash.pruneExpired(storage, { now: new Date('2026-08-26T00:00:00Z') });
    assert.equal(result.ok, false); assert.deepEqual(result.removed, []);
});

test('trash refuses item 101 without deleting existing items', () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ id: 't' + i, deletedAt: '2026-08-26T00:00:00Z', originalIndex: i, dream: dream('d' + i) }));
    const storage = memoryStorage({ [Trash.KEY]: JSON.stringify({ formatVersion: 1, items }) });
    const result = addOne(storage, dream('extra'), 0, 'extra'); assert.equal(result.error, 'trash-full'); assert.equal(Trash.load(storage).items.length, 100);
});

const APP = fs.readFileSync('app.js', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');
const CSS = fs.readFileSync('style.css', 'utf8');
const SW = fs.readFileSync('service-worker.js', 'utf8');

test('delete confirmation contains selected dream title', () => {
    assert.ok(APP.includes('window.confirm(`Удалить цель «${dream.title}»?'));
});

test('delete flow writes trash before removing dream and saving state', () => {
    const fn = APP.match(/function deleteDream\(id\)[\s\S]*?\n    }\n\n    \/\/ Манифестация/)[0];
    assert.ok(fn.indexOf('DreamBoardTrash.add') < fn.indexOf('dreams = dreams.slice'));
    assert.ok(fn.indexOf('dreams = dreams.slice') < fn.indexOf('saveDreams()'));
});

test('active save failure restores dream and rolls back trash record', () => {
    const fn = APP.match(/function deleteDream\(id\)[\s\S]*?\n    }\n\n    \/\/ Манифестация/)[0];
    assert.ok(fn.includes('dreams.splice(originalIndex, 0, dream)'));
    assert.ok(fn.includes('DreamBoardTrash.remove(appStorageRef, added.record.id)'));
});

test('undo saves active state before removing trash item', () => {
    const fn = APP.match(/async function restoreTrashRecord[\s\S]*?\n    }\n\n    async function permanentlyDelete/)[0];
    assert.ok(fn.indexOf('saveDreams()') < fn.indexOf('DreamBoardTrash.remove'));
});

test('image replacement cleanup occurs only after successful save and reference check', () => {
    assert.ok(APP.indexOf('const saveResult = saveDreams()') < APP.indexOf('!isImageRefInUse(imageToCleanup)'));
});

test('import keeps explicit destructive replacement confirmation', () => {
    assert.ok(APP.includes('Заменить текущую доску данными из резервной копии?'));
    assert.ok(APP.includes('if (!approved)'));
});

test('trash UI uses native buttons, aria dialog and live toast region', () => {
    assert.ok(HTML.includes('id="trash-modal"'));
    assert.ok(HTML.includes('role="dialog"'));
    assert.ok(HTML.includes('id="toast-container" class="toast-container" aria-live="polite"'));
    assert.ok(APP.includes("restore.type = 'button'")); assert.ok(APP.includes("actionButton.type = 'button'"));
});

test('Undo toast pauses while focused and uses textContent', () => {
    assert.ok(APP.includes("toast.addEventListener('focusin', pause)"));
    assert.ok(APP.includes("toast.addEventListener('focusout', schedule)"));
    assert.ok(APP.includes('text.textContent = String(message)'));
});

test('Undo and trash actions have 44px touch targets and dangerous styling', () => {
    assert.match(CSS, /\.toast-action[\s\S]*?min-height:\s*44px/);
    assert.match(CSS, /\.trash-item-actions \.btn\s*\{\s*min-height:\s*44px/);
    assert.ok(CSS.includes('.action-round-btn.delete-btn {'));
});

test('trash.js script order and precache are correct', () => {
    assert.ok(HTML.indexOf('src="trash.js"') > HTML.indexOf('src="performance.js"'));
    assert.ok(HTML.indexOf('src="trash.js"') < HTML.indexOf('src="app.js"'));
    assert.ok(SW.includes("'./trash.js'"));
});
