'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHandler } = require('./infra/photo-search/server.cjs');
const origin = 'https://board.example';
const sample = { photos: [{ id: 1, alt: 'Море', photographer: 'Author',
    url: 'https://www.pexels.com/photo/1/', photographer_url: 'https://www.pexels.com/@author/',
    src: { medium: 'https://images.pexels.com/photos/1/a.jpg?w=350', large: 'https://images.pexels.com/photos/1/a.jpg' } }], next_page: 'https://api.pexels.com/v1/search?page=2' };
async function request(handler, url = '/api/photos?q=море', headers = { origin }, method = 'GET') {
    const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; },
        writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
    await handler({ url, headers, method }, res);
    return res;
}
function fixture(options = {}) {
    const requests = [];
    const handler = createHandler({ apiKey: 'server-only-secret', origins: [origin], fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, status: 200, json: async () => sample };
    }, ...options });
    return { handler, requests };
}
test('real provider URL, Russian locale, bounded pagination, private key and sanitized response', async () => {
    const { handler, requests } = fixture();
    const result = await request(handler);
    assert.equal(result.status, 200);
    assert.equal(requests[0].url.origin, 'https://api.pexels.com');
    assert.equal(requests[0].url.searchParams.get('locale'), 'ru-RU');
    assert.equal(requests[0].url.searchParams.get('per_page'), '18');
    assert.equal(requests[0].options.headers.Authorization, 'server-only-secret');
    assert.equal(result.body.photos[0].author, 'Author');
    assert.ok(!JSON.stringify(result).includes('server-only-secret'));
});
test('normalized repeats and simultaneous queries share one provider request', async () => {
    const { handler, requests } = fixture();
    await Promise.all([request(handler, '/api/photos?q=МОРЕ'), request(handler, '/api/photos?q=%20море%20')]);
    await request(handler);
    assert.equal(requests.length, 1);
});
test('invalid parameters and disallowed origins do not reach provider', async () => {
    const { handler, requests } = fixture();
    for (const url of ['/api/photos?q=', '/api/photos?q=море&page=0', '/api/photos?q=море&page=21', '/api/photos?q=море&url=https://evil.example']) {
        assert.equal((await request(handler, url)).status, 400);
    }
    assert.equal((await request(handler, undefined, {})).status, 403);
    assert.equal((await request(handler, undefined, { origin: 'https://evil.example' })).status, 403);
    assert.equal((await request(handler, undefined, { origin }, 'POST')).status, 405);
    assert.equal(requests.length, 0);
});
test('hourly budget permits cached results while blocking new provider requests', async () => {
    const { handler, requests } = fixture({ hourlyLimit: 1 });
    assert.equal((await request(handler)).status, 200);
    assert.equal((await request(handler)).status, 200);
    assert.equal((await request(handler, '/api/photos?q=дом')).status, 429);
    assert.equal(requests.length, 1);
});
test('provider errors never leak key or raw body; 429 activates cooldown', async () => {
    for (const status of [401, 429, 500]) {
        let calls = 0;
        const { handler } = fixture({ fetchImpl: async () => { calls++; return { ok: false, status }; } });
        const result = await request(handler);
        assert.equal(result.status, status === 429 ? 429 : 502);
        assert.ok(!JSON.stringify(result).includes('server-only-secret'));
        if (status === 429) { await request(handler); assert.equal(calls, 1); }
    }
});
test('bad provider URLs are discarded; missing key and network failure are safe', async () => {
    const { handler } = fixture({ fetchImpl: async () => ({ ok: true, json: async () => ({ photos: [{ ...sample.photos[0], src: { medium: 'javascript:alert(1)', large: 'https://evil.example/image' } }] }) }) });
    assert.deepEqual((await request(handler)).body.photos, []);
    assert.equal((await request(fixture({ apiKey: '' }).handler)).status, 503);
    assert.equal((await request(fixture({ fetchImpl: async () => { throw new Error('secret'); } }).handler)).status, 502);
});
test('cache expires after a day, bounded cache evicts, and hour budget recovers', async () => {
    let time = 1000;
    const { handler, requests } = fixture({ now: () => time, cacheLimit: 1, hourlyLimit: 2 });
    await request(handler); await request(handler, '/api/photos?q=дом');
    assert.equal((await request(handler)).status, 429);
    time += 3600001;
    assert.equal((await request(handler)).status, 200);
    time += 86400001;
    assert.equal((await request(handler)).status, 200);
    assert.equal(requests.length, 4);
});
