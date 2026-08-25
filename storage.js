/* ==========================================================================
   DREAMBOARD - VERSIONED STORAGE LAYER (v14)
   ==========================================================================
   Безопасный слой хранения с версией схемы, автоматической миграцией
   legacy dreams_db и восстановлением после повреждения данных.

   Работает в браузере (window.DreamBoardStorage) и в Node
   (module.exports) без внешних зависимостей.

   Ключи localStorage:
   - dreamboard_app_state           (primary, schemaVersion 2)
   - dreamboard_app_state_recovery  (последнее корректное primary)
   - dreams_db                      (legacy v13 — НЕ изменяется, страховка)

   Схема (schemaVersion: 2):
   {
     "schemaVersion": 2,
     "appVersion": "v14",
     "savedAt": "ISO-8601",
     "dreams": [ { id, title, category, year, desc, imageUrl,
                   milestones: [{id,text,checked}], status, canvasPos,
                   gratitudeNote } ],
     "settings": {},
     "uiState": {}
   }

   Порядок безопасной загрузки:
   primary → recovery → legacy dreams_db → DEFAULT_DREAMS.
   Сохранение: сначала предыдущее корректное primary пишется в recovery,
   затем новый primary. Ошибки возвращаются структурированно, без
   исключений наружу. Пользовательское содержимое никогда не логируется.
   ========================================================================== */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.DreamBoardStorage = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SCHEMA_VERSION = 2;
    var APP_VERSION = 'v14';
    var KEY_PRIMARY = 'dreamboard_app_state';
    var KEY_RECOVERY = 'dreamboard_app_state_recovery';
    var KEY_LEGACY = 'dreams_db';

    var ALLOWED_CATEGORIES = ['career', 'wealth', 'health', 'travel', 'relationships', 'growth'];
    var ALLOWED_STATUSES = ['active', 'manifested'];

    var DEFAULT_CANVAS_POS = { x: 0, y: 0, width: 320, height: 420 };
    var CANVAS_COORD_LIMIT = 100000; // разумный предел координат
    var CANVAS_MIN_SIZE = 40;
    var CANVAS_MAX_SIZE = 4000;
    var YEAR_MIN = 1900;
    var YEAR_MAX = 2200;

    // Ключи, недопустимые при копировании (защита от prototype pollution).
    var UNSAFE_KEYS = { '__proto__': true, 'constructor': true, 'prototype': true };

    // --- утилиты -------------------------------------------------------------

    function isPlainObject(v) {
        if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
        var proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
    }

    function isFiniteNumber(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }

    function isReasonableInteger(v, min, max) {
        return isFiniteNumber(v) && Number.isInteger(v) && v >= min && v <= max;
    }

    function safeParse(str) {
        if (typeof str !== 'string') return { ok: false };
        try {
            return { ok: true, value: JSON.parse(str) };
        } catch (e) {
            return { ok: false };
        }
    }

    function classifyError(e) {
        if (e && e.name === 'QuotaExceededError') return 'quota';
        if (e && e.name === 'SecurityError') return 'security';
        return 'unknown';
    }

    function safeGet(storage, key) {
        if (!storage || typeof storage.getItem !== 'function') {
            return { ok: false, unavailable: true };
        }
        try {
            return { ok: true, value: storage.getItem(key) };
        } catch (e) {
            // Недоступный storage (например, SecurityError в sandboxed контексте).
            return { ok: false, unavailable: true };
        }
    }

    function safeSet(storage, key, value) {
        if (!storage || typeof storage.setItem !== 'function') {
            return { ok: false, error: 'storage-unavailable' };
        }
        try {
            storage.setItem(key, value);
            return { ok: true };
        } catch (e) {
            return { ok: false, error: classifyError(e) };
        }
    }

    function cloneValue(v) {
        // Глубокая безопасная копия без исполнения пользовательского содержимого.
        if (v === null || typeof v !== 'object') return v;
        if (Array.isArray(v)) {
            var a = [];
            for (var i = 0; i < v.length; i++) a.push(cloneValue(v[i]));
            return a;
        }
        var o = {};
        var keys = Object.keys(v);
        for (var j = 0; j < keys.length; j++) {
            var k = keys[j];
            if (UNSAFE_KEYS[k]) continue;
            o[k] = cloneValue(v[k]);
        }
        return o;
    }

    // --- нормализация --------------------------------------------------------

    function normalizeCanvasPos(pos) {
        var out = {
            x: DEFAULT_CANVAS_POS.x,
            y: DEFAULT_CANVAS_POS.y,
            width: DEFAULT_CANVAS_POS.width,
            height: DEFAULT_CANVAS_POS.height
        };
        if (!isPlainObject(pos)) return out;
        if (isFiniteNumber(pos.x) && Math.abs(pos.x) <= CANVAS_COORD_LIMIT) out.x = pos.x;
        if (isFiniteNumber(pos.y) && Math.abs(pos.y) <= CANVAS_COORD_LIMIT) out.y = pos.y;
        if (isFiniteNumber(pos.width) && pos.width >= CANVAS_MIN_SIZE && pos.width <= CANVAS_MAX_SIZE) out.width = pos.width;
        if (isFiniteNumber(pos.height) && pos.height >= CANVAS_MIN_SIZE && pos.height <= CANVAS_MAX_SIZE) out.height = pos.height;
        return out;
    }

    function normalizeMilestones(list) {
        var out = [];
        if (!Array.isArray(list)) return out;
        for (var i = 0; i < list.length; i++) {
            var m = list[i];
            if (!isPlainObject(m)) continue;
            var id = (typeof m.id === 'string' && m.id) ? m.id : ('m' + i + '-' + Math.random().toString(36).slice(2, 8));
            out.push({
                id: id,
                text: typeof m.text === 'string' ? m.text : '',
                checked: m.checked === true
            });
        }
        return out;
    }

    function normalizeDream(raw) {
        if (!isPlainObject(raw)) return null;
        if (typeof raw.title !== 'string' || raw.title.length === 0) return null; // обязательное поле

        var id = (typeof raw.id === 'string' && raw.id) ? raw.id
            : ('dream-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));

        var category = typeof raw.category === 'string' ? raw.category : 'career';
        // Неизвестные категории-строки сохраняем как есть (не теряем данные).
        var status = ALLOWED_STATUSES.indexOf(raw.status) !== -1 ? raw.status : 'active';
        var year = isReasonableInteger(raw.year, YEAR_MIN, YEAR_MAX) ? raw.year : null;

        return {
            id: id,
            title: raw.title,
            category: category,
            year: year,
            desc: typeof raw.desc === 'string' ? raw.desc : '',
            imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : '',
            milestones: normalizeMilestones(raw.milestones),
            status: status,
            canvasPos: normalizeCanvasPos(raw.canvasPos),
            gratitudeNote: typeof raw.gratitudeNote === 'string' ? raw.gratitudeNote : ''
        };
    }

    function normalizeDreams(list) {
        if (!Array.isArray(list)) return [];
        var out = [];
        var seen = {};
        for (var i = 0; i < list.length; i++) {
            var d = normalizeDream(list[i]);
            if (!d) continue;
            if (seen[d.id]) {
                d.id = 'dream-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '-' + i;
            }
            seen[d.id] = true;
            out.push(d);
        }
        return out;
    }

    function normalizeSideObject(v) {
        // settings / uiState: plain object → безопасная копия; иначе пустой объект.
        if (!isPlainObject(v)) return {};
        return cloneValue(v);
    }

    function normalizeState(raw) {
        if (!isPlainObject(raw)) return { ok: false, reason: 'not-object' };
        if (!isFiniteNumber(raw.schemaVersion)) return { ok: false, reason: 'no-schema-version' };
        if (raw.schemaVersion > SCHEMA_VERSION) {
            return { ok: false, protected: true, reason: 'newer-schema' };
        }
        if (raw.schemaVersion < 1) return { ok: false, reason: 'bad-schema-version' };
        if (!Array.isArray(raw.dreams)) return { ok: false, reason: 'dreams-not-array' };

        return {
            ok: true,
            state: {
                schemaVersion: SCHEMA_VERSION,
                appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : APP_VERSION,
                savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
                dreams: normalizeDreams(raw.dreams),
                settings: normalizeSideObject(raw.settings),
                uiState: normalizeSideObject(raw.uiState)
            }
        };
    }

    function createState(dreams) {
        return {
            schemaVersion: SCHEMA_VERSION,
            appVersion: APP_VERSION,
            savedAt: new Date().toISOString(),
            dreams: normalizeDreams(dreams),
            settings: {},
            uiState: {}
        };
    }

    // --- загрузка ------------------------------------------------------------

    function cloneDefaults(defaults) {
        return normalizeDreams(defaults);
    }

    function load(storage, opts) {
        opts = opts || {};
        var defaults = Array.isArray(opts.defaultDreams) ? opts.defaultDreams : [];
        var warnings = [];

        // 1. Primary state.
        var primary = safeGet(storage, KEY_PRIMARY);
        if (primary.unavailable) {
            // C: localStorage недоступен / getItem бросает SecurityError → read-only.
            warnings.push('storage-unavailable');
            return {
                source: 'defaults',
                dreams: cloneDefaults(defaults),
                state: null,
                writeProtected: true,
                shouldPersist: false,
                warnings: warnings
            };
        }
        if (primary.value !== null && primary.value !== undefined) {
            var p = safeParse(primary.value);
            if (p.ok) {
                var n = normalizeState(p.value);
                if (n.ok) {
                    // F: primary корректен → обычная работа.
                    return { source: 'primary', dreams: n.state.dreams, state: n.state, writeProtected: false, shouldPersist: false, warnings: warnings };
                }
                if (n.protected) {
                    // A: schemaVersion выше поддерживаемой → режим защиты.
                    return {
                        source: 'protected',
                        dreams: cloneDefaults(defaults),
                        state: null,
                        writeProtected: true,
                        shouldPersist: false,
                        warnings: warnings,
                        protected: true,
                        reason: n.reason
                    };
                }
            }
            warnings.push('primary-corrupt');
        }

        // 2. Recovery state.
        var rec = safeGet(storage, KEY_RECOVERY);
        if (!rec.unavailable && rec.value !== null && rec.value !== undefined) {
            var rp = safeParse(rec.value);
            if (rp.ok) {
                var rn = normalizeState(rp.value);
                if (rn.ok) {
                    // G: recovery корректен → разрешено восстановление primary.
                    return { source: 'recovery', dreams: rn.state.dreams, state: rn.state, writeProtected: false, shouldPersist: true, warnings: warnings };
                }
            }
            warnings.push('recovery-corrupt');
        }

        // 3. Legacy dreams_db (v13).
        var legacy = safeGet(storage, KEY_LEGACY);
        if (!legacy.unavailable && legacy.value !== null && legacy.value !== undefined) {
            var lp = safeParse(legacy.value);
            if (lp.ok && Array.isArray(lp.value)) {
                var dreams = normalizeDreams(lp.value);
                // Пустой legacy-массив тоже валиден (пользователь удалил все цели).
                if (lp.value.length === 0 || dreams.length > 0) {
                    // H/I: legacy корректен (в т.ч. пустой) → миграция разрешена.
                    return {
                        source: 'legacy',
                        dreams: dreams,
                        state: null,
                        writeProtected: false,
                        shouldPersist: true,
                        warnings: warnings,
                        legacyPreserved: true
                    };
                }
            }
            warnings.push('legacy-corrupt');
        }

        // B: все источники повреждены → fallback с защитой от перезаписи.
        // E: хранилище полностью пустое → чистый seed, запись разрешена.
        var allEmpty = warnings.length === 0;
        return {
            source: 'defaults',
            dreams: cloneDefaults(defaults),
            state: null,
            writeProtected: !allEmpty,
            shouldPersist: allEmpty,
            warnings: warnings
        };
    }

    // --- сохранение ----------------------------------------------------------

    function save(storage, dreams, opts) {
        opts = opts || {};
        var state = createState(dreams);
        var payload = JSON.stringify(state);

        var existing = safeGet(storage, KEY_PRIMARY);
        if (existing.unavailable) {
            // C: localStorage недоступен.
            return { ok: false, error: 'storage-unavailable', warnings: [] };
        }

        // Write protection из результата load() (app.js передаёт opts.writeProtected).
        if (opts.writeProtected) {
            return { ok: false, error: 'write-protected', warnings: [] };
        }

        // Самозащита: не перезаписывать данные более новой схемы старым кодом
        // (срабатывает даже если opts.writeProtected не был передан).
        if (existing.value !== null && existing.value !== undefined) {
            var ep = safeParse(existing.value);
            if (ep.ok && isPlainObject(ep.value) && isFiniteNumber(ep.value.schemaVersion) && ep.value.schemaVersion > SCHEMA_VERSION) {
                return { ok: false, error: 'newer-schema-protected', warnings: [] };
            }
        }

        // 2. Recovery ← предыдущее корректное primary (байт-в-байт).
        var hasValidPrevious = false;
        if (existing.value !== null && existing.value !== undefined) {
            var ev = safeParse(existing.value);
            if (ev.ok) {
                var en = normalizeState(ev.value);
                if (en.ok) {
                    hasValidPrevious = true;
                    var recWrite = safeSet(storage, KEY_RECOVERY, existing.value);
                    if (!recWrite.ok) {
                        // Атомарность: recovery не удался → primary НЕ пишем,
                        // старый primary остаётся байт-в-байт прежним.
                        return { ok: false, error: 'recovery-failed', warnings: ['recovery-' + recWrite.error] };
                    }
                }
            }
        }

        // 3. Primary.
        var primWrite = safeSet(storage, KEY_PRIMARY, payload);
        if (!primWrite.ok) {
            // recovery остаётся корректной копией предыдущего primary.
            return { ok: false, error: primWrite.error, warnings: hasValidPrevious ? ['recovery-written'] : [] };
        }
        return { ok: true, warnings: [] };
    }

    // --- статусы хранения (UI) -------------------------------------------------
    // Чистая функция: вычисляет статус индикатора из результатов load/save.
    // Не обращается к DOM и не хранит состояние — тестируема в Node.
    // pendingLabel: 'migrated' | 'recovered' — показывается один раз после
    // первого успешного save, затем следующий save даёт 'saved'.
    function deriveStatus(loadResult, saveResult, pendingLabel) {
        if (saveResult === 'saving') return 'saving';
        if (loadResult && (loadResult.unavailable || (loadResult.warnings || []).indexOf('storage-unavailable') !== -1)) {
            return 'unavailable';
        }
        if (loadResult && loadResult.writeProtected) return 'readonly';
        if (saveResult && !saveResult.ok) return 'error';
        if (saveResult && saveResult.ok) {
            return pendingLabel || 'saved';
        }
        // Нет результата save (init): primary уже на диске; пустое хранилище
        // до первичного сохранения показывается как 'saving' (seed в процессе).
        if (loadResult && loadResult.source === 'defaults' && loadResult.shouldPersist) return 'saving';
        return 'saved';
    }

    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        APP_VERSION: APP_VERSION,
        KEY_PRIMARY: KEY_PRIMARY,
        KEY_RECOVERY: KEY_RECOVERY,
        KEY_LEGACY: KEY_LEGACY,
        load: load,
        save: save,
        createState: createState,
        normalizeState: normalizeState,
        normalizeDreams: normalizeDreams,
        deriveStatus: deriveStatus
    };
});
