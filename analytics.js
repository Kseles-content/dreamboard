(function (root) {
    'use strict';
    const events = new Set(['landing_view', 'app_open_click', 'app_open', 'install_help_open', 'appinstalled', 'standalone_open', 'png_ready', 'png_download_click']);
    const sources = new Set(['telegram', 'personal', 'pilot']);
    const source = new URLSearchParams(root.location.search).get('utm_source');
    const campaign = sources.has(source) ? source : 'unknown';
    const production = root.location.hostname === 'kseles-content.github.io' && /^\/dreamboard\//.test(root.location.pathname);
    let pending = 0;
    function track(event) {
        try {
            if (!events.has(event) || pending >= 3 || root.navigator.onLine === false || root.navigator.doNotTrack === '1') return;
            if (root.localStorage.getItem('dreamboard-statistics-disabled') === '1') return;
            const controller = new AbortController();
            const timer = root.setTimeout(() => controller.abort(), 3000);
            pending++;
            let request;
            try { request = root.fetch('https://kseles.ru/dreamboard-api/events', {
                method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer',
                headers: { 'Content-Type': 'text/plain' }, keepalive: true, signal: controller.signal,
                body: JSON.stringify({ event, source: campaign, environment: production ? 'production' : 'preview' })
            }); } catch (_) { pending--; root.clearTimeout(timer); return; }
            Promise.resolve(request).catch(() => {}).finally(() => { pending--; root.clearTimeout(timer); });
        } catch (_) { /* Statistics must never interrupt the board. */ }
    }
    root.DreamBoardAnalytics = Object.freeze({ track });
    function init() {
        const landing = /\/welcome\//.test(root.location.pathname);
        const about = /\/about\//.test(root.location.pathname);
        const toggle = root.document.getElementById('statistics-enabled');
        if (toggle) {
            try { toggle.checked = root.localStorage.getItem('dreamboard-statistics-disabled') !== '1'; } catch (_) { toggle.disabled = true; }
            toggle.addEventListener('change', () => {
                try { root.localStorage.setItem('dreamboard-statistics-disabled', toggle.checked ? '0' : '1'); }
                catch (_) { toggle.checked = false; }
            });
        }
        if (about) return;
        track(landing ? 'landing_view' : 'app_open');
        if (!landing && (root.matchMedia('(display-mode: standalone)').matches || root.navigator.standalone)) track('standalone_open');
        root.addEventListener('appinstalled', () => track('appinstalled'));
        root.document.addEventListener('click', e => {
            const link = e.target.closest('a');
            if (landing && link && link.getAttribute('href').startsWith('../index.html')) track('app_open_click');
            if (landing && link && link.getAttribute('href') === '#install') track('install_help_open');
            if (link && link.id === 'png-export-download' && !link.hidden && link.hasAttribute('href')) track('png_download_click');
        });
        if (landing) {
            root.document.querySelectorAll('a[href="../index.html"]').forEach(link => {
                if (campaign !== 'unknown') link.href = '../index.html?utm_source=' + campaign;
            });
            root.document.querySelectorAll('.install-guide details').forEach(item => item.addEventListener('toggle', () => {
                if (item.open) track('install_help_open');
            }));
        }
    }
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window);
