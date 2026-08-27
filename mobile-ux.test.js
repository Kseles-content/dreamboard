/* ==========================================================================
   DREAMBOARD - MOBILE UX POLISH TESTS (hotfix после релиза v14)
   ==========================================================================
   Покрытие:
   1. Delete UX: нейтральная кнопка удаления, danger только на
      hover/focus-visible/active; на touch без взаимодействия красного нет.
   2. Fullscreen view: нативный <dialog> с showModal() (browser top layer — выше
      header и всех stacking contexts), кнопка «Развернуть» на grid/canvas-карточках,
      touch target >= 44x44, read-only диалог (ARIA), requestFullscreen в том же
      user gesture (не фатально), exitFullscreen только для этого viewer,
      закрытие (кнопка/Escape/backdrop/close), начальный фокус и возврат фокуса,
      desktop dblclick с guard (не action/input/button, не после drag/resize),
      отсутствие mobile double-tap, никакой записи в storage/IDB.
   3. Manifestation mobile/landscape: 100dvh + fallback, safe-area-inset,
      компактность при малой высоте/landscape, min-height:0, overflow-y:auto;
      сохранены swipe, breathing, звук, wake lock, lite-профиль.
   4. Fullscreen Promise: requestFullscreen() возвращает Promise — rejection
      обработан через .catch (динамический тест: нет unhandledrejection,
      dialog остаётся открытым как top-layer fallback).
   5. Mobile menu: один горизонтально прокручиваемый ряд filters и actions
      (≤600px, nowrap), корзина не переносится, touch targets ≥44×44,
      native-кнопка сворачивания (aria-label/aria-expanded/aria-controls,
      состояние только в памяти вкладки), по умолчанию свёрнуто только в
      коротком landscape (max-height:500px), компактный доступ к «Режиму
      Манифестации», desktop layout не изменён.
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

// --------------------------------------------------------------------------
// Хелперы: извлечение function-объявления и целого @media-блока
// (сбалансированные фигурные скобки).
// --------------------------------------------------------------------------
function extractFunction(src, name) {
    const marker = `function ${name}`;
    const start = src.indexOf(marker);
    if (start === -1) return null;
    const brace = src.indexOf('{', start);
    if (brace === -1) return null;
    let depth = 0;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    return null;
}

function mediaBlock(css, query) {
    const start = css.indexOf(`@media ${query}`);
    if (start === -1) return null;
    const open = css.indexOf('{', start);
    if (open === -1) return null;
    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') { depth--; if (depth === 0) return css.slice(open + 1, i); }
    }
    return null;
}

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

test('6. read-only viewer: нативный <dialog> в browser top layer (выше header), ARIA', () => {
    const dialog = INDEX_HTML.match(/<dialog id="dream-view-modal"[\s\S]*?<\/dialog>/);
    assert.ok(dialog, 'нативный <dialog> есть в index.html');
    assert.ok(/class="dream-view-dialog"/.test(dialog[0]), 'класс dream-view-dialog');
    assert.ok(/aria-labelledby="dream-view-title"/.test(dialog[0]), 'aria-labelledby');
    assert.ok(/id="dream-view-title"/.test(dialog[0]), 'заголовок');
    assert.ok(!/class="modal-overlay dream-view-overlay"/.test(INDEX_HTML), 'старый overlay-div заменён на dialog');
    assert.ok(APP_JS.includes('dreamViewModal.showModal()'), 'showModal() — browser top layer выше header');
});

test('6b. dialog CSS: fixed/inset:0/100vw/100dvh, без max-width/max-height/margin/border, ::backdrop', () => {
    const rule = STYLE_CSS.match(/#dream-view-modal\.dream-view-dialog\s*\{([\s\S]*?)\n\}/);
    assert.ok(rule, 'правило #dream-view-modal.dream-view-dialog есть');
    assert.ok(/position:\s*fixed;/.test(rule[1]), 'position:fixed');
    assert.ok(/inset:\s*0;/.test(rule[1]), 'inset:0');
    assert.ok(/width:\s*100vw;/.test(rule[1]), 'width:100vw');
    assert.ok(/height:\s*100dvh;/.test(rule[1]), 'height:100dvh');
    assert.ok(/max-width:\s*none;/.test(rule[1]), 'max-width:none');
    assert.ok(/max-height:\s*none;/.test(rule[1]), 'max-height:none');
    assert.ok(/margin:\s*0;/.test(rule[1]), 'margin:0');
    assert.ok(/border:\s*0;/.test(rule[1]), 'border:0');
    assert.ok(/::backdrop/.test(STYLE_CSS), '::backdrop есть');
    // Контент viewer'а скроллится (ничего не обрезается)
    assert.ok(/flex:\s*1 1 auto;/.test(STYLE_CSS) || /flex:\s*1 1 auto/.test(STYLE_CSS), 'body viewer растягивается');
});

test('6c. fullscreen: requestFullscreen в том же gesture, не фатально; exitFullscreen только для viewer; fullscreenchange', () => {
    const fn = extractFunction(APP_JS, 'requestFullscreenForViewer');
    assert.ok(fn, 'requestFullscreenForViewer есть');
    assert.ok(APP_JS.includes('requestFullscreenForViewer(dreamViewModal)'),
        'fullscreen запрашивается сразу после showModal (тот же user gesture)');
    assert.ok(fn.includes('.catch('), 'rejection обработан через .catch(() => {})');
    assert.ok(fn.includes('try') && fn.includes('catch'), 'sync-ошибки тоже не фатальны');
    assert.ok(APP_JS.includes('document.fullscreenElement === dreamViewModal'), 'exitFullscreen только если viewer — fullscreen element');
    assert.ok(APP_JS.includes('document.exitFullscreen()'), 'exitFullscreen вызывается при закрытии');
    assert.ok(APP_JS.includes("addEventListener('fullscreenchange'"), 'fullscreenchange поддержан');
});

test('6d. динамический: rejected Fullscreen Promise → обработан, dialog открыт, нет unhandledrejection', async () => {
    const fnSrc = extractFunction(APP_JS, 'requestFullscreenForViewer');
    assert.ok(fnSrc, 'функция извлекается из app.js');
    const fn = new Function(`return (${fnSrc});`)();

    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
        // 1) Promise.reject от requestFullscreen — ошибка НЕ выходит наружу
        const fakeViewer = {
            open: true,
            requestFullscreen() {
                return Promise.reject(new Error('Fullscreen API: NotAllowedError'));
            },
        };
        fn(fakeViewer);
        await new Promise(r => setTimeout(r, 30));
        assert.strictEqual(unhandled.length, 0, 'rejection обработан — unhandledrejection не возник');
        assert.strictEqual(fakeViewer.open, true, 'dialog остаётся открытым (top-layer fallback)');

        // 2) Синхронный throw из requestFullscreen — тоже не фатально
        const fakeViewer2 = {
            open: true,
            requestFullscreen() {
                throw new Error('Fullscreen API: sync error');
            },
        };
        fn(fakeViewer2); // не должно бросить
        assert.strictEqual(fakeViewer2.open, true, 'dialog открыт и при sync-ошибке');
        assert.strictEqual(unhandled.length, 0, 'нет unhandledrejection и после sync-ошибки');

        // 3) Отсутствие API — тихий no-op
        fn({ open: true });
        assert.strictEqual(unhandled.length, 0, 'нет unhandledrejection без API');
    } finally {
        process.removeListener('unhandledRejection', onUnhandled);
    }
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

test('8. закрытие: кнопка, Escape (нативный dialog), клик по backdrop, close-событие; фокус', () => {
    assert.ok(APP_JS.includes("dreamViewCloseBtn.addEventListener('click', closeDreamViewModal)"), 'кнопка закрытия');
    // Escape обрабатывается нативным <dialog> (cancel → close), очистка в close-событии
    assert.ok(APP_JS.includes("dreamViewModal.addEventListener('close', closeDreamViewModal)"), 'close-событие (Escape/нативное закрытие)');
    assert.ok(!/dreamViewModal\.addEventListener\('keydown'/.test(APP_JS), 'Escape отдан нативному dialog (нет ручного keydown)');
    assert.ok(/dreamViewModal\.addEventListener\('click'[\s\S]*?e\.target === dreamViewModal/.test(APP_JS), 'backdrop закрывает');
    assert.ok(APP_JS.includes('dreamViewCloseBtn.focus()'), 'начальный фокус на кнопке закрытия');
    assert.ok(APP_JS.includes('trigger.focus()'), 'возврат фокуса на открывшую кнопку');
    assert.ok(APP_JS.includes('document.body.style.overflow = \'\''), 'снятие блокировки скролла при закрытии');
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

// ==========================================================================
// 5. МОБИЛЬНОЕ МЕНЮ: сворачивание, one-row scroll, touch targets, desktop
// ==========================================================================

test('19. mobile (≤600px): filters и actions — один ряд, nowrap + horizontal scroll', () => {
    const block = mediaBlock(STYLE_CSS, '(max-width: 600px)');
    assert.ok(block, 'есть @media (max-width: 600px)');
    const filters = block.match(/\.category-filters\s*\{([^}]*)\}/);
    assert.ok(filters && /flex-wrap:\s*nowrap;/.test(filters[1]), 'filters nowrap');
    assert.ok(filters && /overflow-x:\s*auto;/.test(filters[1]), 'filters horizontal scroll');
    const actions = block.match(/\.header-actions\s*\{([^}]*)\}/);
    assert.ok(actions && /flex-wrap:\s*nowrap;/.test(actions[1]), 'actions nowrap');
    assert.ok(actions && /overflow-x:\s*auto;/.test(actions[1]), 'actions horizontal scroll');
    // Уменьшены только gaps и декоративные padding
    assert.ok(/gap:\s*8px;/.test(block), 'уменьшенные gap в mobile-блоке');
    assert.ok(!/padding:\s*(20|24|32)px/.test(block), 'нет крупных декоративных padding');
});

test('20. trash не переносится одна на новую строку (actions — один ряд)', () => {
    assert.ok(/<div class="header-actions">[\s\S]*?<button id="trash-toggle-btn"/.test(INDEX_HTML),
        'кнопка корзины внутри .header-actions');
    const block = mediaBlock(STYLE_CSS, '(max-width: 600px)');
    assert.ok(block, 'блок 600px есть');
    assert.ok(/\.header-actions\s*\{[^}]*flex-wrap:\s*nowrap;/.test(block),
        'actions nowrap — корзина не может перенестись на новую строку');
    assert.ok(!/\.header-actions\s*\{[^}]*flex-wrap:\s*wrap;/.test(block),
        'в mobile-блоке нет flex-wrap:wrap у actions');
});

test('21. touch targets ≥44×44 (toggle, фильтры, иконки, компактная manifest)', () => {
    const block = mediaBlock(STYLE_CSS, '(max-width: 600px)');
    assert.ok(block, 'блок 600px есть');
    assert.ok(/\.mobile-menu-toggle\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;/.test(block),
        'toggle 44×44');
    assert.ok(/min-width:\s*44px;\s*min-height:\s*44px;/.test(block), 'есть правило 44×44');
    assert.ok(block.includes('.icon-btn') && block.includes('.toggle-btn'), 'охватывает icon/toggle');
    assert.ok(/\.filter-btn\s*\{[^}]*min-height:\s*44px;/.test(block), 'filter-btn min-height 44px');
    assert.ok(/\.mobile-manifest-btn\s*\{[^}]*min-height:\s*44px;/.test(block),
        'компактная manifest-кнопка ≥44px');
});

test('22. native-кнопка сворачивания: имя, aria-expanded, aria-controls', () => {
    const toggle = INDEX_HTML.match(/<button id="mobile-menu-toggle"[\s\S]*?<\/button>/);
    assert.ok(toggle, 'native <button id="mobile-menu-toggle"> есть');
    assert.ok(/type="button"/.test(toggle[0]), 'type=button');
    assert.ok(/aria-label=/.test(toggle[0]), 'доступное имя (aria-label)');
    assert.ok(/title=/.test(toggle[0]), 'доступное имя (title)');
    assert.ok(/aria-expanded="true"/.test(toggle[0]), 'aria-expanded начальное (развёрнуто)');
    assert.ok(/aria-controls="mobile-menu-panel"/.test(toggle[0]), 'aria-controls указывает на панель');
    assert.ok(/id="mobile-menu-panel"/.test(INDEX_HTML), 'панель #mobile-menu-panel есть');
    // JS обновляет aria-expanded и класс menu-collapsed
    assert.ok(APP_JS.includes("setAttribute('aria-expanded', String(!mobileMenuCollapsed))"),
        'JS переключает aria-expanded');
    assert.ok(APP_JS.includes("classList.toggle('menu-collapsed', mobileMenuCollapsed)"),
        'JS переключает класс menu-collapsed');
});

test('23. по умолчанию свёрнуто ТОЛЬКО в коротком landscape (max-height:500px)', () => {
    assert.ok(APP_JS.includes("'(orientation: landscape) and (max-height: 500px)'"),
        'JS использует short-landscape breakpoint');
    assert.ok(APP_JS.includes('window.matchMedia'), 'matchMedia используется');
    assert.ok(APP_JS.includes('mobileMenuCollapsed = !!('), 'начальное состояние = short landscape');
    assert.ok(!/matchMedia\('\(max-width: 600px\)'\)/.test(APP_JS),
        'сворачивание НЕ привязано к ширине (только short landscape)');
    assert.ok(/\.mobile-menu-toggle,\s*\.mobile-manifest-btn\s*\{[\s\S]*?display:\s*none;/.test(STYLE_CSS),
        'на desktop кнопки скрыты (базовое правило)');
});

test('24. переключение меню НЕ пишет в localStorage/sessionStorage/IDB', () => {
    const fn = extractFunction(APP_JS, 'initMobileMenu');
    assert.ok(fn, 'initMobileMenu есть');
    assert.ok(!/localStorage/.test(fn), 'нет localStorage');
    assert.ok(!/sessionStorage/.test(fn), 'нет sessionStorage');
    assert.ok(!/indexedDB/.test(fn), 'нет indexedDB');
    assert.ok(!/IDBDatabase/.test(fn), 'нет IDBDatabase');
    const applyFn = extractFunction(APP_JS, 'applyMobileMenuState');
    assert.ok(applyFn, 'applyMobileMenuState есть');
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(applyFn), 'apply тоже без storage');
});

test('25. desktop: layout не изменён (top-row/panel — display:contents, mobile-кнопки скрыты)', () => {
    assert.ok(/\.header-top-row\s*\{[\s\S]*?display:\s*contents;/.test(STYLE_CSS),
        '.header-top-row на desktop растворяется (display:contents)');
    assert.ok(/#mobile-menu-panel\s*\{[\s\S]*?display:\s*contents;/.test(STYLE_CSS),
        '#mobile-menu-panel на desktop растворяется (display:contents)');
    assert.ok(/\.mobile-manifest-btn[^{]*\{[\s\S]*?display:\s*none;/.test(STYLE_CSS),
        'компактная manifest-кнопка скрыта на desktop');
    // Базовое правило .app-header не получило переносов/скролла
    const baseHeader = STYLE_CSS.match(/\.app-header\s*\{([^}]*)\}/);
    assert.ok(baseHeader && !/flex-wrap:\s*wrap/.test(baseHeader[1]), 'desktop .app-header без wrap');
    assert.ok(baseHeader && !/overflow-x:\s*auto/.test(baseHeader[1]), 'desktop .app-header без скролла');
    // Основная manifest-кнопка осталась в .header-actions (desktop-вид прежний)
    assert.ok(/<div class="header-actions">[\s\S]*?id="start-manifest-btn"/.test(INDEX_HTML),
        'основная manifest-кнопка осталась в actions');
});

test('26. компактный доступ к «Режиму Манифестации» при свёрнутом меню', () => {
    const compactBtn = INDEX_HTML.match(/<button id="mobile-manifest-btn"[\s\S]*?<\/button>/);
    assert.ok(compactBtn, 'mobile-manifest-btn есть');
    assert.ok(/Манифестация/.test(compactBtn[0]), 'видимый текст «Манифестация»');
    assert.ok(/aria-label="Режим манифестации"/.test(compactBtn[0]), 'aria-label «Режим манифестации»');
    assert.ok(/title="Режим манифестации"/.test(compactBtn[0]), 'title «Режим манифестации»');
    assert.ok(APP_JS.includes("mobileManifestBtn.addEventListener('click', startManifestationFromGesture)"),
        'компактная кнопка ведёт в общий user-gesture путь');
    assert.ok(!APP_JS.includes('startManifestBtn.click()'), 'нет делегирования через синтетический click');
    const block = mediaBlock(STYLE_CSS, '(max-width: 600px)');
    assert.ok(block && /\.mobile-manifest-btn\s*\{[^}]*display:\s*inline-flex;/.test(block),
        'компактная manifest видна на mobile (в т.ч. при свёрнутом меню)');
    assert.ok(/\.app-header\.menu-collapsed\s+#mobile-menu-panel\s*\{[\s\S]*?display:\s*none;/.test(STYLE_CSS),
        'при сворачивании скрывается только панель (filters/actions)');
    // Основная кнопка на desktop — текст не изменён
    const mainBtn = INDEX_HTML.match(/<button id="start-manifest-btn"[\s\S]*?<\/button>/);
    assert.ok(mainBtn && /Режим Манифестации/.test(mainBtn[0]), 'desktop-текст основной кнопки не изменён');
});

// ==========================================================================
// 6. FULLSCREEN МАНИФЕСТАЦИИ (hotfix: manifest fullscreen)
// ==========================================================================

test('27. обе кнопки запускают один общий user-gesture путь (startManifestationFromGesture)', () => {
    assert.ok(APP_JS.includes("startManifestBtn.addEventListener('click', startManifestationFromGesture)"),
        'основная кнопка → общий путь');
    assert.ok(APP_JS.includes("mobileManifestBtn.addEventListener('click', startManifestationFromGesture)"),
        'компактная кнопка → тот же общий путь');
    assert.ok(!APP_JS.includes('startManifestBtn.click()'), 'нет синтетического click-делегирования');
    const fn = extractFunction(APP_JS, 'startManifestationFromGesture');
    assert.ok(fn, 'startManifestationFromGesture есть');
    assert.ok(fn.includes('enterManifestMode(activeDreams)'), 'активация overlay');
    assert.ok(fn.includes('requestFullscreenForManifestOverlay()'),
        'fullscreen запрашивается после активации overlay в том же gesture');
});

test('28. requestFullscreenForManifestOverlay: try/catch + .catch, без повторных запросов', () => {
    const fn = extractFunction(APP_JS, 'requestFullscreenForManifestOverlay');
    assert.ok(fn, 'requestFullscreenForManifestOverlay есть');
    assert.ok(fn.includes('try') && fn.includes('catch'), 'sync throw → try/catch');
    assert.ok(fn.includes('.catch('), 'Promise rejection → .catch(() => {})');
    assert.ok(fn.includes("typeof manifestOverlay.requestFullscreen !== 'function'"),
        'unsupported API → тихий no-op');
    // Вызов только из user-gesture пути: ровно один call-site (`();` — не определение)
    const calls = (APP_JS.match(/requestFullscreenForManifestOverlay\(\);/g) || []).length;
    assert.strictEqual(calls, 1, 'fullscreen запрашивается ТОЛЬКО из жеста (не на visibilitychange/fullscreenchange)');
    // Нет orientation lock
    assert.ok(!APP_JS.includes('screen.orientation.lock'), 'orientation lock не добавлен');
});

test('29. динамический: fullscreen манифестации success/reject/throw/unsupported', async () => {
    const fnSrc = extractFunction(APP_JS, 'requestFullscreenForManifestOverlay');
    assert.ok(fnSrc, 'функция извлекается');
    // Функция замыкается на manifestOverlay — передаём фейк через sandbox-параметр
    const makeFn = (fakeOverlay) => new Function('manifestOverlay', `return (${fnSrc});`)(fakeOverlay);
    const unhandled = [];
    const onUnhandled = (r) => unhandled.push(r);
    process.on('unhandledRejection', onUnhandled);
    try {
        // success
        const okViewer = { active: true, requestFullscreen: () => Promise.resolve() };
        makeFn(okViewer)();
        await new Promise(r => setTimeout(r, 20));
        assert.strictEqual(okViewer.active, true, 'success: overlay остаётся активным');
        // reject → обработан, нет unhandledrejection
        const rejViewer = { active: true, requestFullscreen: () => Promise.reject(new Error('NotAllowedError')) };
        makeFn(rejViewer)();
        await new Promise(r => setTimeout(r, 20));
        assert.strictEqual(unhandled.length, 0, 'reject обработан — нет unhandledrejection');
        assert.strictEqual(rejViewer.active, true, 'reject: манифестация продолжается (overlay активен)');
        // sync throw
        const thrViewer = { active: true, requestFullscreen: () => { throw new Error('sync'); } };
        makeFn(thrViewer)(); // не должно бросить
        assert.strictEqual(thrViewer.active, true, 'throw: overlay активен');
        // unsupported (нет метода)
        makeFn({ active: true })();
        assert.strictEqual(unhandled.length, 0, 'нет unhandledrejection ни в одном сценарии');
    } finally {
        process.removeListener('unhandledRejection', onUnhandled);
    }
});

test('30. exit: document.exitFullscreen() только если fullscreenElement === manifestOverlay; viewer независим', () => {
    const exitFn = extractFunction(APP_JS, 'exitManifestMode');
    assert.ok(exitFn, 'exitManifestMode есть');
    assert.ok(exitFn.includes('document.fullscreenElement === manifestOverlay'),
        'guard: exit только для overlay манифестации');
    assert.ok(exitFn.includes('document.exitFullscreen()'), 'exitFullscreen вызывается');
    assert.ok(exitFn.includes('.catch('), 'rejection выхода обработан');
    // Viewer-путь не сломан: его guard и функция остались
    assert.ok(APP_JS.includes('document.fullscreenElement === dreamViewModal'),
        'viewer guard на месте (независим от манифестации)');
    assert.ok(APP_JS.includes('requestFullscreenForViewer(dreamViewModal)'), 'viewer fullscreen на месте');
    const manifestFn = extractFunction(APP_JS, 'requestFullscreenForManifestOverlay');
    assert.ok(manifestFn && !manifestFn.includes('dreamViewModal'), 'manifest fullscreen не трогает viewer');
});

test('31. компактная кнопка: короткая подпись + полное aria-label; текст не обрезается (nowrap)', () => {
    const compactBtn = INDEX_HTML.match(/<button id="mobile-manifest-btn"[\s\S]*?<\/button>/);
    assert.ok(compactBtn, 'кнопка есть');
    const visible = compactBtn[0].match(/<span>([^<]*)<\/span>/);
    assert.ok(visible && visible[1] === 'Манифестация', 'видимый текст — короткий «Манифестация»');
    assert.ok(/aria-label="Режим манифестации"/.test(compactBtn[0]), 'полное aria-label «Режим манифестации»');
    assert.ok(/title="Режим манифестации"/.test(compactBtn[0]), 'полный title «Режим манифестации»');
    // На mobile текст не обрезается: nowrap + нет overflow-обрезания
    const block = mediaBlock(STYLE_CSS, '(max-width: 600px)');
    assert.ok(block, 'блок 600px есть');
    assert.ok(/\.mobile-manifest-btn\s*\{[^}]*white-space:\s*nowrap;/.test(block), 'nowrap — текст не переносится');
    assert.ok(!/\.mobile-manifest-btn\s*\{[^}]*overflow:\s*hidden;/.test(block), 'нет скрытия переполнения (обрезания)');
    // Основная кнопка desktop: текст прежний
    const mainBtn = INDEX_HTML.match(/<button id="start-manifest-btn"[\s\S]*?<\/button>/);
    assert.ok(mainBtn && /<span>Режим Манифестации<\/span>/.test(mainBtn[0]), 'desktop-текст основной кнопки не изменён');
});
