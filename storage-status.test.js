/* ==========================================================================
   DREAMBOARD - STORAGE STATUS UX TESTS (node:test, без внешних зависимостей)
   Запуск: node --test storage-status.test.js
   Проверяет индикатор состояния хранения: deriveStatus (чистая логика) +
   статические свойства разметки (aria, retry, hidden controls, CSS).
   ========================================================================== */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const Storage = require('./storage.js');

const INDEX = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const APP_JS = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const STYLE = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');

// --- 1-11: чистая логика deriveStatus ---------------------------------------

test('1. successful primary load → saved', () => {
    assert.strictEqual(Storage.deriveStatus({ source: 'primary', writeProtected: false, warnings: [] }, null, null), 'saved');
});

test('2. legacy migration success → migrated, затем saved', () => {
    const load = { source: 'legacy', writeProtected: false, warnings: [] };
    // после успешного первого save (pendingLabel='migrated' из app.js)
    assert.strictEqual(Storage.deriveStatus(load, { ok: true }, 'migrated'), 'migrated');
    // следующий успешный save → saved
    assert.strictEqual(Storage.deriveStatus(load, { ok: true }, null), 'saved');
});

test('3. recovery success → recovered, затем saved', () => {
    const load = { source: 'recovery', writeProtected: false, warnings: [] };
    assert.strictEqual(Storage.deriveStatus(load, { ok: true }, 'recovered'), 'recovered');
    assert.strictEqual(Storage.deriveStatus(load, { ok: true }, null), 'saved');
});

test('4. corrupt/future state → readonly', () => {
    assert.strictEqual(Storage.deriveStatus({ source: 'defaults', writeProtected: true, warnings: ['primary-corrupt'] }, null, null), 'readonly');
    assert.strictEqual(Storage.deriveStatus({ source: 'protected', writeProtected: true, warnings: [] }, null, null), 'readonly');
    // даже после save c write-protected → readonly (не error)
    assert.strictEqual(Storage.deriveStatus({ source: 'defaults', writeProtected: true, warnings: [] }, { ok: false, error: 'write-protected' }, null), 'readonly');
});

test('5. missing storage.js → unavailable', () => {
    assert.strictEqual(Storage.deriveStatus({ source: 'defaults', writeProtected: true, unavailable: true, warnings: ['storage-module-missing'] }, null, null), 'unavailable');
    assert.strictEqual(Storage.deriveStatus({ source: 'defaults', writeProtected: false, warnings: ['storage-unavailable'] }, null, null), 'unavailable');
});

test('6. quota error → error', () => {
    assert.strictEqual(Storage.deriveStatus({ source: 'primary', writeProtected: false }, { ok: false, error: 'quota' }, null), 'error');
    assert.strictEqual(Storage.deriveStatus({ source: 'primary', writeProtected: false }, { ok: false, error: 'security' }, null), 'error');
});

test('7. recovery-failed → error', () => {
    assert.strictEqual(Storage.deriveStatus({ source: 'primary', writeProtected: false }, { ok: false, error: 'recovery-failed' }, null), 'error');
});

test('8. retry success → saved', () => {
    const load = { source: 'primary', writeProtected: false };
    assert.strictEqual(Storage.deriveStatus(load, { ok: false, error: 'quota' }, null), 'error');
    assert.strictEqual(Storage.deriveStatus(load, { ok: true }, null), 'saved');
});

test('9. retry failure → error остаётся', () => {
    const load = { source: 'primary', writeProtected: false };
    assert.strictEqual(Storage.deriveStatus(load, { ok: false, error: 'quota' }, null), 'error');
    assert.strictEqual(Storage.deriveStatus(load, { ok: false, error: 'quota' }, null), 'error');
});

test('10. retry не обходит writeProtected (реальный путь save)', () => {
    const data = new Map([['dreamboard_app_state', '{{{']]);
    const storage = { getItem: k => data.has(k) ? data.get(k) : null, setItem: (k, v) => data.set(k, String(v)) };
    const load = Storage.load(storage, { defaultDreams: [] });
    assert.strictEqual(load.writeProtected, true);
    // retry через тот же saveDreams-путь: save c writeProtected
    const saveRes = Storage.save(storage, [{ title: 'x', id: 'i' }], { writeProtected: load.writeProtected });
    assert.strictEqual(saveRes.ok, false);
    assert.strictEqual(saveRes.error, 'write-protected');
    assert.strictEqual(data.get('dreamboard_app_state'), '{{{', 'ничего не записано');
    assert.strictEqual(Storage.deriveStatus(load, saveRes, null), 'readonly');
});

