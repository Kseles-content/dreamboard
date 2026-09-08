'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const library = require('./image-library');

test('Russian search works across categories, ignores case and ё/е', () => {
    assert.ok(library.search('  МОРЕ  ').some(item => item.category === 'travel'));
    assert.ok(library.search('учеба').length === 0);
    assert.ok(library.search('РАБОТА').some(item => item.category === 'career'));
    assert.deepEqual(library.search('БЫТЬ РЯДОМ'), library.search('быть рядом'));
    assert.equal(library.search('несуществующийзапрос').length, 0);
});
test('default results work without a photo provider and exist in offline cache', () => {
    const local = library.search('');
    assert.ok(local.length >= 8);
    const sw = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
    for (const item of local) {
        assert.equal(item.local, true);
        assert.ok(fs.existsSync(path.join(__dirname, item.url)));
        assert.ok(sw.includes("'./" + item.url + "'"));
    }
});
test('category prioritizes suggestions without hiding other matches', () => {
    const results = library.search('', 'local', 'travel');
    assert.equal(results[0].category, 'travel');
    assert.equal(results.length, library.search('').length);
    assert.ok(library.search('работа', 'local', 'travel').length > 0);
});
test('online collection is explicit, stable and has no fake search addresses', () => {
    assert.equal(library.search('', 'all').length, 32);
    assert.equal(new Set(library.items.map(item => item.url)).size, 32);
    for (const item of library.items.filter(item => !item.local)) {
        assert.match(item.url, /^https:\/\/images\.unsplash\.com\/photo-/);
    }
});
