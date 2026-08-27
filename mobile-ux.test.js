/* ==========================================================================
   DREAMBOARD - MOBILE UX POLISH TESTS (hotfix после релиза v14)
   ==========================================================================
   Покрытие:
   1. Delete UX: нейтральная кнопка удаления, danger только на
      hover/focus-visible/active; на touch без взаимодействия красного нет.
   2. Fullscreen view: кнопка «Развернуть» на grid/canvas-карточках,
      touch target >= 44x44, read-only диалог (role=dialog/aria-modal),
      закрытие (кнопка/Escape/backdrop), начальный фокус и возврат фокуса,
      desktop dblclick с guard (не action/input/button, не после drag/resize),
      отсутствие mobile double-tap, никакой записи в storage/IDB.
   3. Manifestation mobile/landscape: 100dvh + fallback, safe-area-inset,
      компактность при малой высоте/landscape, min-height:0, overflow-y:auto;
      сохранены swipe, breathing, звук, wake lock, lite-профиль.
   ========================================================================== */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP_JS = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const STYLE_CSS = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const PERFORMANCE_JS = fs.readFileSync(path.join(__dirname, 'performance.js'), 'utf8');

// ==========================================================================
// 1. DELETE UX
// ==========================================================================

test('1. delete-btn нейтрален в обычном состоянии (danger только на hover/focus/active)', () => {
    // В базовом правиле больше нет постоянного красного фона/цвета
    const baseRule = STYLE_CSS.match(/\.action-round-btn\.delete-btn\s*\{([^}]*)\}/);
    assert.ok(baseRule, 'базовое правило delete-btn есть');
    assert.ok(!/background:\s*rgba\(80,\s*8,\s*28/.test(baseRule[1]), 'нет постоянного красного фона');
    assert.ok(!/color:\s*#ff6b83/.test(baseRule[1]), 'нет постоянного красного текста');

    // danger-индикация только на hover, focus-visible и active
    assert.ok(/\.action-round-btn\.delete-btn:hover,/.test(STYLE_CSS), 'hover');
    assert.ok(/\.action-round-btn\.delete-btn:focus-visible,/.test(STYLE_CSS), 'focus-visible');
    assert.ok(/\.action-round-btn\.delete-btn:active\s*\{/.test(STYLE_CSS), 'active');
});

test('2. touch: красного акцента нет без взаимодействия', () => {
    const block = STYLE_CSS.match(/@media \(hover: none\), \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/g);
    assert.ok(block && block.length, 'есть media (hover:none)/(pointer:coarse)');
    const touchRule = STYLE_CSS.match(/@media \(hover: none\), \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(touchRule[1].includes('.action-round-btn.delete-btn'), 'touch-правило для delete-btn');
    // В touch-состоянии кнопка нейтральная
    assert.ok(/\.action-round-btn\.delete-btn\s*\{[\s\S]*?color:\s*#ffffff/.test(touchRule[1]), 'нейтральный цвет в touch');
    // Красный — только на :active (нажатие)
    assert.ok(/\.action-round-btn\.delete-btn:active\s*\{[\s\S]*?background:\s*#ff2d55/.test(touchRule[1]), 'danger только на active');
});

test('3. верхняя кнопка корзины (trash) сохраняется, confirm/Undo contract не тронут', () => {
    const TRASH_JS = fs.readFileSync(path.join(__dirname, 'trash.js'), 'utf8');
    assert.ok(APP_JS.includes('deleteDream(dream.id)'), 'deleteDream вызывается');
    assert.ok(APP_JS.includes('DreamBoardTrash.add'), 'trash API вызывается из app.js');
    assert.ok(TRASH_JS.includes('dreamboard_trash_v1'), 'trash contract в trash.js');
    assert.ok(APP_JS.includes('restoreTrashRecord'), 'Undo/восстановление сохранено');
    assert.ok(APP_JS.includes('permanentlyDeleteTrashRecord'), 'перманентное удаление сохранено');
    assert.ok(INDEX_HTML.includes('id="trash-toggle-btn"'), 'верхняя кнопка корзины остаётся');
});

// ==========================================================================
// 2. FULLSCREEN VIEW
// ==========================================================================

test('4. кнопка «Развернуть» есть на каждой карточке (grid и canvas)', () => {
    assert.ok(/<button class="action-round-btn expand-btn"/.test(APP_JS), 'expand-btn в шаблоне карточки');
    // createDreamCardDOM используется и для grid, и для canvas
    assert.ok(APP_JS.includes('function createDreamCardDOM(dream, isCanvasMode)'), 'общий рендер карточки');
    // Обработчик открытия
    assert.ok(APP_JS.includes('openDreamViewModal(dream, expandBtn)'), 'клик по expand открывает просмотр');
});

test('5. touch target expand-кнопки >= 44x44 на телефоне', () => {
    // Находим ВСЕ media-блоки (hover:none)/(pointer:coarse) и ищем expand-правило
    const blocks = STYLE_CSS.match(/@media \(hover: none\), \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/g) || [];
    assert.ok(blocks.length >= 1, 'есть media (hover:none)/(pointer:coarse)');
    const withExpand = blocks.find(b => b.includes('.action-round-btn.expand-btn'));
    assert.ok(withExpand, 'touch-правило expand найдено');
    assert.ok(/width:\s*44px;\s*height:\s*44px;\s*min-width:\s*44px;\s*min-height:\s*44px/.test(withExpand),
        '44x44 min touch target');
});

test('6. read-only диалог: role=dialog, aria-modal, заголовок, aria-hidden', () => {
    const modal = INDEX_HTML.match(/<div id="dream-view-modal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
    assert.ok(modal, 'view-модалка есть в index.html');
    assert.ok(/role="dialog"/.test(modal[0]), 'role=dialog');
    assert.ok(/aria-modal="true"/.test(modal[0]), 'aria-modal');
    assert.ok(/aria-labelledby="dream-view-title"/.test(modal[0]), 'aria-labelledby');
    assert.ok(/id="dream-view-title"/.test(modal[0]), 'заголовок');
    assert.ok(/aria-hidden="true"/.test(modal[0]), 'aria-hidden при закрытии');
});

test('7. поля просмотра заполняются только через textContent/безопасные DOM API', () => {
    // Никаких innerHTML-присваиваний с пользовательскими данными в view-функции
    const viewFn = APP_JS.match(/function openDreamViewModal[\s\S]*?\n    \}/);
    assert.ok(viewFn, 'openDreamViewModal есть');
    assert.ok(!/\.innerHTML\s*=/.test(viewFn[0]), 'нет innerHTML-присваиваний в openDreamViewModal');
    assert.ok(viewFn[0].includes('.textContent ='), 'текст через textContent');
    assert.ok(viewFn[0].includes('document.createElement'), 'этапы через createElement');
    // Никакой записи в storage/IDB
    assert.ok(!viewFn[0].includes('saveDreams'), 'нет saveDreams');
    assert.ok(!viewFn[0].includes('localStorage.setItem'), 'нет localStorage.setItem');
    assert.ok(!viewFn[0].includes('indexedDB'), 'нет IDB записи');
});

test('8. закрытие: кнопка, Escape, клик по backdrop; начальный фокус и возврат фокуса', () => {
    assert.ok(APP_JS.includes("dreamViewCloseBtn.addEventListener('click', closeDreamViewModal)"), 'кнопка закрытия');
    assert.ok(/dreamViewModal\.addEventListener\('keydown'[\s\S]*?e\.key === 'Escape'/.test(APP_JS), 'Escape закрывает');
    assert.ok(/dreamViewModal\.addEventListener\('click'[\s\S]*?e\.target === dreamViewModal/.test(APP_JS), 'backdrop закрывает');
    assert.ok(APP_JS.includes('dreamViewCloseBtn.focus()'), 'начальный фокус на кнопке закрытия');
    assert.ok(APP_JS.includes('dreamViewTrigger.focus()'), 'возврат фокуса на открывшую кнопку');
});

test('9. desktop dblclick открывает просмотр с guard (не action/input/button, не после drag/resize)', () => {
    const dbl = APP_JS.match(/card\.addEventListener\('dblclick'[\s\S]*?\n        \}\)/);
    assert.ok(dbl, 'dblclick обработчик есть');
    assert.ok(/\.closest\('\.action-round-btn, \.milestone-item, \.card-resizer, button, input, select, textarea, a'\)/.test(dbl[0]),
        'guard от action/input/button');
    assert.ok(/lastCardLayoutEnd < 350/.test(dbl[0]), 'guard от недавнего drag/resize');
    // lastCardLayoutEnd обновляется при завершении drag/resize
    assert.ok(APP_JS.includes('lastCardLayoutEnd = Date.now()'), 'отметка конца жеста');
    // Не после drag: activeDragCard/activeResizeCard сброс сохраняется
    assert.ok(APP_JS.includes('activeDragCard = null') && APP_JS.includes('activeResizeCard = null'), 'сброс жестов');
});

test('10. mobile double-tap НЕ внедрён', () => {
    // Нет touch-обработчиков, открывающих просмотр; dblclick — только desktop
    const viewRefs = APP_JS.split('openDreamViewModal');
    assert.ok(viewRefs.length >= 2, 'openDreamViewModal вызывается');
    // Нет вызова openDreamViewModal из touchstart/touchend/dblclick-touch паттернов
    assert.ok(!/touchstart[\s\S]{0,200}openDreamViewModal/.test(APP_JS), 'нет open из touchstart');
    assert.ok(!/touchend[\s\S]{0,200}openDreamViewModal/.test(APP_JS), 'нет open из touchend');
    assert.ok(!/double.?tap/i.test(APP_JS), 'нет double-tap логики');
});

// ==========================================================================
// 3. MANIFESTATION MOBILE / LANDSCAPE
// ==========================================================================

test('11. manifest-overlay: 100dvh с fallback 100vh + safe-area-inset', () => {
    const overlay = STYLE_CSS.match(/\.manifest-overlay\s*\{[\s\S]*?\n\}/);
    assert.ok(overlay, 'manifest-overlay правило');
    assert.ok(/height:\s*100vh;/.test(overlay[0]), 'fallback 100vh');
    assert.ok(/height:\s*100dvh;/.test(overlay[0]), '100dvh');
    assert.ok(/env\(safe-area-inset-top/.test(overlay[0]), 'safe-area top');
    assert.ok(/env\(safe-area-inset-right/.test(overlay[0]), 'safe-area right');
    assert.ok(/env\(safe-area-inset-bottom/.test(overlay[0]), 'safe-area bottom');
    assert.ok(/env\(safe-area-inset-left/.test(overlay[0]), 'safe-area left');
    assert.ok(/box-sizing:\s*border-box/.test(overlay[0]), 'border-box');
});

test('12. manifest-content: dvh + min-height:0; manifest-card-info: min-height:0 + overflow-y:auto', () => {
    const content = STYLE_CSS.match(/\.manifest-content\s*\{[\s\S]*?\n\}/);
    assert.ok(content, 'manifest-content правило');
    assert.ok(/height:\s*60vh;/.test(content[0]), 'fallback 60vh');
    assert.ok(/height:\s*60dvh;/.test(content[0]), '60dvh');
    assert.ok(/min-height:\s*0/.test(content[0]), 'min-height:0');
    const info = STYLE_CSS.match(/\.manifest-card-info\s*\{[\s\S]*?\n\}/);
    assert.ok(info, 'manifest-card-info правило');
    assert.ok(/min-height:\s*0/.test(info[0]), 'min-height:0');
    assert.ok(/overflow-y:\s*auto/.test(info[0]), 'overflow-y:auto (страховка)');
});

test('13. landscape/short-height: компактные правила и dvh', () => {
    // Ландшафтный блок с calc(100dvh - 118px) и fallback
    assert.ok(/height:\s*calc\(100dvh - 118px\);/.test(STYLE_CSS), 'dvh в ландшафтном calc');
    assert.ok(/height:\s*calc\(100vh - 118px\);/.test(STYLE_CSS), 'vh fallback в ландшафтном calc');
    // Компактный header при малой высоте/landscape
    assert.ok(/@media \(max-width: 900px\) and \(orientation: landscape\), \(max-height: 520px\)/.test(STYLE_CSS),
        'media малой высоты');
    assert.ok(/\.app-header\s*\{[\s\S]*?padding:\s*6px 10px;/.test(STYLE_CSS), 'компактный header');
    assert.ok(/padding-top:\s*calc\(6px \+ env\(safe-area-inset-top, 0px\)\)/.test(STYLE_CSS), 'safe-area в header');
    // Ландшафтные manifest-card-info с overflow-y:auto
    const landscapeInfos = STYLE_CSS.match(/\.manifest-card-info\s*\{[\s\S]*?overflow-y:\s*auto/g);
    assert.ok(landscapeInfos && landscapeInfos.length >= 2, 'overflow-y:auto в ландшафтных/малых блоках');
});

test('18. сверхнизкий landscape: (orientation: landscape) and (max-height: 500px) с 100dvh/scroll/safe-area', () => {
    // Достаём весь media-блок (закрывается голым \n} на колонке 0)
    const bp = STYLE_CSS.match(/@media \(orientation: landscape\) and \(max-height: 500px\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(bp, 'отдельный breakpoint (orientation: landscape) and (max-height: 500px)');
    const block = bp[1];
    // Внутри media правила закрываются с отступом (\n    }) — используем это как границу правила
    const rule = (sel) => block.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[\\s\\S]*?\\n    \\}'));

    // Overlay: 100dvh + max-height 100dvh + вертикальный scroll
    const overlay = rule('.manifest-overlay');
    assert.ok(overlay, 'overlay-правило в breakpoint');
    assert.ok(/height:\s*100dvh;/.test(overlay[0]), 'height: 100dvh');
    assert.ok(/max-height:\s*100dvh;/.test(overlay[0]), 'max-height: 100dvh');
    assert.ok(/overflow-y:\s*auto;/.test(overlay[0]), 'overflow-y: auto (вертикальный скролл)');
    assert.ok(/env\(safe-area-inset-left/.test(overlay[0]), 'safe-area слева');
    assert.ok(/env\(safe-area-inset-right/.test(overlay[0]), 'safe-area справа');

    // Нет фиксированной min-height > viewport: overlay без min-height в px
    assert.ok(!/min-height:\s*\d+px/.test(overlay[0]), 'нет фикс. min-height в px у overlay');

    // Контент: в потоке (не absolute), height auto, min-height 0 — доскролл до низа
    const content = rule('.manifest-content');
    assert.ok(content, 'content-правило в breakpoint');
    assert.ok(/position:\s*relative;/.test(content[0]), 'content в потоке (relative)');
    assert.ok(/height:\s*auto;/.test(content[0]), 'height: auto (не фиксирована)');
    assert.ok(/min-height:\s*0;/.test(content[0]), 'min-height: 0');
    assert.ok(/flex:\s*1 0 auto/.test(content[0]), 'flex: 1 0 auto');

    // Карточка-инфо: не обрезает название/описание/этапы
    const info = rule('.manifest-card-info');
    assert.ok(info, 'card-info-правило в breakpoint');
    assert.ok(/max-height:\s*none;/.test(info[0]), 'max-height: none (не обрезает)');
    assert.ok(/overflow-y:\s*visible;/.test(info[0]), 'overflow-y: visible');
    assert.ok(/min-height:\s*0;/.test(info[0]), 'min-height: 0');
    // Текст цели видим полностью (сброс line-clamp из других блоков)
    assert.ok(/#manifest-desc[\s\S]*?-webkit-line-clamp:\s*unset/.test(block), 'desc без line-clamp');
    assert.ok(/#manifest-title[\s\S]*?-webkit-line-clamp:\s*unset/.test(block), 'title без line-clamp');

    // Кнопка закрытия видима (sticky при скролле)
    const exit = rule('.exit-manifest-btn');
    assert.ok(exit, 'exit-btn-правило в breakpoint');
    assert.ok(/position:\s*sticky;/.test(exit[0]), 'exit-btn sticky (видима при скролле)');
    assert.ok(/z-index:\s*60;/.test(exit[0]), 'exit-btn поверх');

    // Изображение уменьшено, но видимо (не скрыто)
    const slider = rule('.manifest-slider-container');
    assert.ok(slider, 'slider-container в breakpoint');
    assert.ok(/height:\s*clamp\(110px, 30dvh, 240px\);/.test(slider[0]), 'изображение уменьшено (clamp)');
    assert.ok(!/display:\s*none/.test(slider[0]), 'изображение не скрыто');

    // Управляющие кнопки доступны (в потоке, доскролл до низа)
    const controls = rule('.manifest-controls');
    assert.ok(controls, 'controls-правило в breakpoint');
    assert.ok(/position:\s*relative;/.test(controls[0]), 'controls в потоке');
    assert.ok(/display:\s*flex;/.test(controls[0]), 'controls видимы (display: flex)');

    // Affirmation компактнее, но не скрыта
    const aff = rule('.manifest-affirmation-slider');
    assert.ok(aff, 'affirmation-правило в breakpoint');
    assert.ok(!/display:\s*none/.test(aff[0]), 'affirmation не скрыта');

    // Нет фиксированной минимальной высоты, превышающей viewport (проверка по всему блоку)
    assert.ok(!/min-height:\s*(100|9\d|8\d)dvh/.test(block), 'нет min-height >= 80dvh');
    assert.ok(!/min-height:\s*(100|9\d|8\d)vh/.test(block), 'нет min-height >= 80vh');
});

test('14. изображение и карточка помещаются по высоте: max-height + min-height:0 в ландшафте', () => {
    // Блок (max-width:900) landscape absolute: min-height:0 уже был, сохранён
    assert.ok(/@media \(max-width: 900px\) and \(orientation: landscape\)[\s\S]*?\.manifest-content\s*\{[\s\S]*?min-height:\s*0/.test(STYLE_CSS),
        'min-height:0 в landscape manifest-content');
    // В очень малой высоте (max-height:620px) тоже min-height:0
    assert.ok(/max-height: 620px\)[\s\S]*?\.manifest-content\s*\{[\s\S]*?min-height:\s*0/.test(STYLE_CSS),
        'min-height:0 при max-height:620');
});

test('15. swipe, breathing, звук, wake lock, lite-профиль сохранены', () => {
    // Swipe
    assert.ok(/manifestOverlay\.addEventListener\('touchstart'/.test(APP_JS), 'swipe touchstart');
    assert.ok(/manifestOverlay\.addEventListener\('touchend'/.test(APP_JS), 'swipe touchend');
    assert.ok(APP_JS.includes('swipeManifestStep'), 'swipeManifestStep');
    // Breathing
    assert.ok(APP_JS.includes('startBreathingGuide') && APP_JS.includes('breathGuideTimer'), 'breathing сохранён');
    // Звук
    assert.ok(APP_JS.includes('startManifestationMusic') && APP_JS.includes('stopManifestationMusic'), 'звук сохранён');
    // Wake lock
    assert.ok(APP_JS.includes('requestManifestWakeLock') && APP_JS.includes('releaseManifestWakeLock'), 'wake lock сохранён');
    // Lite-профиль
    assert.ok(PERFORMANCE_JS.includes('shouldEnableLiteProfile'), 'lite-профиль на месте');
    assert.ok(STYLE_CSS.includes('html.performance-lite'), 'lite-CSS на месте');
    // Autoplay/manifest loop
    assert.ok(APP_JS.includes('startManifestLoop') && APP_JS.includes('manifestInterval'), 'автопролистывание сохранено');
});

test('16. контракты не тронуты: schemaVersion 2, backup format, trash, storage-ключи', () => {
    const STORAGE_JS = fs.readFileSync(path.join(__dirname, 'storage.js'), 'utf8');
    const BACKUP_JS = fs.readFileSync(path.join(__dirname, 'backup.js'), 'utf8');
    const TRASH_JS = fs.readFileSync(path.join(__dirname, 'trash.js'), 'utf8');
    assert.ok(/SCHEMA_VERSION = 2/.test(STORAGE_JS), 'schemaVersion 2');
    assert.ok(/APP_VERSION = 'v14'/.test(STORAGE_JS), 'APP_VERSION v14');
    assert.ok(/'dreamboard-backup'/.test(BACKUP_JS), 'backup format');
    assert.ok(TRASH_JS.includes('dreamboard_trash_v1'), 'trash contract');
    assert.ok(STYLE_CSS.includes('html.performance-lite'), 'lite не сломан');
});

test('17. script order и PRECACHE: новых runtime-файлов нет (всё в app.js/style.css)', () => {
    const scripts = (INDEX_HTML.match(/src="([^"]*\.js)"/g) || []).filter(s => !s.includes('cdnjs'));
    assert.deepStrictEqual(scripts, ['src="storage.js"', 'src="backup.js"', 'src="import.js"', 'src="performance.js"', 'src="trash.js"', 'src="app.js"'],
        'порядок скриптов не изменён');
    const SW_JS = fs.readFileSync(path.join(__dirname, 'service-worker.js'), 'utf8');
    assert.ok(SW_JS.includes("'./app.js'") && SW_JS.includes("'./style.css'"), 'PRECACHE без изменений');
});
