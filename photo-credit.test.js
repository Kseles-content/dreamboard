'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const storage = require('./storage');
const photo = { title: 'Море', imageUrl: 'https://images.pexels.com/photos/1/a.jpg',
    imageCredit: { imageUrl: 'https://images.pexels.com/photos/1/a.jpg', author: 'Автор', sourceUrl: 'https://www.pexels.com/photo/1/' } };
test('photo attribution survives repeated normalization and JSON round trip', () => {
    const first = storage.normalizeDreams([photo]);
    const next = storage.normalizeDreams(JSON.parse(JSON.stringify(first)));
    assert.deepEqual(next[0].imageCredit, photo.imageCredit);
});
test('old dreams stay unchanged; replaced photos and unsafe credit URLs lose optional credit', () => {
    assert.equal(storage.normalizeDreams([{ title: 'Old' }])[0].imageCredit, undefined);
    assert.equal(storage.normalizeDreams([{ ...photo, imageUrl: 'assets/images/dream_travel.png' }])[0].imageCredit, undefined);
    for (const sourceUrl of ['javascript:alert(1)', 'https://evil.example', 'https://user:password@www.pexels.com/photo/1/']) {
        assert.equal(storage.normalizeDreams([{ ...photo, imageCredit: { ...photo.imageCredit, sourceUrl } }])[0].imageCredit, undefined);
    }
});
