'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'service-worker.js'), 'utf8');
const photo = 'https://images.pexels.com/photos/414612/test.jpeg?w=1260';
function setup({ scope = 'dreamboard', network, quota = false, blocked = false, stores = new Map() } = {}) {
    const handlers = {}, requests = [];
    const caches = {
        async open(name) {
            if (blocked) throw Error('storage blocked');
            if (!stores.has(name)) stores.set(name, new Map());
            return {
                match: async url => stores.get(name).get(url)?.clone(),
                async put(url, response) { if (quota) throw Error('quota'); stores.get(name).set(url, response.clone()); }
            };
        },
        keys: async () => [...stores.keys()],
        delete: async name => stores.delete(name)
    };
    vm.runInNewContext(source, {
        URL, Request, console, caches,
        location: { origin: 'https://example.com', pathname: `/${scope}/service-worker.js` },
        fetch: async request => { requests.push(request); return network(request, requests.length); },
        self: { registration: { scope: `https://example.com/${scope}/` },
            addEventListener: (name, handler) => { handlers[name] = handler; }, clients: { claim: async () => {} } }
    });
    return { stores, requests,
        request(mode = 'cors') {
            let result;
            handlers.fetch({ request: new Request(photo, { mode }), respondWith: value => { result = value; } });
            return result;
        },
        activate() { let result; handlers.activate({ waitUntil: value => { result = value; } }); return result; }
    };
}
test('display stores readable photo; offline PNG uses identical bytes without another fetch', async () => {
    const sw = setup({ network: async () => new Response('photo bytes') });
    assert.equal(await (await sw.request('no-cors')).text(), 'photo bytes');
    assert.equal(sw.requests[0].mode, 'cors');
    assert.equal(sw.requests[0].credentials, 'omit');
    assert.equal(await (await sw.request()).text(), 'photo bytes');
    assert.equal(sw.requests.length, 1);
});
test('failed CORS HTTP-cache read retries with reload and stores successful result', async () => {
    const sw = setup({ network: async (_, count) => { if (count === 1) throw Error('CORS'); return new Response('retry'); } });
    assert.equal(await (await sw.request()).text(), 'retry');
    assert.equal(sw.requests[1].cache, 'reload');
    await sw.request();
    assert.equal(sw.requests.length, 2);
});
test('storage quota and blocked cache do not hide network photos', async () => {
    for (const options of [{ quota: true }, { blocked: true }]) {
        const sw = setup({ ...options, network: async () => new Response('visible') });
        assert.equal(await (await sw.request('no-cors')).text(), 'visible');
    }
});
test('CORS failure allows ordinary display fallback but never opaque export', async () => {
    const sw = setup({ network: async request => {
        if (request.mode === 'cors') throw Error('CORS');
        return new Response('display only');
    } });
    assert.equal(await (await sw.request('no-cors')).text(), 'display only');
    await assert.rejects(sw.request(), /CORS/);
    assert.equal(sw.requests.filter(r => r.mode === 'no-cors').length, 1);
});
test('HTTP errors are not persisted as photos', async () => {
    const sw = setup({ network: async (_, count) => new Response(count === 1 ? 'error' : 'photo', { status: count === 1 ? 503 : 200 }) });
    assert.equal((await sw.request()).status, 503);
    assert.equal(await (await sw.request()).text(), 'photo');
    assert.equal(sw.requests.length, 2);
});
test('upgrade preserves photo cache and preview cannot read production photos', async () => {
    const sw = setup({ network: async () => new Response('saved') });
    await sw.request('no-cors');
    sw.stores.set('dreamboard-dreamboard-v28', new Map());
    await sw.activate();
    assert.equal(await (await sw.request()).text(), 'saved');
    const preview = setup({ scope: 'dreamboard-v14-preview', stores: sw.stores, network: async () => { throw Error('offline'); } });
    await assert.rejects(preview.request(), /offline/);
    assert.ok(sw.stores.has('dreamboard-dreamboard-photos-v1'));
});
