/* ========================================================================== 
   DREAMBOARD - VERSIONED RECENTLY DELETED STORE (v14, Этап 5)
   ========================================================================== */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DreamBoardTrash = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var KEY = 'dreamboard_trash_v1';
    var FORMAT_VERSION = 1;
    var RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
    var MAX_ITEMS = 100;
    var IMAGE_PREFIX = 'dbimage:';
    var SAFE_ID = /^[A-Za-z0-9._-]{1,180}$/;
    var UNSAFE_KEYS = { '__proto__': true, constructor: true, prototype: true };

    function isPlainObject(value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
        var proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    function cloneSafe(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(cloneSafe);
        var out = {};
        Object.keys(value).forEach(function (key) {
            if (!UNSAFE_KEYS[key]) out[key] = cloneSafe(value[key]);
        });
        return out;
    }

    function containsUnsafeValue(value, depth) {
        depth = depth || 0;
        if (depth > 64) return true;
        // User text is data, not markup: titles/descriptions may legitimately contain
        // '<', quotes and emoji. The UI must render it with textContent. Only NUL,
        // excessive nesting and prototype-pollution keys make a stored record unsafe.
        if (typeof value === 'string') return value.indexOf('\u0000') !== -1;
        if (!value || typeof value !== 'object') return false;
        if (Array.isArray(value)) return value.some(function (item) { return containsUnsafeValue(item, depth + 1); });
        return Object.keys(value).some(function (key) { return UNSAFE_KEYS[key] || containsUnsafeValue(value[key], depth + 1); });
    }

    function isSafeDream(dream) {
        if (!isPlainObject(dream) || typeof dream.id !== 'string' || !SAFE_ID.test(dream.id) ||
            typeof dream.title !== 'string' || !dream.title || containsUnsafeValue(dream)) return false;
        if (typeof dream.imageUrl === 'string' && /["'<>\u0000-\u001f]/.test(dream.imageUrl)) return false;
        if (Array.isArray(dream.milestones)) {
            for (var i = 0; i < dream.milestones.length; i++) {
                var milestone = dream.milestones[i];
                if (!isPlainObject(milestone) || typeof milestone.id !== 'string' || !SAFE_ID.test(milestone.id)) return false;
            }
        }
        return true;
    }

    function classifyError(error) {
        if (error && error.name === 'QuotaExceededError') return 'quota';
        if (error && error.name === 'SecurityError') return 'security';
        return 'storage-error';
    }

    function safeGet(storage) {
        if (!storage || typeof storage.getItem !== 'function') return { ok: false, error: 'storage-unavailable' };
        try { return { ok: true, value: storage.getItem(KEY) }; }
        catch (error) { return { ok: false, error: classifyError(error) }; }
    }

    function safeSet(storage, envelope) {
        if (!storage || typeof storage.setItem !== 'function') return { ok: false, error: 'storage-unavailable' };
        try {
            storage.setItem(KEY, JSON.stringify(envelope));
            return { ok: true };
        } catch (error) {
            return { ok: false, error: classifyError(error) };
        }
    }

    function validateRecord(record) {
        if (!isPlainObject(record) || typeof record.id !== 'string' || !SAFE_ID.test(record.id) ||
            typeof record.deletedAt !== 'string' || !Number.isFinite(Date.parse(record.deletedAt)) ||
            !Number.isInteger(record.originalIndex) || record.originalIndex < 0 ||
            !isSafeDream(record.dream)) return null;
        return {
            id: record.id,
            deletedAt: record.deletedAt,
            originalIndex: record.originalIndex,
            dream: cloneSafe(record.dream)
        };
    }

    function load(storage) {
        var read = safeGet(storage);
        if (!read.ok) return { ok: false, protected: true, error: read.error, items: [] };
        if (read.value === null || read.value === undefined || read.value === '') {
            return { ok: true, protected: false, items: [], source: 'empty' };
        }
        var parsed;
        try { parsed = JSON.parse(read.value); }
        catch (error) { return { ok: false, protected: true, error: 'corrupt-json', items: [] }; }
        if (!isPlainObject(parsed) || !Number.isInteger(parsed.formatVersion)) {
            return { ok: false, protected: true, error: 'invalid-format', items: [] };
        }
        if (parsed.formatVersion > FORMAT_VERSION) {
            return { ok: false, protected: true, future: true, error: 'future-format', items: [] };
        }
        if (parsed.formatVersion !== FORMAT_VERSION || !Array.isArray(parsed.items) || parsed.items.length > MAX_ITEMS) {
            return { ok: false, protected: true, error: 'invalid-format', items: [] };
        }
        var items = [];
        var seen = Object.create(null);
        for (var i = 0; i < parsed.items.length; i++) {
            var item = validateRecord(parsed.items[i]);
            if (!item || seen[item.id]) return { ok: false, protected: true, error: 'invalid-record', items: [] };
            seen[item.id] = true;
            items.push(item);
        }
        return { ok: true, protected: false, items: items, source: 'stored' };
    }

    function write(storage, items) {
        return safeSet(storage, { formatVersion: FORMAT_VERSION, items: items.map(cloneSafe) });
    }

    function makeRecord(dream, originalIndex, opts) {
        opts = opts || {};
        var now = opts.now instanceof Date ? opts.now : new Date();
        var makeId = typeof opts.makeId === 'function' ? opts.makeId : function () {
            return 'trash-' + now.getTime().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
        };
        return {
            id: makeId(),
            deletedAt: now.toISOString(),
            originalIndex: originalIndex,
            dream: cloneSafe(dream)
        };
    }

    function add(storage, dream, originalIndex, opts) {
        if (!isPlainObject(dream) || !Number.isInteger(originalIndex) || originalIndex < 0) return { ok: false, error: 'invalid-input' };
        var loaded = load(storage);
        if (!loaded.ok) return { ok: false, protected: true, error: loaded.error };
        if (loaded.items.length >= MAX_ITEMS) return { ok: false, error: 'trash-full' };
        var record = makeRecord(dream, originalIndex, opts);
        if (!validateRecord(record) || loaded.items.some(function (item) { return item.id === record.id; })) return { ok: false, error: 'invalid-record-id' };
        var next = loaded.items.concat([record]);
        var saved = write(storage, next);
        if (!saved.ok) return saved;
        return { ok: true, record: cloneSafe(record), items: next.map(cloneSafe) };
    }

    function remove(storage, recordId) {
        var loaded = load(storage);
        if (!loaded.ok) return { ok: false, protected: true, error: loaded.error };
        var index = loaded.items.findIndex(function (item) { return item.id === recordId; });
        if (index === -1) return { ok: false, error: 'not-found' };
        var removed = loaded.items[index];
        var next = loaded.items.slice(0, index).concat(loaded.items.slice(index + 1));
        var saved = write(storage, next);
        if (!saved.ok) return saved;
        return { ok: true, record: cloneSafe(removed), items: next.map(cloneSafe) };
    }

    function pruneExpired(storage, opts) {
        opts = opts || {};
        var nowMs = opts.now instanceof Date ? opts.now.getTime() : Date.now();
        var retentionMs = typeof opts.retentionMs === 'number' ? opts.retentionMs : RETENTION_MS;
        var loaded = load(storage);
        if (!loaded.ok) return { ok: false, protected: true, error: loaded.error, removed: [] };
        var kept = [];
        var removed = [];
        loaded.items.forEach(function (item) {
            if (nowMs - Date.parse(item.deletedAt) >= retentionMs) removed.push(item);
            else kept.push(item);
        });
        if (!removed.length) return { ok: true, items: loaded.items, removed: [] };
        var saved = write(storage, kept);
        if (!saved.ok) return { ok: false, error: saved.error, removed: [] };
        return { ok: true, items: kept.map(cloneSafe), removed: removed.map(cloneSafe) };
    }

    function isLocalImageRefInUse(ref, dreams, trashItems, excludingDreamId) {
        if (typeof ref !== 'string' || ref.indexOf(IMAGE_PREFIX) !== 0) return false;
        var active = Array.isArray(dreams) ? dreams : [];
        for (var i = 0; i < active.length; i++) {
            if (active[i] && active[i].id !== excludingDreamId && active[i].imageUrl === ref) return true;
        }
        var trashed = Array.isArray(trashItems) ? trashItems : [];
        for (var j = 0; j < trashed.length; j++) {
            if (trashed[j] && trashed[j].dream && trashed[j].dream.imageUrl === ref) return true;
        }
        return false;
    }

    function buildRestore(dreams, record) {
        if (!record || !record.dream) return { ok: false, error: 'invalid-record' };
        var list = Array.isArray(dreams) ? dreams : [];
        if (list.some(function (dream) { return dream && dream.id === record.dream.id; })) return { ok: false, error: 'id-conflict' };
        var index = Math.min(Math.max(record.originalIndex, 0), list.length);
        var next = list.slice();
        next.splice(index, 0, cloneSafe(record.dream));
        return { ok: true, dreams: next, restored: cloneSafe(record.dream), index: index };
    }

    return {
        KEY: KEY,
        FORMAT_VERSION: FORMAT_VERSION,
        RETENTION_MS: RETENTION_MS,
        MAX_ITEMS: MAX_ITEMS,
        load: load,
        write: write,
        add: add,
        remove: remove,
        pruneExpired: pruneExpired,
        isLocalImageRefInUse: isLocalImageRefInUse,
        buildRestore: buildRestore,
        cloneSafe: cloneSafe
    };
});
