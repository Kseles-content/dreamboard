(function (root) {
    'use strict';
    const KEY = 'dreamboard_appearance_v1';
    const defaults = Object.freeze({ theme: 'cosmos', view: 'grid', size: 'normal', details: 'full', fit: 'cover' });
    const choices = { theme: ['cosmos', 'paper'], view: ['grid', 'canvas'], size: ['compact', 'normal', 'large'], details: ['full', 'simple'], fit: ['cover', 'contain'] };
    function normalize(raw) {
        raw = raw && typeof raw === 'object' ? raw : {};
        return Object.fromEntries(Object.keys(defaults).map(key => [key, choices[key].includes(raw[key]) ? raw[key] : defaults[key]]));
    }
    function read(storage) {
        try {
            if (!storage) return { values: { ...defaults }, protected: true };
            const text = storage.getItem(KEY);
            if (text === null) return { values: { ...defaults }, protected: false };
            const data = JSON.parse(text);
            if (!data || data.version !== 1 || !data.values || typeof data.values !== 'object' || Array.isArray(data.values)) return { values: { ...defaults }, protected: true };
            return { values: normalize(data.values), protected: false };
        } catch { return { values: { ...defaults }, protected: true }; }
    }
    function write(storage, values) {
        if (read(storage).protected) return false;
        try { storage.setItem(KEY, JSON.stringify({ version: 1, values: normalize(values) })); return true; }
        catch { return false; }
    }
    const api = { KEY, defaults, normalize, read, write };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.DreamBoardAppearance = api;
    if (!root.document) return;
    let storage = null;
    try { storage = root.localStorage; } catch { /* Session-only appearance remains available. */ }
    let values = read(storage).values;
    function apply(next) {
        values = normalize(next);
        const html = document.documentElement;
        html.dataset.theme = values.theme;
        html.dataset.cardSize = values.size;
        html.dataset.cardDetails = values.details;
        html.dataset.imageFit = values.fit;
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = values.theme === 'paper' ? '#f3efe7' : '#090c16';
        const summary = document.getElementById('board-appearance-summary');
        if (summary) summary.textContent = `${values.theme === 'paper' ? 'Бумага' : 'Космос'} · ${values.view === 'grid' ? 'Сетка' : 'Свободный холст'}`;
        document.dispatchEvent(new CustomEvent('dreamboard:appearance', { detail: { ...values } }));
    }
    api.get = () => ({ ...values });
    api.set = (patch) => {
        const next = normalize({ ...values, ...patch });
        const saved = write(storage, next);
        apply(next);
        return saved;
    };
    apply(values); // Before stylesheet/layout: avoid a flash of the wrong palette.
    document.addEventListener('DOMContentLoaded', () => {
        const dialog = document.getElementById('board-appearance-dialog');
        const form = document.getElementById('board-appearance-form');
        const status = document.getElementById('board-appearance-status');
        const trigger = document.getElementById('board-appearance-open');
        let before = null;
        function fill(next) {
            form.elements.theme.value = next.theme;
            for (const name of ['view', 'size', 'details', 'fit']) form.elements[name].value = next[name];
            form.elements.size.disabled = next.view === 'canvas';
        }
        function cancel() {
            if (before) apply(before);
            dialog.close();
            trigger.focus();
        }
        trigger.addEventListener('click', () => {
            before = api.get();
            fill(before);
            status.textContent = 'Изменения видны сразу. Нажмите «Готово», чтобы сохранить.';
            dialog.showModal();
        });
        form.addEventListener('change', () => {
            const next = normalize(Object.fromEntries(new FormData(form)));
            // A disabled grid size control retains the user's chosen size on canvas.
            if (form.elements.size.disabled) next.size = values.size;
            apply(next); fill(next);
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            const saved = api.set(values);
            if (!saved) {
                status.textContent = 'Вид применён на эту сессию. Браузер не разрешил сохранить настройки. Ваши мечты не затронуты.';
                document.getElementById('board-appearance-done').textContent = 'Закрыть';
                if (form.dataset.saveFailed === 'true') { dialog.close(); trigger.focus(); }
                form.dataset.saveFailed = 'true';
                return;
            }
            dialog.close(); trigger.focus();
        });
        document.getElementById('board-appearance-cancel').addEventListener('click', cancel);
        dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
        dialog.addEventListener('close', () => {
            form.dataset.saveFailed = 'false';
            document.getElementById('board-appearance-done').textContent = 'Готово';
        });
        document.getElementById('board-appearance-reset').addEventListener('click', () => { apply(defaults); fill(defaults); });
        root.addEventListener('storage', event => {
            if (event.key === KEY && !dialog.open) apply(read(storage).values);
        });
        apply(values);
    });
})(typeof window !== 'undefined' ? window : globalThis);
