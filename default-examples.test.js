'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Storage = require('./storage');
const Trash = require('./trash');
const source = fs.readFileSync(require.resolve('./app.js'), 'utf8');
const defaults = JSON.parse(JSON.stringify(vm.runInNewContext(source.match(/const DEFAULT_DREAMS = (\[[\s\S]*?\n    \]);/)[1])));
const old = defaults.filter(dream => dream.id !== 'default-dome');

function fixture(dreams = old) {
    // Simulate v31/v32 persisted data, before the introduction acknowledgement.
    const state = Storage.createState(dreams);
    state.settings = { customSetting: 'keep' };
    state.uiState = { zoom: 1.2 };
    const map = new Map([[Storage.KEY_PRIMARY, JSON.stringify(state)]]);
    const storage = {
        map, failKey: '',
        getItem(key) { return map.has(key) ? map.get(key) : null; },
        setItem(key, value) { if (this.failKey === key) throw new Error('quota'); map.set(key, value); }
    };
    return storage;
}
function upgrade(storage, trash = Trash.load(storage)) {
    return Storage.upgradeDomeExample(storage, Storage.load(storage, { defaultDreams: defaults }), defaults, trash);
}
function state(storage) { return JSON.parse(storage.getItem(Storage.KEY_PRIMARY)); }

test('a saved four-example board receives dome once, preserving every old card and settings', () => {
    const storage = fixture();
    const original = storage.getItem(Storage.KEY_PRIMARY);
    const before = state(storage);
    assert.equal(upgrade(storage).added, true);
    assert.equal(state(storage).dreams.length, 5);
    assert.deepEqual(state(storage).dreams.slice(0, 4), before.dreams);
    assert.equal(state(storage).settings.customSetting, 'keep');
    assert.deepEqual(state(storage).uiState, before.uiState);
    assert.equal(state(storage).settings.domeExampleIntroduced, true);
    assert.equal(storage.getItem(Storage.KEY_RECOVERY), original);
    const updated = storage.getItem(Storage.KEY_PRIMARY);
    assert.equal(upgrade(storage).changed, false);
    assert.equal(storage.getItem(Storage.KEY_PRIMARY), updated);
});

test('edited starter examples and additional personal cards are retained', () => {
    const dreams = JSON.parse(JSON.stringify(old));
    dreams[0].title = 'Мой изменённый стартап';
    dreams[0].milestones[0].checked = false;
    dreams[0].canvasPos.x = 100;
    dreams.push({ ...dreams[0], id: 'personal', title: 'Моя мечта' });
    const storage = fixture(dreams);
    const before = state(storage).dreams;
    assert.equal(upgrade(storage).added, true);
    assert.deepEqual(state(storage).dreams.slice(0, -1), before);
});

test('deleting the introduced dome, including permanent deletion, never adds it again', () => {
    const storage = fixture();
    upgrade(storage);
    assert.equal(Storage.save(storage, state(storage).dreams.filter(d => d.id !== 'default-dome')).ok, true);
    assert.equal(state(storage).settings.domeExampleIntroduced, true);
    assert.equal(upgrade(storage).changed, false);
    assert.equal(state(storage).dreams.length, 4);
});

test('an existing v32 dome is acknowledged without duplicates or resetting edits', () => {
    const dreams = JSON.parse(JSON.stringify(defaults));
    dreams[4].title = 'Наш семейный дом';
    const storage = fixture(dreams);
    const before = state(storage).dreams;
    assert.equal(upgrade(storage).added, false);
    assert.deepEqual(state(storage).dreams, before);
    assert.equal(state(storage).settings.domeExampleIntroduced, true);
});

test('a v32 dome in trash is not restored, even after trash is cleared later', () => {
    const storage = fixture();
    assert.equal(Trash.add(storage, defaults[4], 4, { makeId: () => 'deleted-dome' }).ok, true);
    assert.equal(upgrade(storage).added, false);
    storage.map.delete(Trash.KEY);
    assert.equal(upgrade(storage).changed, false);
    assert.equal(state(storage).dreams.length, 4);
});

for (const dreams of [[], [{ ...old[0], id: 'personal-only' }]]) {
    test('empty or entirely personal boards are not populated with examples: '+dreams.length, () => {
        const storage = fixture(dreams);
        const before = storage.getItem(Storage.KEY_PRIMARY);
        assert.equal(upgrade(storage).changed, false);
        assert.equal(storage.getItem(Storage.KEY_PRIMARY), before);
    });
}

for (const key of [Storage.KEY_PRIMARY, Storage.KEY_RECOVERY]) {
    test('failed '+key+' write preserves the old board and retries safely', () => {
        const storage = fixture();
        const before = storage.getItem(Storage.KEY_PRIMARY);
        storage.failKey = key;
        assert.equal(upgrade(storage).ok, false);
        assert.equal(storage.getItem(Storage.KEY_PRIMARY), before);
        storage.failKey = '';
        assert.equal(upgrade(storage).added, true);
        assert.equal(state(storage).dreams.length, 5);
    });
}

test('protected data or unreadable trash never triggers an upgrade', () => {
    const storage = fixture();
    const before = storage.getItem(Storage.KEY_PRIMARY);
    const loaded = Storage.load(storage);
    assert.equal(Storage.upgradeDomeExample(storage, { ...loaded, writeProtected: true }, defaults, Trash.load(storage)).changed, false);
    assert.equal(upgrade(storage, { ok: false, protected: true, items: [] }).changed, false);
    assert.equal(storage.getItem(Storage.KEY_PRIMARY), before);
    const newer = { ...state(storage), schemaVersion: 999 };
    storage.map.set(Storage.KEY_PRIMARY, JSON.stringify(newer));
    assert.equal(upgrade(storage).changed, false);
    assert.deepEqual(state(storage), newer);
});

test('fresh boards acknowledge the dome in the same write as the initial seed', () => {
    const storage = fixture(); storage.map.clear();
    const loaded = Storage.load(storage, { defaultDreams: defaults });
    assert.equal(loaded.dreams.length, 5);
    assert.equal(upgrade(storage).changed, false);
    Storage.save(storage, loaded.dreams);
    assert.equal(state(storage).settings.domeExampleIntroduced, true);
});

test('legacy and recovery boards can receive the missing example without deleting their source', () => {
    for (const key of [Storage.KEY_LEGACY, Storage.KEY_RECOVERY]) {
        const storage = fixture();
        const original = key === Storage.KEY_LEGACY ? JSON.stringify(old) : storage.getItem(Storage.KEY_PRIMARY);
        storage.map.clear(); storage.map.set(key, original);
        assert.equal(upgrade(storage).added, true);
        assert.equal(state(storage).dreams.length, 5);
        assert.equal(storage.getItem(key), original);
    }
});
