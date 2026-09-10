const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const code = fs.readFileSync(require('node:path').join(__dirname, 'analytics.js'), 'utf8');
function fixture(overrides = {}) {
    const requests = [];
    const window = {
        location: { hostname: 'kseles-content.github.io', pathname: '/dreamboard/index.html', search: '?utm_source=pilot&dream=PRIVATE' },
        navigator: { onLine: true }, localStorage: { getItem: () => null },
        document: { readyState: 'loading', addEventListener() {} },
        fetch: (url, options) => { requests.push({ url, ...options }); return Promise.resolve(); },
        setTimeout, clearTimeout, ...overrides
    };
    vm.runInNewContext(code, { window, URLSearchParams, AbortController });
    return { window, requests };
}
test('only allowlisted event metadata leaves browser, without credentials or referrer', () => {
    const { window, requests } = fixture();
    window.DreamBoardAnalytics.track('png_ready');
    window.DreamBoardAnalytics.track('PRIVATE');
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].body), { event: 'png_ready', source: 'pilot', environment: 'production' });
    assert.equal(requests[0].credentials, 'omit');
    assert.equal(requests[0].referrerPolicy, 'no-referrer');
});
test('offline, opt-out and DNT suppress requests', () => {
    for (const overrides of [{ navigator: { onLine: false } }, { navigator: { doNotTrack: '1' } }, { localStorage: { getItem: () => '1' } }]) {
        const { window, requests } = fixture(overrides);
        window.DreamBoardAnalytics.track('app_open');
        assert.equal(requests.length, 0);
    }
});
test('blocked storage, throwing fetch and rejected fetch cannot throw into application', async () => {
    for (const overrides of [{ localStorage: { getItem() { throw Error('blocked'); } } }, { fetch() { throw Error('blocked'); } }, { fetch: () => Promise.reject(Error('offline')) }]) {
        const { window } = fixture(overrides);
        assert.doesNotThrow(() => window.DreamBoardAnalytics.track('png_ready'));
    }
    await new Promise(resolve => setImmediate(resolve));
});
test('unknown campaigns discarded and preview isolated', () => {
    const { window, requests } = fixture({ location: { hostname: 'kseles-content.github.io', pathname: '/dreamboard-v14-preview/index.html', search: '?utm_source=PRIVATE' } });
    window.DreamBoardAnalytics.track('app_open');
    assert.deepEqual(JSON.parse(requests[0].body), { event: 'app_open', source: 'unknown', environment: 'preview' });
});
