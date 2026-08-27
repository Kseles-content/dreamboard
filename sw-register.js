(function () {
    'use strict';
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
        navigator.serviceWorker.register('service-worker.js').catch(function () {
            // Offline support is optional; an unavailable SW must not break the app.
        });
    });
})();
