(function (root) {
    'use strict';

    // Production-safe default: account UI and every Supabase request stay disabled.
    // Deployment configuration may replace these public values; never put a secret or
    // service-role key in this file (GitHub Pages serves it to every visitor).
    root.DreamBoardConfig = Object.freeze({
        authEnabled: false,
        photoSearchUrl: 'https://kseles.ru/dreamboard-api/photos',
        supabaseUrl: '',
        supabasePublishableKey: '',
        turnstileSiteKey: '',
        requireCaptcha: true
    });
})(typeof window !== 'undefined' ? window : globalThis);
