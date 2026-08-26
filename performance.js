/* ==========================================================================
   DREAMBOARD - PERFORMANCE PROFILE (PERFORMANCE-LITE DETECTION)
   ==========================================================================
   Детерминированное определение lite-профиля для слабых/мобильных устройств.

   Решение (чистая функция):
     lite = reducedMotion
            OR (
              coarsePointer
              AND ( viewportWidth <= 900 OR deviceMemory <= 4 OR hardwareConcurrency <= 4 )
            )

   Неизвестные deviceMemory / hardwareConcurrency сами по себе НЕ включают lite
   (typeof-проверка: undefined сравнивается с числом как false).

   Файл подключается до app.js и применяет класс `performance-lite` на <html>
   как можно раньше после старта. Экспортируется для Node-тестов без
   превращения app.js в модуль.
   ========================================================================== */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node (тесты)
        module.exports = factory();
    } else {
        // Браузер
        root.DreamBoardPerformance = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Пороговые значения декоративных эффектов в lite-профиле.
    var LITE_STARFIELD_COUNT = 40;
    var NORMAL_STARFIELD_COUNT = 140;
    var LITE_CONFETTI_COUNT = 40;
    var NORMAL_CONFETTI_COUNT = 120;

    // Детерминированная чистая функция: решение о lite-профиле.
    // capabilities: { reducedMotion, coarsePointer, viewportWidth, deviceMemory, hardwareConcurrency }
    function shouldEnableLiteProfile(capabilities) {
        var caps = capabilities || {};
        if (caps.reducedMotion === true) return true;
        if (caps.coarsePointer !== true) return false;

        var widthOk = typeof caps.viewportWidth === 'number' && caps.viewportWidth <= 900;
        var memoryOk = typeof caps.deviceMemory === 'number' && caps.deviceMemory <= 4;
        var coresOk = typeof caps.hardwareConcurrency === 'number' && caps.hardwareConcurrency <= 4;

        return widthOk || memoryOk || coresOk;
    }

    // Снятие capability из окружения (window).
    function getCapabilities(win) {
        win = win || (typeof window !== 'undefined' ? window : null);
        var caps = {
            reducedMotion: false,
            coarsePointer: false,
            viewportWidth: undefined,
            deviceMemory: undefined,
            hardwareConcurrency: undefined
        };
        if (!win) return caps;

        if (win.matchMedia) {
            try {
                caps.reducedMotion = win.matchMedia('(prefers-reduced-motion: reduce)').matches;
                caps.coarsePointer = win.matchMedia('(pointer: coarse)').matches;
            } catch (e) {
                // Окружение без matchMedia: capability остаются false/undefined.
            }
        }
        if (typeof win.innerWidth === 'number') {
            caps.viewportWidth = win.innerWidth;
        }
        if (win.navigator) {
            if (typeof win.navigator.deviceMemory === 'number') {
                caps.deviceMemory = win.navigator.deviceMemory;
            }
            if (typeof win.navigator.hardwareConcurrency === 'number') {
                caps.hardwareConcurrency = win.navigator.hardwareConcurrency;
            }
        }
        return caps;
    }

    // Применение профиля к корневому элементу (по умолчанию document.documentElement).
    // Возвращает true, если включён lite-профиль.
    function applyPerformanceProfile(root, capabilities) {
        var el = root || (typeof document !== 'undefined' ? document.documentElement : null);
        if (!el || !el.classList) return false;

        var caps = capabilities || getCapabilities();
        var lite = shouldEnableLiteProfile(caps);
        el.classList.toggle('performance-lite', lite);
        return lite;
    }

    // Текущее состояние: применён ли lite-профиль к корневому элементу.
    function isLite(root) {
        var el = root || (typeof document !== 'undefined' ? document.documentElement : null);
        return !!el && !!el.classList && el.classList.contains('performance-lite');
    }

    // Чистый RAF-coalescer для drag/resize: не более одного DOM-update на кадр,
    // при завершении жеста синхронный flush отменяет ожидающий кадр и применяет
    // последнее состояние немедленно (последнее событие не теряется).
    // handlers: { requestFrame: (fn) -> frameId, cancelFrame: (frameId) -> void,
    //             apply: () -> void }
    // frameId — реальный handle (null | id), а не boolean: cancelFrame может
    // надёжно отменить запланированный callback перед синхронным применением.
    function createRafCoalescer(handlers) {
        var h = handlers || {};
        var requestFrame = typeof h.requestFrame === 'function' ? h.requestFrame : null;
        var cancelFrame = typeof h.cancelFrame === 'function' ? h.cancelFrame : null;
        var apply = typeof h.apply === 'function' ? h.apply : function () {};
        var frameId = null;

        return {
            // Планирует применение на следующий кадр (не более одного pending).
            schedule: function () {
                if (frameId !== null || !requestFrame) return;
                frameId = requestFrame(function () {
                    frameId = null;
                    apply();
                });
            },
            // Синхронный flush: отменяет ожидающий кадр и применяет последнее
            // состояние немедленно. Безопасный no-op, если кадр не запланирован.
            flush: function () {
                if (frameId === null) return;
                if (cancelFrame) cancelFrame(frameId);
                frameId = null;
                apply();
            },
            // Полная отмена без применения.
            cancel: function () {
                if (frameId === null) return;
                if (cancelFrame) cancelFrame(frameId);
                frameId = null;
            },
            hasPending: function () {
                return frameId !== null;
            }
        };
    }

    return {
        shouldEnableLiteProfile: shouldEnableLiteProfile,
        getCapabilities: getCapabilities,
        applyPerformanceProfile: applyPerformanceProfile,
        isLite: isLite,
        createRafCoalescer: createRafCoalescer,
        LITE_STARFIELD_COUNT: LITE_STARFIELD_COUNT,
        NORMAL_STARFIELD_COUNT: NORMAL_STARFIELD_COUNT,
        LITE_CONFETTI_COUNT: LITE_CONFETTI_COUNT,
        NORMAL_CONFETTI_COUNT: NORMAL_CONFETTI_COUNT
    };
});

// Применяем профиль как можно раньше (скрипт подключён до app.js;
// document.documentElement доступен в момент выполнения в конце body).
if (typeof window !== 'undefined' && window.document && window.DreamBoardPerformance) {
    window.DreamBoardPerformance.applyPerformanceProfile(window.document.documentElement);
}
