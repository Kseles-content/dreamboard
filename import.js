/* ==========================================================================
   DREAMBOARD - SAFE PORTABLE BACKUP IMPORT (v14, Этап 4)
   ========================================================================== */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.DreamBoardImport = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var FORMAT = 'dreamboard-backup';
    var FORMAT_VERSION = 1;
    var SCHEMA_VERSION = 2;
    var IMAGE_PREFIX = 'dbimage:';
    var MAX_FILE_BYTES = 72 * 1024 * 1024;
    var MAX_RAW_IMAGE_BYTES = 50 * 1024 * 1024;
    var MAX_DREAMS = 1000;
    var MAX_MILESTONES_PER_DREAM = 500;
    var MAX_STRING_LENGTH = 100000;
    var SAFE_ID = /^[A-Za-z0-9._-]{1,160}$/;
    var SAFE_MIME = Object.freeze({
        'image/webp': true,
        'image/png': true,
        'image/jpeg': true,
        'image/gif': true,
        'image/avif': true
    });
    var SAFE_CATEGORIES = { career: true, wealth: true, health: true, travel: true, relationships: true, growth: true };
    var UNSAFE_KEYS = { '__proto__': true, 'constructor': true, 'prototype': true };

    function failure(code, message, details) {
        var out = { ok: false, error: { code: code, message: message } };
        if (details) out.error.details = details;
        return out;
    }

    function isPlainObject(value) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
        var proto = Object.getPrototypeOf(value);
        return proto === Object.prototype || proto === null;
    }

    function isSafeId(value) {
        return typeof value === 'string' && SAFE_ID.test(value) && !UNSAFE_KEYS[value];
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

    function utf8Size(text) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
        if (typeof Buffer !== 'undefined') return Buffer.byteLength(text, 'utf8');
        return unescape(encodeURIComponent(text)).length;
    }

    function hasOversizedString(value, depth) {
        depth = depth || 0;
        if (depth > 64) return true;
        if (typeof value === 'string') return value.length > MAX_STRING_LENGTH;
        if (!value || typeof value !== 'object') return false;
        if (Array.isArray(value)) return value.some(function (item) { return hasOversizedString(item, depth + 1); });
        return Object.keys(value).some(function (key) {
            return key.length > 256 || hasOversizedString(value[key], depth + 1);
        });
    }

    function isSafeText(value, allowEmpty) {
        return typeof value === 'string' && (allowEmpty || value.length > 0) && value.indexOf('<') === -1 && value.indexOf('\u0000') === -1;
    }

    function isFiniteNumber(value) {
        return typeof value === 'number' && Number.isFinite(value);
    }

    function isSafeImageUrl(value) {
        if (value === '') return true;
        if (value.indexOf(IMAGE_PREFIX) === 0) return isSafeId(value.slice(IMAGE_PREFIX.length));
        if (/^assets\/images\/[A-Za-z0-9._/-]+$/.test(value) && value.indexOf('..') === -1) return true;
        if (/^https?:\/\//.test(value) && value.length <= 4096 && !/["'<>\u0000-\u001f]/.test(value)) {
            try {
                var url = new URL(value);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch (e) { return false; }
        }
        return /^data:image\/(?:webp|png|jpeg|gif|avif);base64,[A-Za-z0-9+/]*={0,2}$/.test(value);
    }

    function validateStateShape(state) {
        if (!isPlainObject(state)) return failure('invalid-state', 'В резервной копии отсутствует состояние DreamBoard');
        if (state.schemaVersion !== SCHEMA_VERSION) {
            return failure(state.schemaVersion > SCHEMA_VERSION ? 'future-schema' : 'unsupported-schema', 'Версия данных резервной копии не поддерживается');
        }
        if (!Array.isArray(state.dreams)) return failure('invalid-state', 'Список целей повреждён');
        if (state.dreams.length > MAX_DREAMS) return failure('too-many-dreams', 'В резервной копии слишком много целей');
        if (hasOversizedString(state)) return failure('content-too-large', 'Резервная копия содержит слишком длинные текстовые поля');
        var dreamIds = Object.create(null);
        for (var i = 0; i < state.dreams.length; i++) {
            var dream = state.dreams[i];
            if (!isPlainObject(dream) || !isSafeId(dream.id) || !isSafeText(dream.title, false)) {
                return failure('invalid-dream', 'Одна из целей повреждена');
            }
            if (dreamIds[dream.id]) return failure('duplicate-dream-id', 'В резервной копии повторяется идентификатор цели');
            dreamIds[dream.id] = true;
            if (!SAFE_CATEGORIES[dream.category] || !(dream.year === null || (Number.isInteger(dream.year) && dream.year >= 1900 && dream.year <= 2200)) ||
                !isSafeText(dream.desc, true) || !isSafeImageUrl(dream.imageUrl) ||
                (dream.status !== 'active' && dream.status !== 'manifested') || !isSafeText(dream.gratitudeNote, true)) {
                return failure('invalid-dream', 'Одна из целей содержит небезопасные или неподдерживаемые данные');
            }
            if (!isPlainObject(dream.canvasPos) || !isFiniteNumber(dream.canvasPos.x) || !isFiniteNumber(dream.canvasPos.y) ||
                !isFiniteNumber(dream.canvasPos.width) || !isFiniteNumber(dream.canvasPos.height)) {
                return failure('invalid-canvas', 'Положение одной из целей повреждено');
            }
            if (!Array.isArray(dream.milestones) || dream.milestones.length > MAX_MILESTONES_PER_DREAM) {
                return failure('invalid-milestones', 'Список этапов одной из целей повреждён или слишком велик');
            }
            var milestoneIds = Object.create(null);
            for (var j = 0; j < dream.milestones.length; j++) {
                var milestone = dream.milestones[j];
                if (!isPlainObject(milestone) || !isSafeId(milestone.id) || milestoneIds[milestone.id] ||
                    !isSafeText(milestone.text, true) || typeof milestone.checked !== 'boolean') {
                    return failure('invalid-milestones', 'Один из этапов цели повреждён');
                }
                milestoneIds[milestone.id] = true;
            }
        }
        if (!isPlainObject(state.settings) || !isPlainObject(state.uiState)) return failure('invalid-state', 'Настройки резервной копии повреждены');
        return { ok: true };
    }

    function inspectBackupText(text, opts) {
        opts = opts || {};
        if (typeof text !== 'string') return failure('invalid-file', 'Не удалось прочитать файл резервной копии');
        var byteLength = typeof opts.fileSize === 'number' ? opts.fileSize : utf8Size(text);
        var maxFileBytes = typeof opts.maxFileBytes === 'number' ? opts.maxFileBytes : MAX_FILE_BYTES;
        if (byteLength > maxFileBytes) return failure('file-too-large', 'Файл резервной копии превышает допустимый размер');

        var parsed;
        try { parsed = JSON.parse(text); }
        catch (e) { return failure('invalid-json', 'Файл не является корректной резервной копией JSON'); }

        if (!isPlainObject(parsed) || parsed.format !== FORMAT) return failure('invalid-format', 'Это не резервная копия DreamBoard');
        if (parsed.formatVersion !== FORMAT_VERSION) return failure('unsupported-format', 'Версия формата резервной копии не поддерживается');
        if (!Array.isArray(parsed.images)) return failure('invalid-images', 'Раздел изображений повреждён');

        var stateCheck = validateStateShape(parsed.state);
        if (!stateCheck.ok) return stateCheck;
        if (typeof opts.normalizeState !== 'function') return failure('invalid-config', 'Модуль проверки данных недоступен');
        var normalized = opts.normalizeState(parsed.state);
        if (!normalized || !normalized.ok || !normalized.state) return failure('invalid-state', 'Состояние резервной копии не прошло проверку');
        if (normalized.state.dreams.length !== parsed.state.dreams.length) return failure('lossy-state', 'Часть целей не прошла безопасную проверку');

        var refs = [];
        var uniqueRefs = Object.create(null);
        normalized.state.dreams.forEach(function (dream) {
            var ref = typeof dream.imageUrl === 'string' ? dream.imageUrl : '';
            if (ref.indexOf(IMAGE_PREFIX) !== 0) return;
            var id = ref.slice(IMAGE_PREFIX.length);
            if (!isSafeId(id)) throwInvalidRef(refs);
            refs.push({ dreamId: dream.id, ref: ref, id: id });
            uniqueRefs[ref] = true;
        });
        if (refs.invalid) return failure('invalid-image-ref', 'В резервной копии обнаружена небезопасная ссылка на изображение');

        var imagesByRef = Object.create(null);
        var declaredTotal = 0;
        for (var i = 0; i < parsed.images.length; i++) {
            var image = parsed.images[i];
            if (!isPlainObject(image) || !isSafeId(image.id) || typeof image.mimeType !== 'string') return failure('invalid-image', 'Одна из записей изображения повреждена');
            var expectedRef = IMAGE_PREFIX + image.id;
            if (image.ref !== expectedRef || imagesByRef[image.ref]) return failure('invalid-image-ref', 'Связь изображения с целью повреждена или повторяется');
            if (!uniqueRefs[image.ref]) return failure('unreferenced-image', 'Резервная копия содержит неиспользуемое изображение');
            if (typeof image.dataBase64 !== 'string' || !isCanonicalBase64(image.dataBase64)) return failure('invalid-base64', 'Данные одного из изображений повреждены');
            if (!Number.isInteger(image.size) || image.size < 0) return failure('invalid-image-size', 'Размер одного из изображений указан неверно');
            var calculated = base64DecodedSize(image.dataBase64);
            if (calculated !== image.size) return failure('image-size-mismatch', 'Размер одного из изображений не совпадает с содержимым');
            declaredTotal += calculated;
            if (declaredTotal >= MAX_RAW_IMAGE_BYTES) return failure('image-limit', 'Изображения в резервной копии превышают безопасный лимит 50 МиБ');
            imagesByRef[image.ref] = image;
        }

        var missingRefs = Object.keys(uniqueRefs).filter(function (ref) { return !imagesByRef[ref]; }).sort();
        return {
            ok: true,
            inspected: {
                backup: parsed,
                state: normalized.state,
                refs: refs,
                imagesByRef: imagesByRef,
                missingRefs: missingRefs,
                fileBytes: byteLength,
                rawImageBytes: declaredTotal,
                dreamCount: normalized.state.dreams.length,
                imageCount: parsed.images.length
            }
        };
    }

    function throwInvalidRef(refs) { refs.invalid = true; }

    function isCanonicalBase64(value) {
        if (value === '') return true;
        if (value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return false;
        var firstPadding = value.indexOf('=');
        return firstPadding === -1 || firstPadding >= value.length - 2;
    }

    function base64DecodedSize(value) {
        if (!value) return 0;
        var padding = value.endsWith('==') ? 2 : (value.endsWith('=') ? 1 : 0);
        return (value.length / 4) * 3 - padding;
    }

    function sniffMime(bytes) {
        if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
        if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
        if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
        if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) return 'image/gif';
        if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && ['avif', 'avis'].indexOf(ascii(bytes, 8, 12)) !== -1) return 'image/avif';
        return '';
    }

    function ascii(bytes, start, end) {
        var out = '';
        for (var i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
        return out;
    }

    async function materializeImport(inspected, opts) {
        opts = opts || {};
        if (!inspected || !isPlainObject(inspected.state) || typeof opts.decodeBase64 !== 'function' || typeof opts.createId !== 'function') {
            return failure('invalid-config', 'Импорт не может быть подготовлен');
        }
        var state = cloneSafe(inspected.state);
        var refMap = Object.create(null);
        var usedIds = Object.create(null);
        var records = [];
        var allRefs = Object.keys(inspected.imagesByRef).concat(inspected.missingRefs).sort();

        for (var i = 0; i < allRefs.length; i++) {
            var sourceRef = allRefs[i];
            var newId = opts.createId(i);
            if (!isSafeId(newId) || usedIds[newId]) return failure('unsafe-generated-id', 'Не удалось безопасно создать идентификатор изображения');
            usedIds[newId] = true;
            refMap[sourceRef] = IMAGE_PREFIX + newId;
            var image = inspected.imagesByRef[sourceRef];
            if (!image) continue;
            var bytes;
            try { bytes = await opts.decodeBase64(image.dataBase64); }
            catch (e) { return failure('decode-failed', 'Не удалось декодировать изображение'); }
            if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
            if (bytes.byteLength !== image.size) return failure('image-size-mismatch', 'Размер изображения изменился при декодировании');
            var sniffed = sniffMime(bytes);
            if (!sniffed || !SAFE_MIME[sniffed]) return failure('unsafe-image-type', 'Резервная копия содержит неподдерживаемый тип изображения');
            if (image.mimeType && image.mimeType !== 'application/octet-stream' && image.mimeType !== sniffed) return failure('mime-mismatch', 'Тип изображения не совпадает с его содержимым');
            records.push({ id: newId, bytes: bytes, mimeType: sniffed, size: bytes.byteLength });
        }

        state.dreams.forEach(function (dream) {
            if (refMap[dream.imageUrl]) dream.imageUrl = refMap[dream.imageUrl];
        });
        return {
            ok: true,
            plan: {
                state: state,
                records: records,
                createdIds: Object.keys(usedIds),
                missingImageCount: inspected.missingRefs.length,
                dreamCount: state.dreams.length,
                imageCount: records.length
            }
        };
    }

    async function applyImport(plan, deps) {
        deps = deps || {};
        if (!plan || !Array.isArray(plan.records) || typeof deps.writeImages !== 'function' || typeof deps.saveState !== 'function' || typeof deps.cleanupImages !== 'function') {
            return failure('invalid-config', 'Импорт не может быть применён');
        }
        var written = false;
        try {
            if (plan.records.length) {
                await deps.writeImages(plan.records);
                written = true;
            }
            var saved = await deps.saveState(plan.state);
            if (!saved || !saved.ok) {
                if (written) await safeCleanup(deps.cleanupImages, plan.createdIds);
                return failure(saved && saved.error ? saved.error : 'state-save-failed', 'Не удалось сохранить восстановленные данные');
            }
            return { ok: true, stats: { dreamCount: plan.dreamCount, imageCount: plan.imageCount, missingImageCount: plan.missingImageCount } };
        } catch (e) {
            if (written) await safeCleanup(deps.cleanupImages, plan.createdIds);
            return failure('apply-failed', 'Не удалось применить резервную копию');
        }
    }

    async function safeCleanup(cleanup, ids) {
        try { await cleanup(ids); } catch (e) { /* orphan безопаснее потери текущего state */ }
    }

    return {
        FORMAT: FORMAT,
        FORMAT_VERSION: FORMAT_VERSION,
        SCHEMA_VERSION: SCHEMA_VERSION,
        MAX_FILE_BYTES: MAX_FILE_BYTES,
        MAX_RAW_IMAGE_BYTES: MAX_RAW_IMAGE_BYTES,
        inspectBackupText: inspectBackupText,
        materializeImport: materializeImport,
        applyImport: applyImport,
        isCanonicalBase64: isCanonicalBase64,
        base64DecodedSize: base64DecodedSize,
        sniffMime: sniffMime,
        cloneSafe: cloneSafe
    };
});