test('11. нет ложного saved до успешного setItem (пустое storage)', () => {
    // пустое хранилище до первичного сохранения → saving, не saved
    assert.strictEqual(Storage.deriveStatus({ source: 'defaults', writeProtected: false, shouldPersist: true, warnings: [] }, null, null), 'saving');
    // после успешного первичного сохранения → saved
    assert.strictEqual(Storage.deriveStatus({ source: 'defaults', writeProtected: false, shouldPersist: true, warnings: [] }, { ok: true }, null), 'saved');
});

// --- 12-15: статические проверки разметки -------------------------------------

test('12. aria-live / role / title присутствуют', () => {
    const m = INDEX.match(/<div class="storage-status" id="storage-status"[^>]*>/);
    assert.ok(m, 'компонент storage-status присутствует в index.html');
    assert.ok(m[0].includes('role="status"'), 'role="status"');
    assert.ok(m[0].includes('aria-live="polite"'), 'aria-live="polite"');
    assert.ok(m[0].includes('aria-label='), 'aria-label');
    assert.ok(m[0].includes('title='), 'title');
    // app.js обновляет aria-label/title при смене статуса
    assert.ok(APP_JS.includes("setAttribute('aria-label', full)"), 'app.js обновляет aria-label');
    assert.ok(APP_JS.includes("setAttribute('title', full)"), 'app.js обновляет title');
});

test('13. error action (Повторить) доступно клавиатурой', () => {
    const btn = INDEX.match(/<button type="button" class="storage-status-retry"[^>]*>/);
    assert.ok(btn, 'кнопка Повторить — нативный button (фокус/клавиатура)');
    assert.ok(btn[0].includes('hidden'), 'изначально скрыта');
    assert.ok(APP_JS.includes("retryEl.addEventListener('click'"), 'обработчик клика');
    assert.ok(APP_JS.includes('storageSaving'), 'блокировка повторного клика');
    assert.ok(STYLE.includes('.storage-status-retry:focus-visible'), 'видимый фокус');
});

test('14. hidden controls Этапа 1A не возвращаются', () => {
    assert.ok(INDEX.includes('<div class="board-selector-group" hidden>'));
    for (const id of ['export-png-btn', 'export-json-btn', 'import-json-btn', 'import-file-input']) {
        const line = INDEX.split('\n').find(l => l.includes(`id="${id}"`));
        assert.ok(line && line.includes('hidden'), `${id} скрыт`);
    }
    for (const id of ['view-grid-btn', 'view-canvas-btn', 'audio-toggle-btn', 'archive-toggle-btn', 'start-manifest-btn']) {
        const line = INDEX.split('\n').find(l => l.includes(`id="${id}"`));
        assert.ok(line && !line.includes('hidden'), `${id} видим`);
    }
});

test('15. мобильная шапка без пустых промежутков', () => {
    // Индикатор внутри header-actions (flex gap) — при скрытом тексте остаётся точка.
    assert.ok(/<div class="header-actions">/.test(INDEX), 'header-actions существует');
    assert.ok(INDEX.includes('class="storage-status"'), 'индикатор в разметке');
    // media-правило сокращает текст, но компонент остаётся (точка + padding)
    assert.ok(STYLE.includes('@media (max-width: 620px)'), 'мобильное медиа-правило');
    assert.ok(STYLE.includes('.storage-status .storage-status-text { display: none; }'), 'текст скрывается на мобильном');
    assert.ok(STYLE.includes('.storage-status { padding: 4px 8px; }'), 'компонент сохраняет компактный размер');
    assert.ok(STYLE.includes('.storage-status-dot'), 'точка остаётся видимой');
    // скрытые 1A-элементы (display:none через [hidden]) не создают пустот в flex
    assert.ok(STYLE.includes('[hidden] { display: none !important; }'), 'hidden-правило на месте');
});

// --- интеграция: все тексты статусов ------------------------------------------

test('тексты статусов соответствуют ТЗ (app.js)', () => {
    for (const [key, text] of Object.entries({
        saved: 'Сохранено на устройстве',
        migrated: 'Данные обновлены до нового формата',
        recovered: 'Данные восстановлены из резервного состояния',
        saving: 'Сохранение…',
        error: 'Изменения не сохранены',
        readonly: 'Только чтение: данные защищены',
        unavailable: 'Хранилище недоступно'
    })) {
        assert.ok(APP_JS.includes(text), `текст ${key}: "${text}"`);
    }
});

test('новые тексты ошибок (без советов про резервную копию)', () => {
    assert.ok(APP_JS.includes('Изменения не сохранены. Освободите место в браузере и повторите сохранение'), 'quota/error текст');
    assert.ok(APP_JS.includes('Данные защищены от перезаписи. Не закрывайте приложение до восстановления'), 'readonly текст');
    assert.ok(APP_JS.includes('Хранилище временно недоступно. Перезагрузите приложение — изменения пока не будут сохранены'), 'unavailable текст');
    assert.ok(!APP_JS.includes('Создайте резервную копию'), 'совет про резервную копию удалён');
});
