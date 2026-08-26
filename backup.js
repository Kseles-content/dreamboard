/* ==========================================================================
   DREAMBOARD - PORTABLE BACKUP EXPORT (v14, Этап 3)
   ==========================================================================
   Чистый модуль экспорта резервной копии: без DOM, без внешних
   зависимостей, без записи в хранилища. Работает в браузере
   (window.DreamBoardBackup) и в Node (module.exports).

   Контракт файла бэкапа:
   {
     "format": "dreamboard-backup",
     "formatVersion": 1,
     "appVersion": "v14",
     "exportedAt": "ISO-8601",
     "metadata": {
       dreamCount, activeCount, manifestedCount,
       referencedLocalImageCount, includedImageCount, skippedImageCount,
       totalRawImageBytes, warnings: [{ dreamId, imageRef, reason }]
     },
     "state": { schemaVersion 2 — без изменений },
     "images": [{ id, ref, mimeType, size, dataBase64 }]
   }

   Правила:
   - state экспортируется как есть (schemaVersion 2 не трогается);
   - dreams[].imageUrl не переписываются; dbimage:<id> связывается с
     элементом images через точные id и ref;
   - одинаковая ссылка нескольких целей экспортируется один раз;
   - внешние HTTP/HTTPS URL, asset-пути и data URL остаются строками;
   - экспортируются только изображения, на которые ссылается state;
   - неиспользуемые изображения не сканируются;
   - MIME: blob.type → record.mimeType → application/octet-stream (+warning);
   - размер записи в metadata НЕ используется как истина: source of truth —
     фактический blob.size;
   - dataBase64 — только base64 без префикса data:;
   - порядок изображений детерминирован (сортировка по id);
   - warnings содержат только безопасные поля dreamId/imageRef/reason;
   - reason-коды зафиксированы константами REASONS;
   - экспорт работает с независимым deep-клонам state (snapshot);
   - подтверждения (большой размер / пропущенные изображения) — через
     инжектируемый confirm(message) -> Promise<boolean>|boolean;
   - фатальные ошибки и отмены возвращаются структурно, исключения наружу
     не выбрасываются.
   ========================================================================== */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DreamBoardBackup = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var FORMAT = 'dreamboard-backup';
    var FORMAT_VERSION = 1;

    // Допустимые reason-коды (константы, зафиксированы).
    var REASONS = Object.freeze({
        MISSING_RECORD: 'missing-record',
        CORRUPT_RECORD: 'corrupt-record',
        READ_ERROR: 'read-error',
        MISSING_MIME: 'missing-mime'
    });

    // Коды отмены пользователем.
    var CANCEL_REASONS = Object.freeze({
        SIZE_WARNING: 'size-warning-cancelled',
        PARTIAL: 'partial-cancelled'
    });

    // Пороги размера (бинарные MiB: 1024 * 1024).
    var DEFAULT_WARN_BYTES = 15 * 1024 * 1024;   // 15 MiB
    var DEFAULT_BLOCK_BYTES = 50 * 1024 * 1024;  // 50 MiB

    var FALLBACK_MIME = 'application/octet-stream';
    var IMAGE_REF_PREFIX = 'dbimage:';

    // Ключи, недопустимые при копировании (защита от prototype pollution).
    var UNSAFE_KEYS = { '__proto__': true, 'constructor': true, 'prototype': true };

    // --- утилиты -------------------------------------------------------------

    function isPlainObject(v) {
        if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function isBlobLike(v) {
        if (v === null || v === undefined) return false;
        if (typeof Blob !== 'undefined' && v instanceof Blob) return true;
        return typeof v === 'object' && typeof v.size === 'number' && typeof v.type === 'string';
    }

    function deepClone(v) {
        // Глубокая безопасная копия без исполнения пользовательского содержимого.
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(deepClone(v[i]));
            return a;
        }
        var o = {};
        var keys = Object.keys(v);
        for (var j = 0; j < keys.length; j++) {
            var k = keys[j];
            if (UNSAFE_KEYS[k]) continue;
            o[k] = deepClone(v[k]);
        }
        return o;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // --- ссылки на изображения ------------------------------------------------

    // Возвращает [{ dreamId, ref, id }] в порядке появления в dreams.
    // Учитываются все цели, включая archived (status: manifested).
    function collectImageRefs(state) {
        var out = [];
        if (!state || !Array.isArray(state.dreams)) return out;
        for (var i = 0; i < state.dreams.length; i++) {
            var d = state.dreams[i];
            if (!isPlainObject(d)) continue;
            var ref = typeof d.imageUrl === 'string' ? d.imageUrl : '';
            if (ref.indexOf(IMAGE_REF_PREFIX) !== 0) continue;
            out.push({
                dreamId: typeof d.id === 'string' ? d.id : '',
                ref: ref,
                id: ref.slice(IMAGE_REF_PREFIX.length)
            });
        }
        return out;
    }

    // --- политика размера ------------------------------------------------------

    // level: 'ok' | 'warn' | 'block' (warn <= bytes < block → 'warn').
    function checkSizePolicy(totalBytes, opts) {
        opts = opts || {};
        var warnBytes = typeof opts.warnBytes === 'number' ? opts.warnBytes : DEFAULT_WARN_BYTES;
        var blockBytes = typeof opts.blockBytes === 'number' ? opts.blockBytes : DEFAULT_BLOCK_BYTES;
        var level = 'ok';
        if (totalBytes >= blockBytes) level = 'block';
        else if (totalBytes >= warnBytes) level = 'warn';
        return { level: level, totalBytes: totalBytes, warnBytes: warnBytes, blockBytes: blockBytes };
    }

    // --- имя файла ---------------------------------------------------------------

    // Локальные компоненты времени с zero-padding: dreamboard-backup-YYYY-MM-DD-HHmm.json
    function backupFileName(now) {
        var d = now || new Date();
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return 'dreamboard-backup-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.json';
    }

    // --- фатальность недоступности хранилища изображений -------------------------

    // Если есть хотя бы одна dbimage:*-ссылка, а IndexedDB целиком недоступна —
    // это фатальная ошибка. При отсутствии ссылок хранилище не требуется и
    // недоступность IDB не блокирует экспорт.
    function storeFailureIsFatal(refCount, storeAvailable) {
        if (refCount > 0 && !storeAvailable) {
            return {
                code: 'images-store-unavailable',
                message: 'Хранилище изображений недоступно — экспорт невозможен'
            };
        }
        return null;
    }

    // --- экспорт ------------------------------------------------------------------

    // opts: {
    //   state:        валидный state v2 (будет глубоко склонирован),
    //   provider:     { get(id) -> Promise<{ blob, mimeType } | null> } (throw = read error),
    //   toBase64:     async (blob) -> string (base64, без префикса),
    //   appVersion:   строка версии приложения (например 'v14'),
    //   now:          Date для exportedAt и имени файла (инжектируется в тестах),
    //   sizeEstimate: предварительная сумма размеров референсных записей (байты),
    //                 из metadata записей; блокирующий порог по оценке срабатывает
    //                 до чтения blob'ов; после чтения пороги пересчитываются по
    //                 фактическим blob.size (source of truth),
    //   sizePolicy:   { warnBytes, blockBytes } — опционально,
    //   confirm:      async (message) -> boolean — подтверждения пользователя.
    // }
    // Возвращает { ok: true, backup, warnings, stats }
    //        или { ok: false, cancelled: true, reason }
    //        или { ok: false, fatal: { code, message } }.
    async function exportBackup(opts) {
        opts = opts || {};

        // 1. Валидация входных данных (без исключений наружу).
        if (!isPlainObject(opts.state) || !Array.isArray(opts.state.dreams)) {
            return { ok: false, fatal: { code: 'invalid-state', message: 'Невозможно получить состояние' } };
        }
        if (!opts.provider || typeof opts.provider.get !== 'function') {
            return { ok: false, fatal: { code: 'images-store-unavailable', message: 'Хранилище изображений недоступно — экспорт невозможен' } };
        }
        if (typeof opts.toBase64 !== 'function') {
            return { ok: false, fatal: { code: 'invalid-config', message: 'Некорректная конфигурация экспорта' } };
        }
        var confirm = typeof opts.confirm === 'function' ? opts.confirm : function () { return true; };

        // 2. Независимый snapshot: экспорт работает только с копией state.
        var snapshot = deepClone(opts.state);

        // 3. Ссылки в порядке появления в dreams; дедупликация по id.
        var refs = collectImageRefs(snapshot);
        var uniqueIds = [];
        var seenIds = {};
        for (var i = 0; i < refs.length; i++) {
            if (!seenIds[refs[i].id]) {
                seenIds[refs[i].id] = true;
                uniqueIds.push(refs[i].id);
            }
        }

        // 4. Предварительная проверка размера по оценке (records.size из metadata).
        //    Блокирующий порог по оценке срабатывает ДО чтения blob'ов.
        var sizeConfirmed = false;
        if (typeof opts.sizeEstimate === 'number') {
            var estPolicy = checkSizePolicy(opts.sizeEstimate, opts.sizePolicy);
            if (estPolicy.level === 'block') {
                return {
                    ok: false,
                    fatal: {
                        code: 'size-limit',
                        message: 'Экспорт невозможен: изображения (~' + formatBytes(opts.sizeEstimate) + ') превышают лимит ' + formatBytes(estPolicy.blockBytes)
                    }
                };
            }
            if (estPolicy.level === 'warn') {
                var okWarn = await confirm('Резервная копия большая: изображения занимают ~' + formatBytes(opts.sizeEstimate) + '. Экспорт может занять несколько секунд и потребовать память. Продолжить?');
                if (!okWarn) return { ok: false, cancelled: true, reason: CANCEL_REASONS.SIZE_WARNING };
                sizeConfirmed = true;
            }
        }

        // 5. Чтение изображений последовательно (контроль пиковой памяти).
        var included = [];
        var warnings = [];
        var skippedRefs = {};
        var totalRaw = 0;

        for (var j = 0; j < uniqueIds.length; j++) {
            var id = uniqueIds[j];
            var ref = IMAGE_REF_PREFIX + id;
            var entry = null;
            try {
                entry = await opts.provider.get(id);
            } catch (e) {
                pushWarnings(warnings, refs, id, REASONS.READ_ERROR);
                skippedRefs[id] = true;
                continue;
            }
            if (!entry) {
                pushWarnings(warnings, refs, id, REASONS.MISSING_RECORD);
                skippedRefs[id] = true;
                continue;
            }
            var blob = entry.blob;
            if (!isBlobLike(blob)) {
                pushWarnings(warnings, refs, id, REASONS.CORRUPT_RECORD);
                skippedRefs[id] = true;
                continue;
            }
            // MIME: blob.type → record.mimeType → octet-stream + warning.
            var mime = '';
            if (typeof blob.type === 'string' && blob.type) mime = blob.type;
            if (!mime && typeof entry.mimeType === 'string') mime = entry.mimeType;
            if (!mime) {
                mime = FALLBACK_MIME;
                pushWarnings(warnings, refs, id, REASONS.MISSING_MIME);
            }
            var b64 = null;
            try {
                b64 = await opts.toBase64(blob);
            } catch (e) {
                pushWarnings(warnings, refs, id, REASONS.READ_ERROR);
                skippedRefs[id] = true;
                continue;
            }
            if (typeof b64 !== 'string') {
                pushWarnings(warnings, refs, id, REASONS.READ_ERROR);
                skippedRefs[id] = true;
                continue;
            }
            // Защита контракта: dataBase64 только base64 без префикса data:.
            var comma = b64.indexOf(',');
            if (comma !== -1) b64 = b64.slice(comma + 1);

            // Источник истины размера — фактический blob.size.
            var size = typeof blob.size === 'number' ? blob.size : 0;
            totalRaw += size;
            included.push({
                id: id,
                ref: ref,
                mimeType: mime,
                size: size,
                dataBase64: b64
            });
        }

        // 6. Детерминированный порядок изображений.
        included.sort(function (a, b) {
            return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
        });

        // 7. Пороги по фактическим размерам (blob.size — source of truth).
        var actPolicy = checkSizePolicy(totalRaw, opts.sizePolicy);
        if (actPolicy.level === 'block') {
            return {
                ok: false,
                fatal: {
                    code: 'size-limit',
                    message: 'Экспорт невозможен: изображения (~' + formatBytes(totalRaw) + ') превышают лимит ' + formatBytes(actPolicy.blockBytes)
                }
            };
        }
        if (actPolicy.level === 'warn' && !sizeConfirmed) {
            var okWarn2 = await confirm('Резервная копия большая: изображения занимают ~' + formatBytes(totalRaw) + '. Экспорт может занять несколько секунд и потребовать память. Продолжить?');
            if (!okWarn2) return { ok: false, cancelled: true, reason: CANCEL_REASONS.SIZE_WARNING };
        }

        // 8. Сборка контракта.
        var dreams = snapshot.dreams;
        var activeCount = 0;
        var manifestedCount = 0;
        for (var k = 0; k < dreams.length; k++) {
            if (dreams[k] && dreams[k].status === 'manifested') manifestedCount++;
            else activeCount++;
        }

        var skippedCount = Object.keys(skippedRefs).length;

        // 9. Частичный успех: явное подтверждение, что часть изображений не войдёт.
        if (skippedCount > 0) {
            var okPartial = await confirm('Пропущено изображений: ' + skippedCount + '. Часть изображений не войдёт в резервную копию. Скачать без них?');
            if (!okPartial) return { ok: false, cancelled: true, reason: CANCEL_REASONS.PARTIAL };
        }

        var metadata = {
            dreamCount: dreams.length,
            activeCount: activeCount,
            manifestedCount: manifestedCount,
            referencedLocalImageCount: uniqueIds.length,
            includedImageCount: included.length,
            skippedImageCount: skippedCount,
            totalRawImageBytes: totalRaw,
            warnings: warnings
        };

        var backup = {
            format: FORMAT,
            formatVersion: FORMAT_VERSION,
            appVersion: typeof opts.appVersion === 'string' && opts.appVersion ? opts.appVersion : 'unknown',
            exportedAt: (opts.now || new Date()).toISOString(),
            metadata: metadata,
            state: snapshot,
            images: included
        };

        return { ok: true, backup: backup, warnings: warnings, stats: metadata };
    }

    function pushWarnings(warnings, refs, id, reason) {
        // По одному warning на каждую цель, ссылающуюся на проблемный id.
        // Порядок — порядок появления ссылок в dreams (детерминирован).
        for (var i = 0; i < refs.length; i++) {
            if (refs[i].id === id) {
                warnings.push({ dreamId: refs[i].dreamId, imageRef: refs[i].ref, reason: reason });
            }
        }
    }

    // --- скачивание (инжектируемые зависимости, тестируемо в Node) -----------------

    // opts: {
    //   createObjectURL:  (blob) -> url,
    //   revokeObjectURL:  (url) -> void,
    //   triggerDownload:  (url, filename) -> void,
    //   filename:         строка (по умолчанию dreamboard-backup-<локальное время>.json)
    // }
    // objectURL освобождается ровно один раз, включая путь ошибки.
    function downloadJson(backup, opts) {
        opts = opts || {};
        var createObjectURL = opts.createObjectURL;
        var revokeObjectURL = opts.revokeObjectURL;
        var triggerDownload = opts.triggerDownload;
        if (typeof createObjectURL !== 'function' || typeof revokeObjectURL !== 'function' || typeof triggerDownload !== 'function') {
            return { ok: false, error: 'invalid-download-config' };
        }
        var filename = typeof opts.filename === 'string' && opts.filename ? opts.filename : backupFileName(new Date());

        var json;
        try {
            json = JSON.stringify(backup);
        } catch (e) {
            return { ok: false, error: 'serialize-failed' };
        }
        var blob;
        try {
            blob = new Blob([json], { type: 'application/json' });
        } catch (e) {
            return { ok: false, error: 'blob-failed' };
        }
        var url = null;
        try {
            url = createObjectURL(blob);
            triggerDownload(url, filename);
            return { ok: true, url: url, filename: filename, size: blob.size };
        } catch (e) {
            return { ok: false, error: 'download-failed' };
        } finally {
            if (url !== null) {
                try { revokeObjectURL(url); } catch (e) { /* revoke не должен ронять экспорт */ }
            }
        }
    }

    return {
        FORMAT: FORMAT,
        FORMAT_VERSION: FORMAT_VERSION,
        REASONS: REASONS,
        CANCEL_REASONS: CANCEL_REASONS,
        DEFAULT_WARN_BYTES: DEFAULT_WARN_BYTES,
        DEFAULT_BLOCK_BYTES: DEFAULT_BLOCK_BYTES,
        collectImageRefs: collectImageRefs,
        checkSizePolicy: checkSizePolicy,
        backupFileName: backupFileName,
        storeFailureIsFatal: storeFailureIsFatal,
        exportBackup: exportBackup,
        downloadJson: downloadJson,
        deepClone: deepClone
    };
});
