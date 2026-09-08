'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const appearance = require('./appearance');
const storageApi = require('./storage');
function memory(initial={}) {
    const data = new Map(Object.entries(initial));
    return { data, getItem: key => data.has(key) ? data.get(key) : null, setItem: (key,value) => data.set(key,value) };
}
test('appearance defaults and unknown choices normalize safely', () => {
    assert.deepEqual(appearance.normalize(null), appearance.defaults);
    assert.equal(appearance.normalize({ theme:'paper', size:'giant', fit:'contain', unexpected:'x' }).size,'normal');
    assert.deepEqual(Object.keys(appearance.normalize({ unexpected:'x' })),Object.keys(appearance.defaults));
});
test('editing dreams cannot reset separately stored appearance; appearance does not change board data', () => {
    const storage = memory();
    assert.equal(appearance.write(storage,{ theme:'paper', size:'compact', view:'canvas' }),true);
    const appearanceBefore=storage.getItem(appearance.KEY);
    assert.equal(storageApi.save(storage,[{title:'Моя мечта'}]).ok,true);
    const board=storage.getItem(storageApi.KEY_PRIMARY);
    assert.equal(storage.getItem(appearance.KEY),appearanceBefore);
    appearance.write(storage,{theme:'cosmos'});
    assert.equal(storage.getItem(storageApi.KEY_PRIMARY),board);
});
test('malformed and future preferences are not overwritten', () => {
    for (const raw of ['broken','null',JSON.stringify({version:1,values:[]}),JSON.stringify({version:2,values:{theme:'future'}})]) {
        const storage=memory({[appearance.KEY]:raw});
        assert.equal(appearance.read(storage).protected,true);
        assert.equal(appearance.write(storage,{theme:'paper'}),false);
        assert.equal(storage.getItem(appearance.KEY),raw);
    }
});
test('storage denial and quota failure are safe', () => {
    assert.equal(appearance.write(null,appearance.defaults),false);
    assert.equal(appearance.read({getItem(){throw Error('denied');}}).protected,true);
    assert.equal(appearance.write({getItem(){return null;},setItem(){throw Error('quota');}},appearance.defaults),false);
});
