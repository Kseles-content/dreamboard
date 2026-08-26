/* ==========================================================================
   DREAMBOARD - PERFORMANCE-LITE PROFILE TESTS (v14 mobile optimization)
   ==========================================================================
   Покрытие:
   - чистая функция shouldEnableLiteProfile (все комбинации ТЗ);
   - getCapabilities / applyPerformanceProfile / isLite;
   - статические инварианты app.js / style.css / index.html / service-worker.js
     (проверки утверждают фактическое поведение реализованного кода);
   - регрессия: существующие 128 тестов (backup-export/import/storage/status)
     остаются зелёными.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const perf = require('./performance.js');

const APP_JS = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const STYLE_CSS = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const SW_JS = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
const PERF_JS = fs.readFileSync(path.join(__dirname, 'performance.js'), 'utf8');

// Вспомогательные: вырезать тело функции из app.js по имени.
function functionBody(src, fnName) {
    const re = new RegExp(`function\\s+${fnName}\\s*\\(([^)]*)\\)\\s*\\{`);
    const m = re.exec(src);
    assert.ok(m, `function ${fnName} not found`);
    // Ищем парную закрывающую скобку с учётом вложенности.
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) break;
        }
    }
    return src.slice(m.index + m[0].length - 1, i + 1);
}

// ==========================================================================
// 1-9. ДЕТЕРМИНИРОВАННАЯ ЧИСТАЯ ФУНКЦИЯ shouldEnableLiteProfile
// ==========================================================================

test('1. TCL 30-подобный профиль (coarse + 412px + memory undefined + 8 cores) → lite', () => {
    const caps = { coarsePointer: true, viewportWidth: 412, deviceMemory: undefined, hardwareConcurrency: 8 };
    assert.strictEqual(perf.shouldEnableLiteProfile(caps), true);
});

test('2. coarse + width ровно 900 → lite', () => {
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: true, viewportWidth: 900 }), true);
});

test('3. coarse + width 901 + memory undefined + cores 8 → normal', () => {
    const caps = { coarsePointer: true, viewportWidth: 901, deviceMemory: undefined, hardwareConcurrency: 8 };
    assert.strictEqual(perf.shouldEnableLiteProfile(caps), false);
});

test('4. coarse + низкая deviceMemory → lite (независимо от width)', () => {
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: true, viewportWidth: 1600, deviceMemory: 4 }), true);
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: true, viewportWidth: 1920, deviceMemory: 2 }), true);
});

test('5. coarse + мало ядер → lite (независимо от width/memory)', () => {
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: true, viewportWidth: 1400, deviceMemory: 8, hardwareConcurrency: 4 }), true);
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: true, viewportWidth: 1400, deviceMemory: 8, hardwareConcurrency: 2 }), true);
});

test('6. desktop 600px без coarse → normal', () => {
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: false, viewportWidth: 600 }), false);
});

test('7. desktop с deviceMemory 4, но без coarse → normal', () => {
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: false, viewportWidth: 1920, deviceMemory: 4 }), false);
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: false, viewportWidth: 1920, deviceMemory: 2, hardwareConcurrency: 2 }), false);
});

test('8. reduced-motion desktop → lite (приоритет)', () => {
    const caps = { reducedMotion: true, coarsePointer: false, viewportWidth: 1920, deviceMemory: 8, hardwareConcurrency: 16 };
    assert.strictEqual(perf.shouldEnableLiteProfile(caps), true);
});

test('9. неизвестные/отсутствующие capability не вызывают исключение и не включают lite', () => {
    assert.strictEqual(perf.shouldEnableLiteProfile(), false);
    assert.strictEqual(perf.shouldEnableLiteProfile(null), false);
    assert.strictEqual(perf.shouldEnableLiteProfile({}), false);
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: true }), false); // все числа undefined
    assert.strictEqual(perf.shouldEnableLiteProfile({ coarsePointer: true, viewportWidth: 'wide' }), false); // не число
});

test('9b. getCapabilities не бросает на окружении без matchMedia/navigator', () => {
    const caps = perf.getCapabilities({ innerWidth: 412 });
    assert.strictEqual(caps.coarsePointer, false);
    assert.strictEqual(caps.reducedMotion, false);
    assert.strictEqual(caps.viewportWidth, 412);
    assert.strictEqual(caps.deviceMemory, undefined);
    assert.strictEqual(caps.hardwareConcurrency, undefined);
    assert.strictEqual(perf.getCapabilities(null).viewportWidth, undefined);
});

test('9c. getCapabilities снимает реальные значения окружения', () => {
    const mq = (q) => ({ matches: q === '(pointer: coarse)' });
    const caps = perf.getCapabilities({
        innerWidth: 412,
        matchMedia: mq,
        navigator: { deviceMemory: 3, hardwareConcurrency: 8 }
    });
    assert.strictEqual(caps.coarsePointer, true);
    assert.strictEqual(caps.reducedMotion, false);
    assert.strictEqual(caps.deviceMemory, 3);
    assert.strictEqual(caps.hardwareConcurrency, 8);
});

// ==========================================================================
// 10. ПРИМЕНЕНИЕ КЛАССА НА <html>
// ==========================================================================

test('10. класс performance-lite применяется к корневому элементу', () => {
    const classes = new Set();
    const fakeRoot = {
        classList: {
            toggle: (name, on) => {
                if (on) classes.add(name);
                else classes.delete(name);
            },
            contains: (name) => classes.has(name)
        }
    };
    const lite = perf.applyPerformanceProfile(fakeRoot, { coarsePointer: true, viewportWidth: 412 });
    assert.strictEqual(lite, true);
    assert.strictEqual(perf.isLite(fakeRoot), true);
    assert.ok(classes.has('performance-lite'), 'класс должен быть на корне');

    // Normal-профиль снимает класс.
    const lite2 = perf.applyPerformanceProfile(fakeRoot, { coarsePointer: false, viewportWidth: 1920 });
    assert.strictEqual(lite2, false);
    assert.strictEqual(perf.isLite(fakeRoot), false);
});

test('10b. performance.js применяет профиль в браузерной ветке при загрузке', () => {
    // UMD-обёртка + раннее применение: файл вызывает applyPerformanceProfile
    // на window.document.documentElement сразу после определения.
    assert.ok(/window\.DreamBoardPerformance\.applyPerformanceProfile\(window\.document\.documentElement\)/.test(PERF_JS),
        'раннее применение класса на <html> должно присутствовать в performance.js');
});

// ==========================================================================
// 11-16. AMBIENT / STARFIELD / CONFETTI / TIMERS / WAKE LOCK
// ==========================================================================

test('11. ambient не стартует в lite (init вызывает initAmbientParticles только вне lite)', () => {
    const initGuard = APP_JS.slice(APP_JS.indexOf('if (!isLite) {'));
    assert.ok(/if \(!isLite\) \{\s*\n\s*initAmbientParticles\(\)/.test(APP_JS),
        'initAmbientParticles должен вызываться только под if (!isLite)');
    assert.ok(initGuard.includes('initAmbientParticles()'));
    // Класс на <html> скрывает canvas даже если что-то вызвало инициализацию.
    assert.ok(/html\.performance-lite\s+#ambient-particles\s*\{\s*display:\s*none/.test(STYLE_CSS));
});

test('12. ambient hidden pause / visible resume без дубликата RAF', () => {
    const pauseBody = functionBody(APP_JS, 'pauseAmbientParticles');
    const resumeBody = functionBody(APP_JS, 'resumeAmbientParticles');
    assert.ok(pauseBody.includes('cancelAnimationFrame(ambientFrameId)'), 'pause должен отменять RAF');
    assert.ok(pauseBody.includes('ambientFrameId = null'));
    assert.ok(resumeBody.includes('!ambientFrameId && ambientAnimateFn'), 'resume не должен создавать дубликат');
    // Centralized: pauseDecorativeLoops вызывает pauseAmbientParticles.
    assert.ok(functionBody(APP_JS, 'pauseDecorativeLoops').includes('pauseAmbientParticles();'));
    assert.ok(functionBody(APP_JS, 'resumeDecorativeLoops').includes('resumeAmbientParticles();'));
});

test('13. starfield: lite ≤40 звёзд и без shadowBlur', () => {
    assert.ok(perf.LITE_STARFIELD_COUNT <= 40, `LITE_STARFIELD_COUNT=${perf.LITE_STARFIELD_COUNT} должен быть ≤40`);
    assert.strictEqual(perf.NORMAL_STARFIELD_COUNT, 140);
    assert.ok(/const starCount = starCountLimit/.test(APP_JS), 'starfield должен использовать starCountLimit');
    assert.ok(/const starGlow = isLite \? 0 : 10/.test(APP_JS), 'в lite свечение звёзд отключено');
    assert.ok(/if \(starGlow > 0\)/.test(APP_JS), 'shadowBlur применяется только при starGlow > 0');
});

test('14. confetti: lite ≤40 частиц', () => {
    assert.ok(perf.LITE_CONFETTI_COUNT <= 40, `LITE_CONFETTI_COUNT=${perf.LITE_CONFETTI_COUNT} должен быть ≤40`);
    assert.strictEqual(perf.NORMAL_CONFETTI_COUNT, 120);
    assert.ok(/const count = confettiCountLimit/.test(APP_JS), 'confetti должен использовать confettiCountLimit');
});

test('15. hidden pause/resume таймеров без дубликатов', () => {
    const pauseBody = functionBody(APP_JS, 'pauseDecorativeLoops');
    const resumeBody = functionBody(APP_JS, 'resumeDecorativeLoops');
    // Пауза всех декоративных таймеров.
    assert.ok(pauseBody.includes('clearInterval(chimeInterval)'));
    assert.ok(pauseBody.includes('clearInterval(manifestInterval)'));
    assert.ok(pauseBody.includes('clearInterval(breathGuideTimer)'));
    assert.ok(pauseBody.includes('stopManifestStarfield();'));
    // Возобновление только активных, без дублей.
    assert.ok(/if \(!manifestInterval && activeDreams\.length > 0\)/.test(resumeBody));
    assert.ok(/if \(!breathGuideTimer\)/.test(resumeBody));
    assert.ok(/if \(isSoundOn && ambientSynth && !chimeInterval\)/.test(resumeBody), 'звук не включается сам');
    // Слайд не сбрасывается: currentManifestIdx не переустанавливается в resume.
    assert.ok(!resumeBody.includes('currentManifestIdx = 0'), 'resume не должен сбрасывать текущий слайд');
});

test('16. Wake Lock recovery сохранён при возвращении во вкладку', () => {
    const visBody = APP_JS.slice(APP_JS.indexOf("document.addEventListener('visibilitychange'"));
    assert.ok(/requestManifestWakeLock\(\)/.test(visBody), 'wake lock должен перезапрашиваться при visible');
    assert.ok(/manifestOverlay\.classList\.contains\('active'\)/.test(visBody));
});

// ==========================================================================
// 17-19. АКТИВНЫЙ РЕНДЕРЕР
// ==========================================================================

test('17. renderAll вызывает ровно один renderer (только активный view)', () => {
    const body = functionBody(APP_JS, 'renderAll');
    const canvasCalls = (body.match(/renderCanvas\(\)/g) || []).length;
    const gridCalls = (body.match(/renderGrid\(\)/g) || []).length;
    assert.strictEqual(canvasCalls, 1, 'renderAll должен вызывать renderCanvas ровно один раз (в ветке)');
    assert.strictEqual(gridCalls, 1, 'renderAll должен вызывать renderGrid ровно один раз (в ветке)');
    assert.ok(body.includes("currentViewMode === 'canvas'"), 'ветвление по currentViewMode');
    assert.ok(body.includes('} else {'), 'ветки if/else: скрытое представление не строится');
});

test('18. переключение grid → canvas рендерит canvas', () => {
    const btnBlock = APP_JS.slice(APP_JS.indexOf("canvasViewBtn.addEventListener('click'"));
    const block = btnBlock.slice(0, btnBlock.indexOf('});') + 3);
    assert.ok(block.includes("currentViewMode = 'canvas'"));
    assert.ok(block.includes('renderCanvas()'), 'при активации canvas должен рендериться canvas');
    assert.ok(block.includes('updateCanvasTransform()'));
});

test('19. переключение canvas → grid рендерит grid', () => {
    const btnBlock = APP_JS.slice(APP_JS.indexOf("gridViewBtn.addEventListener('click'"));
    const block = btnBlock.slice(0, btnBlock.indexOf('});') + 3);
    assert.ok(block.includes("currentViewMode = 'grid'"));
    assert.ok(block.includes('renderGrid()'), 'при активации grid должен рендериться grid');
});

// ==========================================================================
// 20-24. CANVAS INPUT И LOCALSTORAGE
// ==========================================================================

test('20. updateCanvasTransform не содержит localStorage.setItem', () => {
    const body = functionBody(APP_JS, 'updateCanvasTransform');
    assert.ok(!body.includes('localStorage'), 'визуальное применение transform не пишет в localStorage');
    assert.ok(body.includes('spatialCanvas.style.transform'));
});

test('21. persistCanvasViewState пишет ровно три существующих ключа', () => {
    const body = functionBody(APP_JS, 'persistCanvasViewState');
    const setItems = (body.match(/localStorage\.setItem\(/g) || []).length;
    assert.strictEqual(setItems, 3, 'должно быть ровно 3 setItem');
    assert.ok(body.includes("'canvas_zoom'"));
    assert.ok(body.includes("'canvas_pan_x'"));
    assert.ok(body.includes("'canvas_pan_y'"));
    // Новые ключи не создаются.
    const keys = ['canvas_zoom', 'canvas_pan_x', 'canvas_pan_y'];
    const allKeys = [...body.matchAll(/setItem\('([^']+)'/g)].map(m => m[1]);
    assert.deepStrictEqual(allKeys.sort(), keys.sort());
});

test('22. wheel persistence debounce ~200-300 мс', () => {
    const body = functionBody(APP_JS, 'scheduleCanvasPersist');
    assert.ok(body.includes('clearTimeout(canvasPersistTimer)'), 'предыдущий debounce отменяется');
    const delay = /setTimeout\([\s\S]*?,\s*(\d+)\)/.exec(body);
    assert.ok(delay, 'scheduleCanvasPersist должен использовать setTimeout');
    const ms = parseInt(delay[1], 10);
    assert.ok(ms >= 200 && ms <= 300, `debounce=${ms}мс должен быть в диапазоне 200-300`);
    assert.ok(body.includes('persistCanvasViewState();'), 'по debounce выполняется персист');
    // Wheel handler вызывает scheduleCanvasPersist.
    const wheelBlock = APP_JS.slice(APP_JS.indexOf("canvasViewport.addEventListener('wheel'"));
    assert.ok(wheelBlock.slice(0, wheelBlock.indexOf('}, { passive: false }')).includes('scheduleCanvasPersist()'));
});

test('23. hidden выполняет persistence flush', () => {
    const pauseBody = functionBody(APP_JS, 'pauseDecorativeLoops');
    assert.ok(pauseBody.includes('clearTimeout(canvasPersistTimer)'), 'незавершённый debounce сбрасывается');
    assert.ok(pauseBody.includes('persistCanvasViewState();'), 'при hidden выполняется flush');
});

test('24. move-события coalesce через RAF (не более одного DOM update на кадр)', () => {
    // rAF-обёртка для transform.
    const reqBody = functionBody(APP_JS, 'requestCanvasTransformUpdate');
    assert.ok(reqBody.includes('requestAnimationFrame('), 'обновление transform должно идти через rAF');
    assert.ok(reqBody.includes('transformFrameRequested'), 'должен быть флаг coalescing');
    // rAF-обёртка для layout карточек.
    const cardBody = functionBody(APP_JS, 'requestCardLayoutUpdate');
    assert.ok(cardBody.includes('cardLayoutCoalescer.schedule()'), 'layout идёт через rAF-coalescer helper');
    // Горячие обработчики используют rAF-версии, а не прямой updateCanvasTransform.
    const panMove = APP_JS.slice(APP_JS.indexOf("window.addEventListener('mousemove'"));
    const panPart = panMove.slice(0, panMove.indexOf('window.addEventListener', 10));
    assert.ok(!panPart.includes('updateCanvasTransform();'), 'pan mousemove не должен вызывать updateCanvasTransform напрямую');
    assert.ok(panPart.includes('requestCanvasTransformUpdate();'));
    // Последнее событие не теряется: pendingDragCard/pendingResizeCard.
    assert.ok(APP_JS.includes('pendingDragCard = activeDragCard;'));
    assert.ok(APP_JS.includes('pendingResizeCard = activeResizeCard;'));
    // getBoundingClientRect кэшируется на старте жеста.
    assert.ok(/let dragViewportRect = null/.test(APP_JS));
    assert.ok(/const rect = dragViewportRect \|\| canvasViewport\.getBoundingClientRect\(\)/.test(APP_JS));
    assert.ok(/dragViewportRect = canvasViewport\.getBoundingClientRect\(\)/.test(APP_JS), 'rect кэшируется при старте жеста');
});

test('24b. resize canvas: RAF-coalescing и без перезапуска цикла ambient', () => {
    const initBody = functionBody(APP_JS, 'initAmbientParticles');
    assert.ok(initBody.includes('resizeFrame = requestAnimationFrame('), 'resize должен быть rAF-coalesced');
    assert.ok(initBody.includes('resizeFrame = null;'), 'сброс флага после применения');
    // Внутри функции resize нет вызова animate()/initAmbientParticles.
    const resizeFn = initBody.slice(initBody.indexOf('function resize()'), initBody.indexOf('resize();'));
    assert.ok(!resizeFn.includes('animate('), 'resize не перезапускает цикл');
    assert.ok(!resizeFn.includes('initAmbientParticles('), 'resize не вызывает повторную инициализацию');
});

// ==========================================================================
// 25-26. CSS LITE-ПРОФИЛЬ
// ==========================================================================

test('25. CSS lite отключает ambient/backdrop/glow/kenburns', () => {
    assert.ok(/html\.performance-lite\s+#ambient-particles\s*\{\s*display:\s*none/.test(STYLE_CSS), 'ambient скрыт');
    const backdropRule = /html\.performance-lite\s+\*[\s\S]*?backdrop-filter:\s*none\s*!important/.exec(STYLE_CSS);
    assert.ok(backdropRule, 'backdrop-filter:none для всех элементов');
    assert.ok(/html\.performance-lite\s+\*[\s\S]*?-webkit-backdrop-filter:\s*none\s*!important/.test(STYLE_CSS));
    assert.ok(/html\.performance-lite\s+\.glass-card,/.test(STYLE_CSS), 'тени убраны у glass-card');
    assert.ok(/box-shadow:\s*none\s*!important/.test(STYLE_CSS));
    assert.ok(/html\.performance-lite\s+\.category-career:hover/.test(STYLE_CSS), 'hover-свечения отключены');
    assert.ok(/html\.performance-lite\s+\.manifest-slide\.active\s+\.manifest-slide-img\s*\{\s*animation:\s*none\s*!important/.test(STYLE_CSS), 'kenburns отключён');
    assert.ok(/html\.performance-lite\s+\.breath-circle-inner\.inhale/.test(STYLE_CSS), 'дыхание без scale');
    assert.ok(/transform:\s*none\s*!important/.test(STYLE_CSS));
    assert.ok(/html\.performance-lite\s+\*\s*\{\s*transition:\s*none\s*!important/.test(STYLE_CSS), 'декоративные transition отключены');
    assert.ok(/animation:\s*none\s*!important/.test(STYLE_CSS), 'декоративные animation отключены');
});

test('25b. toast сохраняет появление (исключён из animation:none — удаление зависит от animationend)', () => {
    assert.ok(/:not\(\.toast\):not\(\.toast \*\)/.test(STYLE_CSS), 'toast исключён из глобального animation:none');
});

test('26. prefers-reduced-motion расширен: декоративные анимации/переходы независимо от устройства', () => {
    const reducedBlock = STYLE_CSS.slice(STYLE_CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    const end = reducedBlock.indexOf('/* ==', reducedBlock.indexOf('*/'));
    const block = reducedBlock.slice(0, end > 0 ? end : reducedBlock.length);
    assert.ok(/\*\s*\{\s*transition:\s*none\s*!important/.test(block), 'переходы отключены для всех');
    assert.ok(/:not\(\.toast\):not\(\.toast \*\)\s*\{\s*animation:\s*none\s*!important/.test(block), 'анимации отключены для всех');
    assert.ok(/\.manifest-slide\.active\s+\.manifest-slide-img\s*\{\s*animation:\s*none\s*!important/.test(block), 'kenburns отключён');
    assert.ok(/\.breath-circle-inner\.inhale/.test(block), 'дыхание упрощено');
});

// ==========================================================================
// 27-30. КОНТРОЛЫ / SCRIPT ORDER / PRECACHE / CACHE_NAME / DOM IDS
// ==========================================================================

test('27. import/export controls не меняются (export/import видимы, png/input скрыты)', () => {
    const exportBtn = /id="export-json-btn"[\s\S]*?>/.exec(INDEX_HTML)[0];
    const importBtn = /id="import-json-btn"[\s\S]*?>/.exec(INDEX_HTML)[0];
    const pngBtn = /id="export-png-btn"[\s\S]*?>/.exec(INDEX_HTML)[0];
    const fileInput = /id="import-file-input"[\s\S]*?>/.exec(INDEX_HTML)[0];
    assert.ok(!exportBtn.includes('hidden'), 'export-json-btn должен быть видим');
    assert.ok(!importBtn.includes('hidden'), 'import-json-btn должен быть видим');
    assert.ok(pngBtn.includes('hidden'), 'export-png-btn должен быть скрыт');
    assert.ok(fileInput.includes('hidden'), 'import-file-input должен быть скрыт');
});

test('28. script order storage→backup→import→performance→trash→app и PRECACHE содержит performance/trash', () => {
    const scripts = [...INDEX_HTML.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
    const local = scripts.filter(s => !s.startsWith('http'));
    const expected = ['storage.js', 'backup.js', 'import.js', 'performance.js', 'trash.js', 'app.js'];
    assert.deepStrictEqual(local, expected, `порядок скриптов: ${local.join(' → ')}`);
    const precache = SW_JS.slice(SW_JS.indexOf('const PRECACHE_URLS'), SW_JS.indexOf('];'));
    const precacheIdx = precache.indexOf("'./performance.js'");
    assert.ok(precacheIdx > -1, 'PRECACHE должен содержать ./performance.js');
    const importIdx = precache.indexOf("'./import.js'");
    const trashIdx = precache.indexOf("'./trash.js'");
    const appIdx = precache.indexOf("'./app.js'");
    assert.ok(importIdx < precacheIdx && precacheIdx < trashIdx && trashIdx < appIdx, 'порядок PRECACHE: import → performance → trash → app');
    // Existence-проверка: файл существует на диске.
    assert.ok(fs.existsSync(path.join(__dirname, 'performance.js')));
    assert.ok(fs.existsSync(path.join(__dirname, 'trash.js')));
});

test('29. CACHE_NAME обновлён до dreamboard-v14', () => {
    assert.ok(/const CACHE_NAME = 'dreamboard-v14';/.test(SW_JS), 'CACHE_NAME должен быть dreamboard-v14');
});

test('30. DOM IDs без дублей', () => {
    const ids = [...INDEX_HTML.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
    assert.ok(ids.length > 60, `ожидалось много id, получено ${ids.length}`);
    const unique = new Set(ids);
    assert.strictEqual(unique.size, ids.length, 'id не должны дублироваться');
});

// ==========================================================================
// ДОПОЛНИТЕЛЬНЫЕ ИНВАРИАНТЫ (без ослабления существующих тестов)
// ==========================================================================

test('31. isLite(true) по классу на корне — интеграция с applyPerformanceProfile', () => {
    const classes = new Set(['performance-lite']);
    const fakeRoot = {
        classList: { contains: (n) => classes.has(n) }
    };
    assert.strictEqual(perf.isLite(fakeRoot), true);
});

test('32. perfApi/isLite в app.js читаются до инициализации эффектов', () => {
    // isLite объявлен в начале DOMContentLoaded (до init()), а init()
    // использует его для guard ambient.
    const isLiteDecl = APP_JS.indexOf('const isLite = !!perfApi && perfApi.isLite();');
    const initGuardPos = APP_JS.indexOf('if (!isLite) {');
    assert.ok(isLiteDecl > -1 && initGuardPos > isLiteDecl, 'isLite должен объявляться раньше guard в init()');
    // performance.js подключён до app.js (см. тест 28) — API доступен.
});

test('33. starfield resume не создаёт дубликат RAF и вызывается из resumeDecorativeLoops', () => {
    const resumeStar = functionBody(APP_JS, 'resumeManifestStarfield');
    assert.ok(resumeStar.includes('!starfieldFrameId && starfieldAnimateFn'), 'проверка на отсутствие активного RAF');
    assert.ok(functionBody(APP_JS, 'resumeDecorativeLoops').includes('resumeManifestStarfield();'));
    assert.ok(functionBody(APP_JS, 'pauseDecorativeLoops').includes('stopManifestStarfield();'));
});

test('34. drag/resize завершение сохраняет данные (saveDreams) и сбрасывает кэш rect', () => {
    const mouseup = APP_JS.slice(APP_JS.indexOf("window.addEventListener('mouseup'"));
    const muBlock = mouseup.slice(0, mouseup.indexOf("window.addEventListener('touchend'"));
    assert.ok(muBlock.includes('saveDreams();'), 'saveDreams на mouseup сохранён');
    assert.ok(muBlock.includes('dragViewportRect = null;'), 'кэш rect сбрасывается после жеста');
    const touchend = APP_JS.slice(APP_JS.indexOf("window.addEventListener('touchend'"));
    const teBlock = touchend.slice(0, touchend.indexOf("// =========="));
    assert.ok(teBlock.includes('saveDreams();'), 'saveDreams на touchend сохранён');
});

// ==========================================================================
// 35-44. RAF-coalescer для drag/resize (createRafCoalescer) — динамические
// тесты чистого helper'а с инжектируемыми requestFrame/cancelFrame/apply
// (без DOM) + статические инварианты порядка вызовов в обработчиках.
// ==========================================================================

function makeCoalescerHarness(applyFn) {
    const calls = { request: [], cancel: [], apply: 0 };
    let cb = null;
    let nextId = 1;
    const harness = {
        calls,
        requestFrame(fn) {
            const id = nextId++;
            calls.request.push(id);
            cb = fn;
            return id;
        },
        cancelFrame(id) {
            calls.cancel.push(id);
            cb = null;
        },
        apply() {
            calls.apply++;
            if (applyFn) applyFn();
        },
        runFrame() {
            if (cb) {
                const fn = cb;
                cb = null;
                fn();
            }
        },
        get pendingCallback() {
            return cb !== null;
        }
    };
    const coalescer = perf.createRafCoalescer({
        requestFrame: harness.requestFrame,
        cancelFrame: harness.cancelFrame,
        apply: harness.apply
    });
    return { harness, coalescer };
}

test('35. schedule планирует ровно один кадр; повторный schedule до кадра не планирует второй', () => {
    const { harness, coalescer } = makeCoalescerHarness();
    coalescer.schedule();
    coalescer.schedule();
    assert.strictEqual(harness.calls.request.length, 1, 'один pending кадр');
    assert.strictEqual(harness.calls.apply, 0, 'применение только в кадре');
    assert.strictEqual(harness.pendingCallback, true);
});

test('36. выполнение кадра вызывает apply ровно один раз и очищает handle', () => {
    const { harness, coalescer } = makeCoalescerHarness();
    coalescer.schedule();
    harness.runFrame();
    assert.strictEqual(harness.calls.apply, 1, 'apply выполнен в кадре');
    assert.strictEqual(harness.pendingCallback, false, 'handle очищен');
    coalescer.schedule();
    assert.strictEqual(harness.calls.request.length, 2, 'новый schedule планирует новый кадр');
});

test('37. flush отменяет ожидающий RAF и синхронно применяет последнее состояние', () => {
    const { harness, coalescer } = makeCoalescerHarness();
    coalescer.schedule();
    const scheduledId = harness.calls.request[0];
    coalescer.flush();
    assert.deepStrictEqual(harness.calls.cancel, [scheduledId], 'cancelFrame вызван с реальным RAF handle');
    assert.strictEqual(harness.calls.apply, 1, 'применение синхронно, без ожидания кадра');
    assert.strictEqual(harness.pendingCallback, false, 'запланированный callback отменён');
});

test('38. flush без pending — безопасный no-op', () => {
    const { harness, coalescer } = makeCoalescerHarness();
    coalescer.flush();
    assert.strictEqual(harness.calls.cancel.length, 0, 'нечего отменять');
    assert.strictEqual(harness.calls.apply, 0, 'apply не вызывается');
});

test('39. повторный flush — no-op (apply выполняется один раз)', () => {
    const { harness, coalescer } = makeCoalescerHarness();
    coalescer.schedule();
    coalescer.flush();
    const applyAfterFirst = harness.calls.apply;
    coalescer.flush();
    assert.strictEqual(harness.calls.apply, applyAfterFirst, 'второй flush ничего не применяет');
    assert.strictEqual(harness.calls.cancel.length, 1, 'cancel вызван только при первом flush');
});

test('40. после flush запланированный callback не применяет layout второй раз', () => {
    const { harness, coalescer } = makeCoalescerHarness();
    coalescer.schedule();
    coalescer.flush();
    harness.runFrame(); // эмуляция прихода кадра после отмены
    assert.strictEqual(harness.calls.apply, 1, 'layout применён ровно один раз (из flush)');
});

test('41. flush применяет последнее drag/resize значение из актуального состояния', () => {
    // apply читает актуальное состояние (как applyCardLayoutFrame в app.js
    // читает dream.canvasPos), поэтому schedule → обновление → flush
    // применяет именно последнее значение.
    const applied = [];
    let latest = { x: 100, y: 200 };
    const { harness } = makeCoalescerHarness();
    const coalescer = perf.createRafCoalescer({
        requestFrame: harness.requestFrame,
        cancelFrame: harness.cancelFrame,
        apply: () => applied.push({ x: latest.x, y: latest.y })
    });
    coalescer.schedule();
    latest = { x: 300, y: 400 }; // последний move до кадра
    coalescer.flush();
    assert.deepStrictEqual(applied, [{ x: 300, y: 400 }], 'применяется последнее значение');
});

test('42. mouseup: flush выполняется до обнуления pending refs и до saveDreams', () => {
    // lastIndexOf: в app.js есть ранний mouseup-листенер панорамирования (pan),
    // нас интересует обработчик завершения drag/resize жеста.
    const muStart = APP_JS.lastIndexOf("window.addEventListener('mouseup'");
    const muBlock = APP_JS.slice(muStart, APP_JS.indexOf('// ==========', muStart));
    const flushPos = muBlock.indexOf('cardLayoutCoalescer.flush();');
    const dragNullPos = muBlock.indexOf('pendingDragCard = null;');
    const resizeNullPos = muBlock.indexOf('pendingResizeCard = null;');
    const savePos = muBlock.indexOf('saveDreams();');
    assert.ok(flushPos > -1, 'flush присутствует в mouseup');
    assert.ok(flushPos < dragNullPos, 'flush до обнуления pendingDragCard');
    assert.ok(flushPos < resizeNullPos, 'flush до обнуления pendingResizeCard');
    assert.ok(flushPos < savePos, 'flush до saveDreams');
});

test('43. touchend (card-drag): flush выполняется до обнуления pending refs и до saveDreams', () => {
    const touchend = APP_JS.slice(APP_JS.indexOf("window.addEventListener('touchend'"));
    const teBlock = touchend.slice(0, touchend.indexOf("window.addEventListener('mouseup'"));
    const flushPos = teBlock.indexOf('cardLayoutCoalescer.flush();');
    const dragNullPos = teBlock.indexOf('pendingDragCard = null;');
    const savePos = teBlock.indexOf('saveDreams();');
    assert.ok(flushPos > -1, 'flush присутствует в touchend');
    assert.ok(flushPos < dragNullPos, 'flush до обнуления pendingDragCard');
    assert.ok(flushPos < savePos, 'flush до saveDreams');
});

test('44. app.js использует протестированный helper (без собственной копии логики)', () => {
    const reqUpdate = functionBody(APP_JS, 'requestCardLayoutUpdate');
    assert.ok(reqUpdate.includes('cardLayoutCoalescer.schedule()'), 'schedule через helper');
    const applyFrame = functionBody(APP_JS, 'applyCardLayoutFrame');
    assert.ok(!applyFrame.includes('cardLayoutFrameRequested'), 'apply не управляет boolean-флагом');
    assert.ok(!APP_JS.includes('cardLayoutFrameRequested'), 'старый boolean-флаг удалён полностью');
    assert.ok(PERF_JS.includes('function createRafCoalescer'), 'helper определён в performance.js');
    assert.ok(PERF_JS.includes('cancelFrame(frameId)'), 'отмена по реальному RAF handle');
    assert.ok(PERF_JS.includes('schedule: function'), 'schedule экспортирован');
    assert.ok(PERF_JS.includes('flush: function'), 'flush экспортирован');
});
