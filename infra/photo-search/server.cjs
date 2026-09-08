'use strict';
// Node 22+, no npm dependencies. Bind behind an existing HTTPS reverse proxy.
const http = require('node:http');

function createHandler({ apiKey, origins = [], fetchImpl = fetch, now = Date.now,
    hourlyLimit = 180, cacheLimit = 256 } = {}) {
    const cache = new Map();
    const pending = new Map();
    const calls = [];
    let cooldownUntil = 0;
    const allowed = new Set(origins);
    const safeURL = (value, hosts) => {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password && hosts.includes(url.hostname) ? url.href : '';
        } catch { return ''; }
    };
    async function search(query, page) {
        const key = JSON.stringify([query, page]);
        const hit = cache.get(key);
        if (hit && hit.until > now()) return hit.data;
        if (pending.has(key)) return pending.get(key);
        if (!apiKey) throw { status: 503, code: 'not_configured' };
        while (calls.length && calls[0] <= now() - 3600000) calls.shift();
        if (now() < cooldownUntil || calls.length >= hourlyLimit) {
            throw { status: 429, code: 'rate_limited' };
        }
        calls.push(now());
        const task = (async () => {
            const url = new URL('https://api.pexels.com/v1/search');
            url.search = new URLSearchParams({ query, page: String(page), per_page: '18', locale: 'ru-RU' }).toString();
            let response;
            try {
                response = await fetchImpl(url, {
                    headers: { Authorization: apiKey, Accept: 'application/json' },
                    signal: AbortSignal.timeout(8000), redirect: 'error'
                });
            } catch { throw { status: 502, code: 'provider_unavailable' }; }
            if (response.status === 429) {
                cooldownUntil = now() + 3600000;
                throw { status: 429, code: 'rate_limited' };
            }
            if (!response.ok) throw { status: 502, code: 'provider_unavailable' };
            let raw;
            try { raw = await response.json(); }
            catch { throw { status: 502, code: 'provider_unavailable' }; }
            if (!Array.isArray(raw.photos)) throw { status: 502, code: 'provider_unavailable' };
            const photos = raw.photos.slice(0, 18).map(photo => ({
                id: String(photo.id || '').slice(0, 30),
                title: String(photo.alt || 'Фотография').slice(0, 200),
                url: safeURL(photo.src?.large2x || photo.src?.large, ['images.pexels.com']),
                thumbnail: safeURL(photo.src?.medium, ['images.pexels.com']),
                author: String(photo.photographer || '').slice(0, 120),
                sourceUrl: safeURL(photo.url, ['www.pexels.com', 'pexels.com']),
                authorUrl: safeURL(photo.photographer_url, ['www.pexels.com', 'pexels.com'])
            })).filter(photo => photo.url && photo.thumbnail && photo.sourceUrl);
            const data = { photos, page, hasMore: page < 20 && Boolean(raw.next_page), provider: 'Pexels' };
            if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value);
            cache.set(key, { data, until: now() + 86400000 });
            return data;
        })();
        pending.set(key, task);
        try { return await task; } finally { pending.delete(key); }
    }
    return async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Vary', 'Origin');
        const send = (status, body) => { res.writeHead(status); res.end(JSON.stringify(body)); };
        const origin = req.headers.origin;
        if (!allowed.has(origin)) return send(403, { error: 'origin_not_allowed' });
        res.setHeader('Access-Control-Allow-Origin', origin);
        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            return send(405, { error: 'method_not_allowed' });
        }
        if ((req.url || '').length > 1500) return send(414, { error: 'invalid_query' });
        let url;
        try { url = new URL(req.url, 'http://localhost'); }
        catch { return send(400, { error: 'invalid_query' }); }
        if (url.pathname !== '/api/photos') return send(404, { error: 'not_found' });
        if ([...url.searchParams.keys()].some(key => !['q', 'page'].includes(key))) {
            return send(400, { error: 'invalid_query' });
        }
        const query = (url.searchParams.get('q') || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');
        const pageText = url.searchParams.get('page') || '1';
        const page = Number(pageText);
        if (!query || query.length > 100 || /[\u0000-\u001f\u007f]/.test(query) || !/^\d+$/.test(pageText) || page < 1 || page > 20) {
            return send(400, { error: 'invalid_query' });
        }
        try { send(200, await search(query, page)); }
        catch (error) {
            if (error.status === 429) res.setHeader('Retry-After', '3600');
            send(error.status || 500, { error: error.code || 'search_unavailable' });
        }
    };
}

module.exports = { createHandler };
if (require.main === module) {
    const origins = (process.env.PHOTO_SEARCH_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
    if (!process.env.PEXELS_API_KEY || !origins.length) {
        console.error('Configure PEXELS_API_KEY and PHOTO_SEARCH_ORIGINS in the server environment.');
        process.exit(1);
    }
    const server = http.createServer(createHandler({ apiKey: process.env.PEXELS_API_KEY, origins }));
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    server.listen(Number(process.env.PHOTO_SEARCH_PORT || 8787), '127.0.0.1');
}
