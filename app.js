/* ==========================================================================
   DREAMBOARD - INTERACTIVE APPLICATION ENGINE (RU)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // 1. СОСТОЯНИЕ ПРИЛОЖЕНИЯ (STATE)
    // ==========================================================================
    
    // Предустановленные карточки по умолчанию (Seed Data)
    const DEFAULT_DREAMS = [
        {
            id: 'default-career',
            title: 'Основать прибыльный IT-стартап',
            category: 'career',
            year: 2027,
            desc: 'Создать полезный SaaS-продукт, который облегчит жизнь миллионам людей. Команда единомышленников, уютный офис, полный творческой свободы, и неограниченные масштабы для роста.',
            imageUrl: 'assets/images/dream_career.png',
            milestones: [
                { id: 'm1', text: 'Пройти акселератор или разработать MVP', checked: true },
                { id: 'm2', text: 'Привлечь первые 1000 лояльных пользователей', checked: false },
                { id: 'm3', text: 'Выйти на оборот в $50,000/мес', checked: false }
            ],
            status: 'active',
            canvasPos: { x: 2350, y: 2200, width: 320, height: 420 }
        },
        {
            id: 'default-travel',
            title: 'Пожить полгода на тропической вилле у океана',
            category: 'travel',
            year: 2027,
            desc: 'Каждое утро начинать со звуков прибоя, пить кокосы у инфинити-бассейна, работать на открытой террасе в окружении пальм, заниматься серфингом на закате и ощущать абсолютное единение с природой.',
            imageUrl: 'assets/images/dream_travel.png',
            milestones: [
                { id: 'm4', text: 'Найти идеальную локацию (Бали / Таиланд)', checked: true },
                { id: 'm5', text: 'Подготовить бизнес к полностью удаленному формату', checked: false },
                { id: 'm6', text: 'Забронировать виллу мечты', checked: false }
            ],
            status: 'active',
            canvasPos: { x: 2750, y: 2300, width: 320, height: 420 }
        },
        {
            id: 'default-health',
            title: 'Пробежать марафон и обрести дзен в горах',
            category: 'health',
            year: 2026,
            desc: 'Развить крепкое, выносливое тело. Регулярно заниматься йогой и медитировать, очищая разум. Пройти 10-дневный ретрит осознанности (Випассана) и пробежать свой первый официальный марафон (42 км).',
            imageUrl: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
            milestones: [
                { id: 'm7', text: 'Регулярные пробежки 3 раза в неделю по 10 км', checked: true },
                { id: 'm8', text: 'Пройти курс медитации и освоить дыхательные техники', checked: true },
                { id: 'm9', text: 'Успешно завершить марафонский забег с улыбкой', checked: false }
            ],
            status: 'active',
            canvasPos: { x: 2150, y: 2650, width: 320, height: 440 }
        },
        {
            id: 'default-wealth',
            title: 'Финансовая свобода и пассивный доход',
            category: 'wealth',
            year: 2029,
            desc: 'Сформировать надежный диверсифицированный инвестиционный портфель. Путешествовать по миру на роскошной яхте, зная, что будущее семьи полностью обеспечено и деньги работают на меня.',
            imageUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800',
            milestones: [
                { id: 'm10', text: 'Пройти обучение по инвестициям и риск-менеджменту', checked: true },
                { id: 'm11', text: 'Создать финансовую подушку безопасности на 12 месяцев', checked: true },
                { id: 'm12', text: 'Достичь капитала в $1,000,000 с доходностью 8% годовых', checked: false }
            ],
            status: 'active',
            canvasPos: { x: 2550, y: 2750, width: 320, height: 440 }
        }
    ];

    let dreams = [];
    let appStorageRef = null; // localStorage (или null, если недоступен) для storage layer
    let appStorageState = null; // результат load(): source / writeProtected / shouldPersist / warnings / state
    let storageStatusEl = null;      // индикатор #storage-status
    let pendingStatusLabel = null;   // 'migrated' | 'recovered' — показать один раз после первого успешного save
    let storageSaving = false;       // защита от повторного клика «Повторить»
    let importBusy = false;          // защита от повторного запуска импорта
    let trashItems = [];             // persistent recently-deleted records
    let trashProtected = false;      // corrupt/future trash must never be overwritten
    let currentCategoryFilter = 'all';
    let currentViewMode = 'grid'; // 'grid' | 'canvas'

    // Performance-профиль: lite для слабых/мобильных устройств (performance.js).
    // isLite определяется детерминированной чистой функцией shouldEnableLiteProfile
    // (reducedMotion || coarsePointer && (width<=900 || deviceMemory<=4 || cores<=4))
    // и применяется классом performance-lite на <html> до DOMContentLoaded.
    const perfApi = typeof DreamBoardPerformance !== 'undefined' ? DreamBoardPerformance : null;
    const isLite = !!perfApi && perfApi.isLite();

    // Количество декоративных частиц: lite сокращает (без shadowBlur), normal — как было.
    const starCountLimit = isLite && perfApi ? perfApi.LITE_STARFIELD_COUNT : (perfApi ? perfApi.NORMAL_STARFIELD_COUNT : 140);
    const confettiCountLimit = isLite && perfApi ? perfApi.LITE_CONFETTI_COUNT : (perfApi ? perfApi.NORMAL_CONFETTI_COUNT : 120);

    // Управление декоративным RAF (ambient particles) для hidden-паузы.
    let ambientFrameId = null;
    let ambientAnimateFn = null;

    // Координаты и масштаб холста
    let zoom = 1.0;
    let panX = -2100; // Центрируем по умолчанию на карточках
    let panY = -2050;
    
    // Переменные для перетаскивания холста (pan)
    let isPanning = false;
    let isSpacePressed = false;
    let startX = 0;
    let startY = 0;
    
    // Переменные для перетаскивания карточек (drag)
    let activeDragCard = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    
    // Переменные для изменения размеров (resize)
    let activeResizeCard = null;
    let resizeStartW = 0;
    let resizeStartH = 0;
    let resizeStartX = 0;
    let resizeStartY = 0;
    let touchMode = null;
    let lastTouchX = 0;
    let lastTouchY = 0;
    let pinchStartDistance = 0;
    let pinchStartZoom = 1;
    let pinchCanvasX = 0;
    let pinchCanvasY = 0;
    let pinchScreenX = 0;
    let pinchScreenY = 0;

    // Временные вехи при редактировании
    let tempMilestones = [];
    let currentLocalImagePreviewUrl = null;
    let pendingLocalImageRef = null;
    const LOCAL_IMAGE_PREFIX = 'dbimage:';
    const LOCAL_IMAGE_DB_NAME = 'dreamboard-local-images';
    const LOCAL_IMAGE_STORE = 'images';
    const localImageObjectUrls = new Map();

    // Библиотека красивых Unsplash картинок по категориям для быстрого выбора
    const UNSPLASH_PRESETS = {
        career: [
            'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800',
            'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800',
            'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
            'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800'
        ],
        wealth: [
            'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800',
            'https://images.unsplash.com/photo-1563013544-824ae1d704d3?w=800',
            'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=800',
            'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800'
        ],
        health: [
            'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800',
            'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800',
            'https://images.unsplash.com/photo-1486218119243-13883505764c?w=800',
            'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800'
        ],
        travel: [
            'https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800',
            'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800',
            'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800',
            'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800'
        ],
        relationships: [
            'https://images.unsplash.com/photo-1511180595966-530979eb674c?w=800',
            'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?w=800',
            'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=800',
            'https://images.unsplash.com/photo-1517857398124-b624b5a2542a?w=800'
        ],
        growth: [
            'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800',
            'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800',
            'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=800',
            'https://images.unsplash.com/photo-1447069387593-a5de0862481e?w=800'
        ]
    };

    // DOM Элементы
    const gridViewBtn = document.getElementById('view-grid-btn');
    const canvasViewBtn = document.getElementById('view-canvas-btn');
    const gridViewSection = document.getElementById('grid-view-section');
    const canvasViewSection = document.getElementById('canvas-view-section');
    const filterButtons = document.querySelectorAll('.filter-btn');
    const dreamsGrid = document.getElementById('dreams-masonry-grid');
    const canvasViewport = document.getElementById('canvas-viewport');
    const spatialCanvas = document.getElementById('spatial-canvas');
    const canvasZoomIn = document.getElementById('canvas-zoom-in');
    const canvasZoomOut = document.getElementById('canvas-zoom-out');
    const canvasZoomReset = document.getElementById('canvas-zoom-reset');
    const canvasZoomIndicator = document.getElementById('canvas-zoom-indicator');
    const canvasAddDream = document.getElementById('canvas-add-dream');
    
    // Модалка мечты
    const dreamModal = document.getElementById('dream-modal');
    const dreamForm = document.getElementById('dream-form');
    const modalTitle = document.getElementById('modal-title');
    const editDreamId = document.getElementById('edit-dream-id');
    const dreamTitleInput = document.getElementById('dream-title-input');
    const dreamCategorySelect = document.getElementById('dream-category-select');
    const dreamYearInput = document.getElementById('dream-year-input');
    const dreamDescInput = document.getElementById('dream-desc-input');
    const modalMilestonesList = document.getElementById('modal-milestones-list');
    const newMilestoneInput = document.getElementById('new-milestone-input');
    const addMilestoneBtn = document.getElementById('add-milestone-btn');
    const closeButtons = document.querySelectorAll('.close-modal-btn');
    
    // Вкладки картинок
    const tabButtons = document.querySelectorAll('.image-source-tabs .tab-btn');
    const unsplashTab = document.getElementById('unsplash-tab-content');
    const urlTab = document.getElementById('url-tab-content');
    const uploadTab = document.getElementById('upload-tab-content');
    const dreamImageFile = document.getElementById('dream-image-file');
    const localImagePreview = document.getElementById('local-image-preview');
    const localImagePreviewImg = document.getElementById('local-image-preview-img');
    const localImagePreviewName = document.getElementById('local-image-preview-name');
    const localImagePreviewSize = document.getElementById('local-image-preview-size');
    const unsplashSearchInput = document.getElementById('unsplash-search-input');
    const unsplashSearchBtn = document.getElementById('unsplash-search-btn');
    const unsplashResultsGrid = document.getElementById('unsplash-results-grid');
    const dreamImageFinalPath = document.getElementById('dream-image-final-path');

    // Режим Манифестации
    const startManifestBtn = document.getElementById('start-manifest-btn');
    const manifestOverlay = document.getElementById('manifest-mode-overlay');
    const exitManifestBtn = document.getElementById('exit-manifest-btn');
    const manifestSlider = document.getElementById('manifest-slider-container');
    const manifestCategoryBadge = document.getElementById('manifest-category');
    const manifestTitle = document.getElementById('manifest-title');
    const manifestDesc = document.getElementById('manifest-desc');
    const manifestMilestones = document.getElementById('manifest-milestones');
    const manifestPlayBtn = document.getElementById('manifest-play-btn');
    const manifestPrevBtn = document.getElementById('manifest-prev-btn');
    const manifestNextBtn = document.getElementById('manifest-next-btn');
    const manifestAffirmationText = document.getElementById('manifest-affirmation-text');
    const breathText = document.getElementById('breath-text');
    const breathCircle = document.querySelector('.breath-circle-inner');

    // Архив Благодарности
    const archiveToggleBtn = document.getElementById('archive-toggle-btn');
    const archiveModal = document.getElementById('archive-modal');
    const archivedDreamsGrid = document.getElementById('archived-dreams-grid');
    const trashToggleBtn = document.getElementById('trash-toggle-btn');
    const trashModal = document.getElementById('trash-modal');
    const trashItemsList = document.getElementById('trash-items-list');
    const trashCount = document.getElementById('trash-count');

    // Звук
    const audioToggleBtn = document.getElementById('audio-toggle-btn');

    // ==========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ И ХРАНЕНИЕ (STORAGE & SEED)
    // ==========================================================================
    
    // ==========================================================================
    // 2.1 ИНДИКАТОР СОСТОЯНИЯ ХРАНЕНИЯ (STORAGE STATUS)
    // ==========================================================================

    // Полные описания (aria-label/title) — без технических ключей и содержимого.
    const STORAGE_STATUS_TEXT = {
        saved: 'Сохранено на устройстве',
        migrated: 'Данные обновлены до нового формата',
        recovered: 'Данные восстановлены из резервного состояния',
        saving: 'Сохранение…',
        error: 'Изменения не сохранены',
        readonly: 'Только чтение: данные защищены',
        unavailable: 'Хранилище недоступно'
    };

    // Короткие визуальные тексты (на мобильном могут скрываться через CSS).
    const STORAGE_STATUS_SHORT = {
        saved: 'Сохранено',
        migrated: 'Формат обновлён',
        recovered: 'Восстановлено',
        saving: 'Сохранение…',
        error: 'Не сохранено',
        readonly: 'Только чтение',
        unavailable: 'Хранилище недоступно'
    };

    function renderStorageStatus(statusKey) {
        if (!storageStatusEl) return;
        const full = STORAGE_STATUS_TEXT[statusKey] || STORAGE_STATUS_TEXT.saved;
        const short = STORAGE_STATUS_SHORT[statusKey] || STORAGE_STATUS_SHORT.saved;
        storageStatusEl.setAttribute('data-status', statusKey);
        storageStatusEl.setAttribute('aria-label', full);
        storageStatusEl.setAttribute('title', full);
        const textEl = storageStatusEl.querySelector('.storage-status-text');
        if (textEl) textEl.textContent = short;
        const retryEl = storageStatusEl.querySelector('.storage-status-retry');
        if (retryEl) {
            retryEl.hidden = statusKey !== 'error' || storageSaving;
            retryEl.disabled = storageSaving;
        }
    }

    function init() {
        // Инициализация индикатора состояния хранения.
        storageStatusEl = document.getElementById('storage-status');
        const retryEl = storageStatusEl ? storageStatusEl.querySelector('.storage-status-retry') : null;
        if (retryEl) {
            retryEl.addEventListener('click', () => {
                if (storageSaving) return; // повторный клик во время saving блокируется
                saveDreams();
            });
        }

        // Экспорт резервной копии (Этап 3): переносимый JSON-бэкап.
        const exportJsonBtn = document.getElementById('export-json-btn');
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => {
                handleExportBackup();
            });
        }

        // Безопасное восстановление полного JSON-бэкапа (Этап 4).
        const importJsonBtn = document.getElementById('import-json-btn');
        const importFileInput = document.getElementById('import-file-input');
        if (importJsonBtn && importFileInput) {
            importJsonBtn.addEventListener('click', () => {
                if (!importBusy) importFileInput.click();
            });
            importFileInput.addEventListener('change', () => {
                const file = importFileInput.files && importFileInput.files[0];
                if (file) handleImportBackup(file);
            });
        }
        if (trashToggleBtn) trashToggleBtn.addEventListener('click', openTrashModal);

        // Безопасная загрузка через versioned storage layer (v14).
        let appStorage = null;
        try {
            appStorage = window.localStorage;
        } catch (e) {
            appStorage = null;
        }
        appStorageRef = appStorage;

        if (typeof DreamBoardStorage === 'undefined' || !DreamBoardStorage) {
            // Аварийный read-only режим: storage.js не загрузился (например,
            // рассинхрон SW-кэша). Без белого экрана и без записи.
            showToast('Хранилище временно недоступно. Перезагрузите приложение — изменения пока не будут сохранены', 'error');
            dreams = JSON.parse(JSON.stringify(DEFAULT_DREAMS));
            appStorageState = {
                source: 'defaults',
                state: null,
                writeProtected: true,
                shouldPersist: false,
                warnings: ['storage-module-missing'],
                unavailable: true
            };
            renderStorageStatus('unavailable');
        } else {
            const storageResult = DreamBoardStorage.load(appStorage, { defaultDreams: DEFAULT_DREAMS });
            appStorageState = storageResult;

            // Миграция/восстановление показываются один раз после первого
            // успешного сохранения, затем — обычный saved.
            if (storageResult.source === 'legacy') pendingStatusLabel = 'migrated';
            else if (storageResult.source === 'recovery') pendingStatusLabel = 'recovered';

            if (storageResult.protected) {
                showToast('Данные созданы более новой версией приложения. Обновите приложение, чтобы не потерять изменения.', 'info');
            } else if (storageResult.source === 'defaults' && storageResult.warnings.length > 0) {
                showToast('Не удалось восстановить сохранённые данные. Приложение запущено с безопасными значениями по умолчанию.', 'info');
            }

            renderStorageStatus(DreamBoardStorage.deriveStatus(storageResult, null, null));

            dreams = storageResult.dreams;

            // Миграция legacy dreams_db → versioned state или первичный seed.
            // legacy dreams_db при этом не изменяется (страховка).
            if (storageResult.shouldPersist) {
                saveDreams();
            }
        }

        initTrashStore();
        
        // Восстановление сохраненных позиций холста
        zoom = parseFloat(localStorage.getItem('canvas_zoom') || '1.0');
        panX = parseFloat(localStorage.getItem('canvas_pan_x') || '-2100');
        panY = parseFloat(localStorage.getItem('canvas_pan_y') || '-2050');
        
        renderAll();
        updateCanvasTransform();
        // В lite-профиле фоновые частицы не запускаются вовсе (и не
        // появятся после resize — слушатель не регистрируется).
        if (!isLite) {
            initAmbientParticles();
        }
        setupAudioToggle();
    }

    function saveDreams() {
        // Каждый вызов сохранения (форма, checkbox, drag/resize, архив) обязан
        // учитывать write protection; при защите никаких setItem не выполняется.
        storageSaving = true;
        renderStorageStatus('saving');

        let result;
        try {
            result = DreamBoardStorage.save(appStorageRef, dreams, {
                writeProtected: appStorageState ? appStorageState.writeProtected === true : true
            });
        } catch (e) {
            result = { ok: false, error: 'unknown' };
        }
        storageSaving = false;

        if (result.ok) {
            // saved показывается только после фактически успешного setItem.
            if (pendingStatusLabel) {
                renderStorageStatus(pendingStatusLabel);
                pendingStatusLabel = null;
            } else {
                renderStorageStatus('saved');
            }
        } else {
            renderStorageStatus(DreamBoardStorage.deriveStatus(appStorageState, result, pendingStatusLabel));
        }

        if (!result.ok) {
            if (result.error === 'write-protected' || result.error === 'newer-schema-protected') {
                showToast('Данные защищены от перезаписи. Не закрывайте приложение до восстановления', 'info');
            } else if (result.error === 'storage-unavailable') {
                showToast('Хранилище временно недоступно. Перезагрузите приложение — изменения пока не будут сохранены', 'error');
            } else {
                showToast('Изменения не сохранены. Освободите место в браузере и повторите сохранение', 'error');
            }
        }
        return result;
    }

    function isLocalImageRef(value) {
        return typeof value === 'string' && value.startsWith(LOCAL_IMAGE_PREFIX);
    }

    function getLocalImageId(ref) {
        return ref.slice(LOCAL_IMAGE_PREFIX.length);
    }

    function openLocalImageDb() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(LOCAL_IMAGE_DB_NAME, 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(LOCAL_IMAGE_STORE)) {
                    db.createObjectStore(LOCAL_IMAGE_STORE, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveLocalImageBlob(blob, originalName) {
        const db = await openLocalImageDb();
        const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(LOCAL_IMAGE_STORE, 'readwrite');
            tx.objectStore(LOCAL_IMAGE_STORE).put({
                id,
                blob,
                originalName,
                mimeType: blob.type,
                size: blob.size,
                createdAt: new Date().toISOString()
            });
            tx.oncomplete = () => {
                db.close();
                resolve(`${LOCAL_IMAGE_PREFIX}${id}`);
            };
            tx.onerror = () => {
                db.close();
                reject(tx.error);
            };
        });
    }

    async function getLocalImageBlob(id) {
        const db = await openLocalImageDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(LOCAL_IMAGE_STORE, 'readonly');
            const request = tx.objectStore(LOCAL_IMAGE_STORE).get(id);
            request.onsuccess = () => {
                db.close();
                resolve(request.result ? request.result.blob : null);
            };
            request.onerror = () => {
                db.close();
                reject(request.error);
            };
        });
    }

    async function deleteLocalImageRef(ref) {
        if (!isLocalImageRef(ref)) return;
        const id = getLocalImageId(ref);
        const cachedUrl = localImageObjectUrls.get(id);
        if (cachedUrl) {
            URL.revokeObjectURL(cachedUrl);
            localImageObjectUrls.delete(id);
        }
        const db = await openLocalImageDb();
        return new Promise((resolve) => {
            const tx = db.transaction(LOCAL_IMAGE_STORE, 'readwrite');
            tx.objectStore(LOCAL_IMAGE_STORE).delete(id);
            tx.oncomplete = () => {
                db.close();
                resolve();
            };
            tx.onerror = () => {
                db.close();
                resolve();
            };
        });
    }

    async function getLocalImageRecord(id) {
        const db = await openLocalImageDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(LOCAL_IMAGE_STORE, 'readonly');
            const request = tx.objectStore(LOCAL_IMAGE_STORE).get(id);
            request.onsuccess = () => {
                db.close();
                resolve(request.result || null);
            };
            request.onerror = () => {
                db.close();
                reject(request.error);
            };
        });
    }

    function initTrashStore() {
        if (typeof DreamBoardTrash === 'undefined' || !DreamBoardTrash) {
            trashProtected = true;
            updateTrashCount();
            return;
        }
        const loaded = DreamBoardTrash.load(appStorageRef);
        trashProtected = !loaded.ok || loaded.protected === true;
        trashItems = loaded.ok ? loaded.items : [];
        updateTrashCount();
        if (trashProtected) {
            showToast('Недавно удалённые недоступны: данные защищены от перезаписи', 'info');
            return;
        }
        cleanupExpiredTrash();
    }

    function reloadTrashItems() {
        const loaded = DreamBoardTrash.load(appStorageRef);
        if (!loaded.ok) {
            trashProtected = true;
            return false;
        }
        trashItems = loaded.items;
        updateTrashCount();
        return true;
    }

    function updateTrashCount() {
        if (!trashCount) return;
        trashCount.textContent = String(trashItems.length);
        trashCount.hidden = trashItems.length === 0;
        if (trashToggleBtn) trashToggleBtn.setAttribute('aria-label', `Недавно удалённые: ${trashItems.length}`);
    }

    async function cleanupExpiredTrash() {
        const result = DreamBoardTrash.pruneExpired(appStorageRef);
        if (!result.ok) return;
        trashItems = result.items;
        updateTrashCount();
        for (const item of result.removed) {
            const ref = item && item.dream ? item.dream.imageUrl : '';
            if (isLocalImageRef(ref) && !DreamBoardTrash.isLocalImageRefInUse(ref, dreams, trashItems)) {
                try { await deleteLocalImageRef(ref); } catch (e) { /* orphan безопаснее потери данных */ }
            }
        }
    }

    function makeTrashRecordId() {
        const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
        return `trash-${random}`;
    }

    function isImageRefInUse(ref, excludingDreamId) {
        if (typeof DreamBoardTrash === 'undefined' || !DreamBoardTrash) {
            return dreams.some(dream => dream && dream.id !== excludingDreamId && dream.imageUrl === ref);
        }
        return DreamBoardTrash.isLocalImageRefInUse(ref, dreams, trashItems, excludingDreamId);
    }

    async function restoreTrashRecord(recordId, options = {}) {
        if (trashProtected) {
            showToast('Восстановление недоступно: корзина защищена', 'error');
            return false;
        }
        const record = trashItems.find(item => item.id === recordId);
        if (!record) {
            showToast('Удалённая цель уже недоступна', 'info');
            return false;
        }
        const plan = DreamBoardTrash.buildRestore(dreams, record);
        if (!plan.ok) {
            showToast(plan.error === 'id-conflict' ? 'Цель с таким идентификатором уже существует' : 'Не удалось восстановить цель', 'error');
            return false;
        }

        const previousDreams = dreams;
        dreams = plan.dreams;
        const saved = saveDreams();
        if (!saved.ok) {
            dreams = previousDreams;
            renderAll();
            return false;
        }

        const removed = DreamBoardTrash.remove(appStorageRef, recordId);
        if (!removed.ok) {
            // Active state уже безопасно сохранён. Оставшаяся trash-копия не
            // означает потерю; повторное восстановление блокирует id-conflict.
            reloadTrashItems();
            renderAll();
            showToast('Цель восстановлена, но запись корзины не удалось очистить', 'info');
            return true;
        }
        trashItems = removed.items;
        updateTrashCount();
        renderAll();
        if (trashModal && trashModal.classList.contains('active')) renderTrashItems();
        if (!options.silent) showToast(`Цель «${plan.restored.title}» восстановлена`, 'success');
        return true;
    }

    async function permanentlyDeleteTrashRecord(recordId) {
        if (trashProtected) return false;
        const record = trashItems.find(item => item.id === recordId);
        if (!record) return false;
        if (!window.confirm(`Удалить цель «${record.dream.title}» окончательно? Это действие нельзя отменить.`)) return false;
        const removed = DreamBoardTrash.remove(appStorageRef, recordId);
        if (!removed.ok) {
            showToast('Не удалось удалить запись из корзины', 'error');
            return false;
        }
        trashItems = removed.items;
        updateTrashCount();
        const ref = record.dream.imageUrl;
        if (isLocalImageRef(ref) && !isImageRefInUse(ref)) {
            try { await deleteLocalImageRef(ref); } catch (e) { /* orphan non-fatal */ }
        }
        renderTrashItems();
        showToast('Цель удалена окончательно', 'info');
        return true;
    }

    function openTrashModal() {
        if (!trashModal) return;
        renderTrashItems();
        trashModal.classList.add('active');
        trashModal.setAttribute('aria-hidden', 'false');
    }

    function renderTrashItems() {
        if (!trashItemsList) return;
        trashItemsList.textContent = '';
        if (trashProtected) {
            const message = document.createElement('p');
            message.className = 'empty-trash-state';
            message.textContent = 'Корзина защищена: повреждённый или более новый формат не будет перезаписан.';
            trashItemsList.appendChild(message);
            return;
        }
        if (!trashItems.length) {
            const empty = document.createElement('p');
            empty.className = 'empty-trash-state';
            empty.textContent = 'Недавно удалённых целей нет.';
            trashItemsList.appendChild(empty);
            return;
        }
        trashItems.slice().reverse().forEach(record => {
            const row = document.createElement('article');
            row.className = 'trash-item';
            const content = document.createElement('div');
            content.className = 'trash-item-content';
            const title = document.createElement('h4');
            title.textContent = record.dream.title;
            const date = document.createElement('p');
            date.textContent = `Удалено: ${new Date(record.deletedAt).toLocaleString()}`;
            content.append(title, date);

            const actions = document.createElement('div');
            actions.className = 'trash-item-actions';
            const restore = document.createElement('button');
            restore.type = 'button';
            restore.className = 'btn secondary trash-restore-btn';
            restore.textContent = 'Восстановить';
            restore.addEventListener('click', () => restoreTrashRecord(record.id));
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'btn danger trash-delete-btn';
            remove.textContent = 'Удалить окончательно';
            remove.addEventListener('click', () => permanentlyDeleteTrashRecord(record.id));
            actions.append(restore, remove);
            row.append(content, actions);
            trashItemsList.appendChild(row);
        });
    }

    function writeImportedImages(records) {
        if (!records.length) return Promise.resolve();
        return openLocalImageDb().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(LOCAL_IMAGE_STORE, 'readwrite');
            const store = tx.objectStore(LOCAL_IMAGE_STORE);
            records.forEach(record => {
                const blob = new Blob([record.bytes], { type: record.mimeType });
                store.add({
                    id: record.id,
                    blob,
                    originalName: '',
                    mimeType: record.mimeType,
                    size: blob.size,
                    createdAt: new Date().toISOString()
                });
            });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { const error = tx.error; db.close(); reject(error || new Error('image-write-aborted')); };
            tx.onerror = () => { /* onabort завершит Promise и закроет БД */ };
        }));
    }

    function cleanupImportedImages(ids) {
        if (!ids.length) return Promise.resolve();
        return openLocalImageDb().then(db => new Promise((resolve, reject) => {
            const tx = db.transaction(LOCAL_IMAGE_STORE, 'readwrite');
            const store = tx.objectStore(LOCAL_IMAGE_STORE);
            ids.forEach(id => store.delete(id));
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { const error = tx.error; db.close(); reject(error || new Error('image-cleanup-aborted')); };
            tx.onerror = () => { /* onabort завершит Promise */ };
        }));
    }

    function decodeBase64Bytes(value) {
        return new Promise((resolve, reject) => {
            try {
                const binary = atob(value);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                resolve(bytes);
            } catch (e) {
                reject(e);
            }
        });
    }

    function createImportImageId(index) {
        const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${index}`;
        return `import-${random}`;
    }

    function readImportFile(file) {
        if (file && typeof file.text === 'function') return file.text();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
            reader.onerror = () => reject(reader.error || new Error('file-read-failed'));
            reader.readAsText(file, 'UTF-8');
        });
    }

    async function handleImportBackup(file) {
        if (importBusy) return;
        const importBtn = document.getElementById('import-json-btn');
        const fileInput = document.getElementById('import-file-input');

        if (typeof DreamBoardImport === 'undefined' || !DreamBoardImport || typeof DreamBoardStorage.saveState !== 'function') {
            showToast('Модуль восстановления недоступен. Обновите страницу', 'error');
            if (fileInput) fileInput.value = '';
            return;
        }
        if (!appStorageState || appStorageState.unavailable || appStorageState.writeProtected) {
            showToast('Данные защищены от перезаписи — импорт невозможен', 'error');
            if (fileInput) fileInput.value = '';
            return;
        }
        if (!file || typeof file.size !== 'number' || file.size > DreamBoardImport.MAX_FILE_BYTES) {
            showToast('Файл резервной копии превышает допустимый размер', 'error');
            if (fileInput) fileInput.value = '';
            return;
        }

        importBusy = true;
        if (importBtn) importBtn.disabled = true;
        showToast('Проверка резервной копии…', 'info');
        try {
            const text = await readImportFile(file);
            const inspected = DreamBoardImport.inspectBackupText(text, {
                fileSize: file.size,
                normalizeState: raw => DreamBoardStorage.normalizeState(raw)
            });
            if (!inspected.ok) {
                showToast(inspected.error.message, 'error');
                return;
            }

            const info = inspected.inspected;
            const missingText = info.missingRefs.length
                ? ` В файле отсутствует изображений: ${info.missingRefs.length}; вместо них будут показаны заглушки.`
                : '';
            const approved = window.confirm(
                `Заменить текущую доску данными из резервной копии? Целей: ${info.dreamCount}, изображений: ${info.imageCount}.${missingText} Текущие данные останутся в recovery-копии.`
            );
            if (!approved) {
                showToast('Импорт отменён', 'info');
                return;
            }

            showToast('Восстановление…', 'info');
            const prepared = await DreamBoardImport.materializeImport(info, {
                decodeBase64: decodeBase64Bytes,
                createId: createImportImageId
            });
            if (!prepared.ok) {
                showToast(prepared.error.message, 'error');
                return;
            }

            const applied = await DreamBoardImport.applyImport(prepared.plan, {
                writeImages: writeImportedImages,
                cleanupImages: cleanupImportedImages,
                saveState: state => DreamBoardStorage.saveState(appStorageRef, state, {
                    writeProtected: appStorageState.writeProtected === true
                })
            });
            if (!applied.ok) {
                showToast(applied.error.message, 'error');
                return;
            }

            const missing = applied.stats.missingImageCount ? `, без изображений: ${applied.stats.missingImageCount}` : '';
            showToast(`Восстановлено: ${applied.stats.dreamCount} целей, ${applied.stats.imageCount} изображений${missing}`, 'success');
            setTimeout(() => window.location.reload(), 300);
        } catch (e) {
            console.error('[DreamBoard] Backup import failed', e);
            showToast('Не удалось восстановить резервную копию', 'error');
        } finally {
            importBusy = false;
            if (importBtn) importBtn.disabled = false;
            if (fileInput) fileInput.value = '';
        }
    }

    // Blob → base64 без префикса data: (FileReader).
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const text = typeof reader.result === 'string' ? reader.result : '';
                const comma = text.indexOf(',');
                resolve(comma >= 0 ? text.slice(comma + 1) : text);
            };
            reader.onerror = () => reject(reader.error || new Error('read-failed'));
            reader.readAsDataURL(blob);
        });
    }

    // ==========================================================================
    // 2.2 ЭКСПОРТ РЕЗЕРВНОЙ КОПИИ (Этап 3: переносимый JSON-бэкап)
    // ==========================================================================
    let exportBusy = false;

    async function handleExportBackup() {
        if (exportBusy) return;
        if (typeof DreamBoardBackup === 'undefined' || !DreamBoardBackup) {
            showToast('Модуль экспорта недоступен. Обновите страницу', 'error');
            return;
        }

        // 1. Фатальные проверки состояния (файл не создаётся).
        if (!appStorageState || appStorageState.unavailable) {
            showToast('Хранилище недоступно — экспорт невозможен', 'error');
            return;
        }
        if (appStorageState.protected) {
            showToast('Данные созданы более новой версией приложения — экспорт невозможен', 'error');
            return;
        }
        if (appStorageState.source === 'defaults' && appStorageState.warnings && appStorageState.warnings.length > 0) {
            showToast('Сохранённые данные повреждены — экспорт невозможен', 'error');
            return;
        }
        // State для экспорта: нормализованный v2 (legacy/пустое хранилище → createState).
        const stateForExport = appStorageState.state || DreamBoardStorage.createState(dreams);

        const refs = DreamBoardBackup.collectImageRefs(stateForExport);
        const ids = [];
        const seen = {};
        refs.forEach(r => {
            if (!seen[r.id]) { seen[r.id] = true; ids.push(r.id); }
        });

        // 2. Pre-flight: оценка размера по метаданным ТОЛЬКО референсных записей
        //    (без чтения blob и без сканирования неиспользуемых изображений).
        //    Недоступная IDB при наличии dbimage:*-ссылок — фатально.
        let sizeEstimate = null;
        if (ids.length > 0) {
            try {
                let sum = 0;
                for (const id of ids) {
                    const rec = await getLocalImageRecord(id);
                    if (rec && typeof rec.size === 'number') sum += rec.size;
                }
                sizeEstimate = sum;
            } catch (e) {
                showToast('Хранилище изображений недоступно — экспорт невозможен', 'error');
                return;
            }
        }

        // 3. Экспорт (только чтение: localStorage/IndexedDB не изменяются).
        exportBusy = true;
        const exportBtn = document.getElementById('export-json-btn');
        if (exportBtn) exportBtn.disabled = true;
        showToast('Экспорт…', 'info');
        try {
            const provider = {
                get: async (id) => {
                    const rec = await getLocalImageRecord(id);
                    if (!rec) return null;
                    return { blob: rec.blob, mimeType: rec.mimeType };
                }
            };
            const result = await DreamBoardBackup.exportBackup({
                state: stateForExport,
                provider: provider,
                toBase64: blobToBase64,
                appVersion: DreamBoardStorage.APP_VERSION,
                now: new Date(),
                sizeEstimate: sizeEstimate,
                confirm: (message) => window.confirm(message)
            });
            if (!result.ok) {
                if (result.cancelled) {
                    // Пользователь отказался: ничего не скачиваем, сообщаем об отмене.
                    showToast('Экспорт отменён', 'info');
                } else {
                    showToast(result.fatal && result.fatal.message ? result.fatal.message : 'Экспорт не удался', 'error');
                }
                return;
            }

            // 5. Скачивание (objectURL освобождается модулем).
            const dl = DreamBoardBackup.downloadJson(result.backup, {
                createObjectURL: (blob) => URL.createObjectURL(blob),
                revokeObjectURL: (url) => URL.revokeObjectURL(url),
                triggerDownload: (url, filename) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                },
                filename: DreamBoardBackup.backupFileName(new Date())
            });
            if (!dl.ok) {
                showToast('Не удалось создать файл резервной копии', 'error');
                return;
            }
            const warnText = result.stats.skippedImageCount > 0 ? `, пропущено: ${result.stats.skippedImageCount}` : '';
            showToast(`Резервная копия: ${result.stats.dreamCount} целей, ${result.stats.includedImageCount} изображений${warnText}`, 'success');
        } catch (e) {
            console.error('[DreamBoard] Backup export failed', e);
            showToast('Экспорт не удался', 'error');
        } finally {
            exportBusy = false;
            if (exportBtn) exportBtn.disabled = false;
        }
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getImageHtml(imageUrl, className, altText, lazy = true) {
        const safeAlt = escapeHtml(altText);
        if (!isLocalImageRef(imageUrl)) {
            return `<img src="${escapeHtml(imageUrl)}" class="${className}" alt="${safeAlt}"${lazy ? ' loading="lazy"' : ''}>`;
        }

        const id = getLocalImageId(imageUrl);
        const cachedUrl = localImageObjectUrls.get(id) || 'assets/images/og-preview.png';
        return `<img src="${escapeHtml(cachedUrl)}" class="${className}" alt="${safeAlt}" data-local-image-id="${escapeHtml(id)}"${lazy ? ' loading="lazy"' : ''}>`;
    }

    function hydrateLocalImages(root = document) {
        root.querySelectorAll('img[data-local-image-id]').forEach(async img => {
            const id = img.dataset.localImageId;
            if (!id) return;
            if (localImageObjectUrls.has(id)) {
                img.src = localImageObjectUrls.get(id);
                return;
            }

            try {
                const blob = await getLocalImageBlob(id);
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                localImageObjectUrls.set(id, url);
                img.src = url;
            } catch (error) {
                console.warn('[DreamBoard] Local image load failed', error);
            }
        });
    }

    async function loadImageSource(file) {
        if ('createImageBitmap' in window) {
            try {
                const bitmap = await createImageBitmap(file);
                return {
                    image: bitmap,
                    width: bitmap.width,
                    height: bitmap.height,
                    close: () => bitmap.close()
                };
            } catch (error) {
                console.warn('[DreamBoard] createImageBitmap failed, falling back to HTMLImageElement', error);
            }
        }

        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve({
                    image: img,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                    close: () => {}
                });
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Не удалось прочитать изображение'));
            };
            img.src = url;
        });
    }

    async function compressImageFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            throw new Error('Выберите файл изображения');
        }

        const source = await loadImageSource(file);
        const targetRatio = 16 / 9;
        let sourceWidth = source.width;
        let sourceHeight = source.height;
        let sourceX = 0;
        let sourceY = 0;

        if (sourceWidth / sourceHeight > targetRatio) {
            sourceWidth = Math.round(sourceHeight * targetRatio);
            sourceX = Math.round((source.width - sourceWidth) / 2);
        } else {
            sourceHeight = Math.round(sourceWidth / targetRatio);
            sourceY = Math.round((source.height - sourceHeight) / 2);
        }

        const scale = Math.min(1, 1280 / sourceWidth, 720 / sourceHeight);
        const outputWidth = Math.max(1, Math.round(sourceWidth * scale));
        const outputHeight = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(source.image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);
        source.close();

        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (!blob) {
                    reject(new Error('Не удалось обработать изображение'));
                    return;
                }
                resolve(blob);
            }, 'image/webp', 0.82);
        });
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // ==========================================================================
    // 3. ЗВУКОВОЙ ДВИЖОК (WEB AUDIO PROCEDURAL SYNTHESIS)
    // ==========================================================================
    let audioCtx = null;
    let isSoundOn = false;
    let ambientSynth = null; // Постоянные осцилляторы
    let chimeInterval = null;

    function initAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSoundEffect(type) {
        if (!isSoundOn) return;
        initAudioContext();
        
        const now = audioCtx.currentTime;
        
        if (type === 'hover') {
            // Короткий деликатный высокочастотный щелчок
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(1000, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            
            gain.gain.setValueAtTime(0.015, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
            
            osc.start(now);
            osc.stop(now + 0.06);
        } 
        else if (type === 'chime-milestone') {
            // Звонкий высокий колокольчик при чекбоксе
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            const delay = audioCtx.createDelay();
            const feedback = audioCtx.createGain();
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            // Простейший дилей для объема
            delay.delayTime.value = 0.15;
            feedback.gain.value = 0.3;
            gain.connect(delay);
            delay.connect(feedback);
            feedback.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, now);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.06, now + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
            
            osc.start(now);
            osc.stop(now + 0.6);
        }
        else if (type === 'manifest-success') {
            // Торжественный, глубокий мажорный аккорд + переливы
            const chord = [261.63, 329.63, 392.00, 493.88, 523.25]; // C4, E4, G4, B4, C5 (Cmaj7)
            
            // Создаем Delay и Reverb Nodes
            const delayNode = audioCtx.createDelay();
            delayNode.delayTime.value = 0.25;
            const delayFeedback = audioCtx.createGain();
            delayFeedback.gain.value = 0.4;
            
            delayNode.connect(delayFeedback);
            delayFeedback.connect(delayNode);
            
            const masterGain = audioCtx.createGain();
            masterGain.gain.setValueAtTime(0, now);
            masterGain.gain.linearRampToValueAtTime(0.2, now + 0.3);
            masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.0);
            
            masterGain.connect(audioCtx.destination);
            delayNode.connect(masterGain);
            
            chord.forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const oGain = audioCtx.createGain();
                
                osc.connect(oGain);
                oGain.connect(masterGain);
                oGain.connect(delayNode);
                
                osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
                osc.frequency.setValueAtTime(freq, now);
                // Небольшой расстрой
                osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);
                
                oGain.gain.setValueAtTime(0, now);
                oGain.gain.linearRampToValueAtTime(0.1, now + 0.1 + idx * 0.05);
                oGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
                
                osc.start(now);
                osc.stop(now + 3.1);
            });
        }
        else if (type === 'chime-scale') {
            // Случайный хрустальный перелив
            const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]; // C5 - C6
            const freq = pentatonic[Math.floor(Math.random() * pentatonic.length)];
            
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.03, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
            
            osc.start(now);
            osc.stop(now + 1.3);
        }
    }

    // Синтез фоновой музыки для Режима Манифестации
    function startManifestationMusic() {
        if (!isSoundOn) return;
        initAudioContext();
        
        const now = audioCtx.currentTime;
        ambientSynth = {};
        
        // Создаем низкочастотный фильтр (BiquadFilter)
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 1.0;
        filter.frequency.setValueAtTime(300, now);
        
        // LFO для фильтра (модуляция частоты среза)
        const lfo = audioCtx.createOscillator();
        const lfoGain = audioCtx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08; // Крайне медленная волна (12.5 сек)
        lfoGain.gain.value = 120; // Качание в диапазоне +-120Hz
        
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start(now);
        
        // Delay для объема
        const delay = audioCtx.createDelay();
        delay.delayTime.value = 0.4;
        const feedback = audioCtx.createGain();
        feedback.gain.value = 0.5;
        
        delay.connect(feedback);
        feedback.connect(delay);
        
        // Мастер-громкость
        const masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.12, now + 3.0); // Медленное нарастание
        
        filter.connect(masterGain);
        delay.connect(masterGain);
        masterGain.connect(audioCtx.destination);
        
        // Запускаем 3 осциллятора для создания глубокого минорного 9-аккорда
        const frequencies = [130.81, 196.00, 261.63, 311.13, 392.00]; // C3, G3, C4, Eb4, G4 (Cm)
        const oscillators = [];
        
        frequencies.forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const oscGain = audioCtx.createGain();
            
            osc.connect(oscGain);
            oscGain.connect(filter);
            if (idx > 2) oscGain.connect(delay); // Пускаем верхние частоты в дилей
            
            osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
            osc.frequency.value = freq;
            osc.detune.value = (Math.random() - 0.5) * 12; // Расстройка для жирного хоруса
            
            oscGain.gain.setValueAtTime(0.04, now);
            osc.start(now);
            
            oscillators.push(osc);
        });

        // Сохраняем ссылки для остановки
        ambientSynth.oscillators = oscillators;
        ambientSynth.lfo = lfo;
        ambientSynth.masterGain = masterGain;
        
        // Каждые 6 секунд запускаем космические переливы
        chimeInterval = setInterval(() => {
            if (Math.random() > 0.3) {
                playSoundEffect('chime-scale');
                setTimeout(() => playSoundEffect('chime-scale'), 350);
            }
        }, 6000);
    }

    function stopManifestationMusic() {
        if (ambientSynth) {
            const now = audioCtx ? audioCtx.currentTime : 0;
            if (ambientSynth.masterGain && audioCtx) {
                ambientSynth.masterGain.gain.cancelScheduledValues(now);
                ambientSynth.masterGain.gain.setValueAtTime(ambientSynth.masterGain.gain.value, now);
                ambientSynth.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
            }
            
            setTimeout(() => {
                try {
                    if (ambientSynth.oscillators) ambientSynth.oscillators.forEach(o => o.stop());
                    if (ambientSynth.lfo) ambientSynth.lfo.stop();
                } catch(e) {}
                ambientSynth = null;
            }, 1600);
        }
        if (chimeInterval) {
            clearInterval(chimeInterval);
            chimeInterval = null;
        }
    }

    function setupAudioToggle() {
        audioToggleBtn.addEventListener('click', () => {
            isSoundOn = !isSoundOn;
            if (isSoundOn) {
                audioToggleBtn.classList.remove('muted');
                initAudioContext();
                playSoundEffect('chime-scale');
                showToast('Звуковые эффекты и эмбиент включены', 'info');
                // Если мы в Режиме Манифестации - заводим эмбиент
                if (manifestOverlay.classList.contains('active') && !ambientSynth) {
                    startManifestationMusic();
                }
            } else {
                audioToggleBtn.classList.add('muted');
                stopManifestationMusic();
                showToast('Звук выключен', 'info');
            }
        });
    }

    // ==========================================================================
    // 4. ДВУХМЕРНЫЕ ЭФФЕКТЫ (PARTICLES CANVAS ENGINE)
    // ==========================================================================
    
    // Эффект 1: Фоновое космическое сияние на главной странице
    function initAmbientParticles() {
        const canvas = document.getElementById('ambient-particles');
        const ctx = canvas.getContext('2d');
        
        let resizeFrame = null;
        function resize() {
            // RAF-coalescing: не более одного пересоздания canvas на кадр,
            // цикл animate при resize не перезапускается.
            if (resizeFrame) return;
            resizeFrame = requestAnimationFrame(() => {
                resizeFrame = null;
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
            });
        }
        resize();
        window.addEventListener('resize', resize);
        
        const particles = [];
        const count = 45;
        
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 1.5 + 0.5,
                speedY: -(Math.random() * 0.15 + 0.05),
                alpha: Math.random() * 0.5 + 0.1,
                fadeSpeed: Math.random() * 0.005 + 0.002,
                growing: Math.random() > 0.5,
                swaySpeed: Math.random() * 0.01 + 0.005,
                swayVal: Math.random() * 100
            });
        }
        
        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            particles.forEach(p => {
                p.y += p.speedY;
                p.swayVal += p.swaySpeed;
                p.x += Math.sin(p.swayVal) * 0.2;
                
                // Пульсация альфы
                if (p.growing) {
                    p.alpha += p.fadeSpeed;
                    if (p.alpha >= 0.7) p.growing = false;
                } else {
                    p.alpha -= p.fadeSpeed;
                    if (p.alpha <= 0.1) p.growing = true;
                }
                
                // Перенос вверх
                if (p.y < -10) {
                    p.y = canvas.height + 10;
                    p.x = Math.random() * canvas.width;
                }
                
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(161, 140, 209, ${p.alpha})`;
                ctx.shadowBlur = 8;
                ctx.shadowColor = 'rgba(0, 242, 254, 0.4)';
                ctx.fill();
            });
            
            ambientFrameId = requestAnimationFrame(animate);
        }
        ambientAnimateFn = animate;
        animate();
    }

    // Пауза декоративного RAF при скрытой вкладке (без потери состояния).
    function pauseAmbientParticles() {
        if (ambientFrameId) {
            cancelAnimationFrame(ambientFrameId);
            ambientFrameId = null;
        }
    }

    // Возобновление: только если цикл реально был запущен и не создаёт дубликат.
    function resumeAmbientParticles() {
        if (!ambientFrameId && ambientAnimateFn) {
            ambientAnimateFn();
        }
    }

    // Эффект 2: Салют из Конфетти при манифестации карточки цели
    function runConfettiCelebration(x, y, category) {
        // Создаем оверлей-канвас поверх всего экрана
        const canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '9999';
        document.body.appendChild(canvas);
        
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        
        // Определяем палитру цветов взрыва
        let colors = ['#ffe259', '#ffa751', '#ffffff', '#ffd700']; // Дефолт золото
        if (category === 'career') colors = ['#00f2fe', '#4facfe', '#0072ff', '#ffffff'];
        else if (category === 'wealth') colors = ['#00b09b', '#96c93d', '#00e676', '#ffffff'];
        else if (category === 'health') colors = ['#ff0844', '#ffb199', '#ff2d55', '#ffffff'];
        else if (category === 'travel') colors = ['#f6d365', '#fda085', '#ff9100', '#ffffff'];
        else if (category === 'relationships') colors = ['#ee9ca7', '#ffdde1', '#f50057', '#ffffff'];
        else if (category === 'growth') colors = ['#a18cd1', '#fbc2eb', '#b388ff', '#ffffff'];
        
        const particles = [];
        const count = confettiCountLimit; // lite: ≤40, normal: 120
        
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const velocity = Math.random() * 12 + 5;
            
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * velocity + (Math.random() - 0.5) * 2,
                vy: Math.sin(angle) * velocity - Math.random() * 5 - 2, // Вектор взрыва вверх
                radius: Math.random() * 5 + 3,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1.0,
                decay: Math.random() * 0.015 + 0.01,
                gravity: 0.28,
                rotation: Math.random() * Math.PI,
                rotSpeed: (Math.random() - 0.5) * 0.2,
                shape: Math.random() > 0.5 ? 'circle' : 'rect'
            });
        }
        
        let frames = 0;
        function update() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            let alive = false;
            particles.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity; // Гравитация
                p.vx *= 0.98; // Трение воздуха
                p.alpha -= p.decay;
                p.rotation += p.rotSpeed;
                
                if (p.alpha > 0) {
                    alive = true;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(p.rotation);
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.alpha;
                    
                    if (p.shape === 'circle') {
                        ctx.beginPath();
                        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
                        ctx.fill();
                    } else {
                        // Рисуем маленькие прямоугольники конфетти
                        ctx.fillRect(-p.radius, -p.radius/2, p.radius * 2, p.radius);
                    }
                    ctx.restore();
                }
            });
            
            frames++;
            if (alive) {
                requestAnimationFrame(update);
            } else {
                document.body.removeChild(canvas);
            }
        }
        update();
    }

    // ==========================================================================
    // 5. ОТРИСОВКА ИНТЕРФЕЙСА (RENDERING SYSTEMS)
    // ==========================================================================
    
    function renderAll() {
        // Рендерим только активное представление: скрытая доска не строится.
        if (currentViewMode === 'canvas') {
            renderCanvas();
        } else {
            renderGrid();
        }
    }

    // Рендер 1: Режим Сетки (Masonry)
    function renderGrid() {
        dreamsGrid.innerHTML = '';
        
        // Фильтруем активные (не архивированные в Архив благодарности) мечты
        const activeDreams = dreams.filter(d => d.status === 'active');
        
        const filtered = activeDreams.filter(d => {
            if (currentCategoryFilter === 'all') return true;
            return d.category === currentCategoryFilter;
        });

        if (filtered.length === 0) {
            dreamsGrid.innerHTML = `
                <div class="empty-state glass-card" style="grid-column: 1 / -1; padding: 60px; text-align: center; width: 100%; margin-top: 40px;">
                    <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 16px;">Здесь пока нет ваших карточек целей.</p>
                    <button class="add-dream-btn neon-btn" style="margin: 0 auto;">Добавить первую мечту</button>
                </div>
            `;
            // Перепривязка
            dreamsGrid.querySelectorAll('.add-dream-btn').forEach(btn => {
                btn.addEventListener('click', () => openDreamModal());
            });
            return;
        }

        filtered.forEach(dream => {
            const card = createDreamCardDOM(dream, false);
            dreamsGrid.appendChild(card);
        });
        hydrateLocalImages(dreamsGrid);
    }

    // Рендер 2: Режим Свободного Холста
    function renderCanvas() {
        // Удаляем только старые карточки, сетку-bg оставляем
        const oldCards = spatialCanvas.querySelectorAll('.dream-card');
        oldCards.forEach(c => c.remove());

        const activeDreams = dreams.filter(d => d.status === 'active');
        
        const filtered = activeDreams.filter(d => {
            if (currentCategoryFilter === 'all') return true;
            return d.category === currentCategoryFilter;
        });

        filtered.forEach(dream => {
            const card = createDreamCardDOM(dream, true);
            spatialCanvas.appendChild(card);
        });
        hydrateLocalImages(spatialCanvas);
    }

    // Создание DOM элемента карточки
    function createDreamCardDOM(dream, isCanvasMode) {
        const card = document.createElement('div');
        card.className = `dream-card glass-card category-${dream.category}`;
        card.dataset.id = dream.id;
        
        // Настройка стилей для режима холста
        if (isCanvasMode) {
            card.style.left = `${dream.canvasPos.x}px`;
            card.style.top = `${dream.canvasPos.y}px`;
            card.style.width = `${dream.canvasPos.width}px`;
            card.style.height = `${dream.canvasPos.height}px`;
        }

        // Рендер вех/микро-задач
        let milestonesHTML = '';
        if (dream.milestones && dream.milestones.length > 0) {
            milestonesHTML = `<div class="card-milestones">`;
            dream.milestones.forEach(m => {
                milestonesHTML += `
                    <div class="milestone-item ${m.checked ? 'checked' : ''}" data-mid="${escapeHtml(m.id)}">
                        <div class="milestone-checkbox">
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 3L3.5 5.5L8 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </div>
                        <span>${escapeHtml(m.text)}</span>
                    </div>
                `;
            });
            milestonesHTML += `</div>`;
        }

        card.innerHTML = `
            <div class="card-image-wrapper">
                ${getImageHtml(dream.imageUrl, 'card-image', dream.title)}
                <div class="card-image-overlay"></div>
                <span class="card-badge">${escapeHtml(getCategoryNameRU(dream.category))}</span>
                ${dream.year ? `<span class="card-year">${escapeHtml(dream.year)} г.</span>` : ''}
                
                <div class="card-quick-actions">
                    <button class="action-round-btn manifest-btn" title="Воплотить в реальность! (Манифестировано)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                    <button class="action-round-btn edit-btn" title="Редактировать">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="action-round-btn delete-btn" title="Удалить цель">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="card-body">
                <h4 class="card-title">${escapeHtml(dream.title)}</h4>
                <p class="card-desc">${escapeHtml(dream.desc)}</p>
                ${milestonesHTML}
            </div>
            ${isCanvasMode ? `<div class="card-resizer"></div>` : ''}
        `;

        // Добавляем обработчики hover-звука
        card.addEventListener('mouseenter', () => playSoundEffect('hover'));

        // Обработчик 1: Клик по чекбоксу вехи
        card.querySelectorAll('.milestone-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const mid = el.dataset.mid;
                const mObj = dream.milestones.find(m => m.id === mid);
                if (mObj) {
                    mObj.checked = !mObj.checked;
                    saveDreams();
                    playSoundEffect('chime-milestone');
                    el.classList.toggle('checked');
                    
                    // Перерисовываем прогресс-бар, если мы сейчас в Режиме Манифестации
                    if (manifestOverlay.classList.contains('active')) {
                        updateManifestCardInfo(dream);
                    }
                }
            });
        });

        // Обработчик 2: Кнопка быстрого удаления
        card.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteDream(dream.id);
        });

        // Обработчик 3: Кнопка редактирования
        card.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openDreamModal(dream);
        });

        // Обработчик 4: Кнопка Манифестировано! (Архивация + Салют)
        card.querySelector('.manifest-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            manifestDreamSuccess(dream.id, e);
        });

        // Привязываем перетаскивание и изменение размеров для режима Canvas
        if (isCanvasMode) {
            setupCardInteractions(card, dream);
        }

        return card;
    }

    // Перевод категорий на русский
    function getCategoryNameRU(cat) {
        const catMap = {
            career: 'Карьера',
            wealth: 'Богатство',
            health: 'Здоровье',
            travel: 'Путешествия',
            relationships: 'Отношения',
            growth: 'Личность',
            manifested: 'Воплощено'
        };
        return catMap[cat] || cat;
    }

    // ==========================================================================
    // 6. ХОЛСТ: ПЕРЕТАСКИВАНИЕ, ЗУМ, СИСТЕМА СЕТКИ (SPATIAL CANVAS LOGIC)
    // ==========================================================================

    // Визуальное применение transform (без записи в localStorage).
    function updateCanvasTransform() {
        spatialCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        canvasZoomIndicator.innerText = `${Math.round(zoom * 100)}%`;
    }

    // Сохранение zoom/pan: ровно три существующих ключа, вызывается после
    // завершения жеста (pan/pinch/drag), по debounce для wheel и при hidden.
    function persistCanvasViewState() {
        try {
            localStorage.setItem('canvas_zoom', zoom);
            localStorage.setItem('canvas_pan_x', panX);
            localStorage.setItem('canvas_pan_y', panY);
        } catch (e) {
            // Ошибки localStorage не должны ломать жесты.
        }
    }

    // Debounce персиста для wheel (200-300 мс).
    let canvasPersistTimer = null;
    function scheduleCanvasPersist() {
        if (canvasPersistTimer) clearTimeout(canvasPersistTimer);
        canvasPersistTimer = setTimeout(() => {
            canvasPersistTimer = null;
            persistCanvasViewState();
        }, 250);
    }

    // RAF-coalescing: не более одного DOM-update transform на кадр,
    // последнее значение (panX/panY/zoom) не теряется.
    let transformFrameRequested = false;
    function requestCanvasTransformUpdate() {
        if (transformFrameRequested) return;
        transformFrameRequested = true;
        requestAnimationFrame(() => {
            transformFrameRequested = false;
            updateCanvasTransform();
        });
    }

    function resetCanvasCardLayout() {
        const activeDreams = dreams.filter(d => d.status === 'active');
        const startX = 2100;
        const startY = 2050;
        const gapX = 360;
        const gapY = 480;
        const isMobile = window.innerWidth < 768;
        const isLandscape = window.innerWidth > window.innerHeight;
        const columns = isMobile ? (isLandscape ? 2 : 1) : 3;

        activeDreams.forEach((dream, index) => {
            const col = index % columns;
            const row = Math.floor(index / columns);
            dream.canvasPos = {
                ...(dream.canvasPos || {}),
                x: startX + col * gapX,
                y: startY + row * gapY,
                width: dream.canvasPos?.width || 320,
                height: dream.canvasPos?.height || 420
            };
        });
    }

    function resetCanvasCamera() {
        const isMobile = window.innerWidth < 768;
        const isLandscape = window.innerWidth > window.innerHeight;
        zoom = isMobile ? (isLandscape ? 0.62 : 0.82) : 1.0;
        panX = isMobile ? -1710 : -2100;
        panY = isMobile ? -1680 : -2050;
    }

    // Отслеживание нажатия пробела (Space) для панорамирования холста
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
            isSpacePressed = true;
            canvasViewport.classList.add('space-held');
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
            isSpacePressed = false;
            canvasViewport.classList.remove('space-held');
        }
    });

    // Обработчик зажатия мыши на вьюпорте холста
    canvasViewport.addEventListener('mousedown', (e) => {
        // Мы можем панорамировать при зажатом пробеле ИЛИ при зажатии средней кнопки мыши (колеса)
        if (isSpacePressed || e.button === 1 || e.target === canvasViewport || e.target.classList.contains('canvas-grid-bg')) {
            isPanning = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
            e.preventDefault();
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            panX = e.clientX - startX;
            panY = e.clientY - startY;
            requestCanvasTransformUpdate();
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
            persistCanvasViewState(); // Сохранение после завершения панорамирования
        }
    });

    // Масштабирование холста (Zoom) колесиком мыши
    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    function getTouchCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    function isCanvasTouchControl(target) {
        return target.closest('.canvas-controls') ||
            target.closest('.action-round-btn') ||
            target.closest('.milestone-item') ||
            target.closest('.card-resizer');
    }

    // Кэш rect вьюпорта на время жеста: getBoundingClientRect не читается
    // на каждый mousemove/touchmove (избегаем forced layout в горячем цикле).
    let dragViewportRect = null;

    function clientToCanvasPoint(clientX, clientY) {
        const rect = dragViewportRect || canvasViewport.getBoundingClientRect();
        return {
            x: (clientX - rect.left - panX) / zoom,
            y: (clientY - rect.top - panY) / zoom
        };
    }

    canvasViewport.addEventListener('touchstart', (e) => {
        if (isCanvasTouchControl(e.target)) return;

        if (e.touches.length === 1) {
            touchMode = 'pan';
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            e.preventDefault();
        } else if (e.touches.length === 2) {
            touchMode = 'pinch';
            pinchStartDistance = getTouchDistance(e.touches);
            pinchStartZoom = zoom;
            const center = getTouchCenter(e.touches);
            const rect = canvasViewport.getBoundingClientRect();
            pinchScreenX = center.x - rect.left;
            pinchScreenY = center.y - rect.top;
            pinchCanvasX = (pinchScreenX - panX) / zoom;
            pinchCanvasY = (pinchScreenY - panY) / zoom;
            e.preventDefault();
        }
    }, { passive: false });

    canvasViewport.addEventListener('touchmove', (e) => {
        if (!touchMode) return;

        if (touchMode === 'pan' && e.touches.length === 1) {
            const touch = e.touches[0];
            panX += touch.clientX - lastTouchX;
            panY += touch.clientY - lastTouchY;
            lastTouchX = touch.clientX;
            lastTouchY = touch.clientY;
            requestCanvasTransformUpdate();
            e.preventDefault();
        } else if (touchMode === 'pinch' && e.touches.length === 2) {
            const distance = getTouchDistance(e.touches);
            const ratio = distance / Math.max(1, pinchStartDistance);
            zoom = Math.max(0.2, Math.min(2.0, pinchStartZoom * ratio));
            panX = pinchScreenX - pinchCanvasX * zoom;
            panY = pinchScreenY - pinchCanvasY * zoom;
            requestCanvasTransformUpdate();
            e.preventDefault();
        }
    }, { passive: false });

    canvasViewport.addEventListener('touchend', (e) => {
        if (touchMode === 'card-drag') return;

        if (e.touches.length === 0) {
            touchMode = null;
            persistCanvasViewState(); // Сохранение после завершения pan/pinch
            saveDreams();
        } else if (e.touches.length === 1) {
            touchMode = 'pan';
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
        }
    }, { passive: false });

    canvasViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const zoomIntensity = 0.08;
        let newZoom;
        
        if (e.deltaY < 0) {
            newZoom = Math.min(2.0, zoom + zoomIntensity); // Макс скейл 200%
        } else {
            newZoom = Math.max(0.2, zoom - zoomIntensity); // Мин скейл 20%
        }
        
        // Масштабируем относительно текущей точки мыши
        const mouseX = e.clientX - canvasViewport.getBoundingClientRect().left;
        const mouseY = e.clientY - canvasViewport.getBoundingClientRect().top;
        
        const canvasX = (mouseX - panX) / zoom;
        const canvasY = (mouseY - panY) / zoom;
        
        zoom = newZoom;
        panX = mouseX - canvasX * zoom;
        panY = mouseY - canvasY * zoom;
        
        requestCanvasTransformUpdate();
        scheduleCanvasPersist(); // Debounce-сохранение для wheel
    }, { passive: false });

    // Кнопки зума
    canvasZoomIn.addEventListener('click', () => {
        zoom = Math.min(2.0, zoom + 0.15);
        updateCanvasTransform();
        persistCanvasViewState();
    });

    canvasZoomOut.addEventListener('click', () => {
        zoom = Math.max(0.2, zoom - 0.15);
        updateCanvasTransform();
        persistCanvasViewState();
    });

    canvasZoomReset.addEventListener('click', () => {
        resetCanvasCardLayout();
        saveDreams();
        renderCanvas();
        resetCanvasCamera();
        // Возвращаем в центр
        updateCanvasTransform();
        persistCanvasViewState();
        showToast('Холст сброшен в исходную позицию', 'info');
    });

    // ==========================================================================
    // 7. ИНТЕРАКТИВНОСТЬ КАРТОЧЕК НА ХОЛСТЕ (DRAG & RESIZE WITH SNAP)
    // ==========================================================================
    const GRID_SNAP_SIZE = 10; // Шаг привязки в пикселях

    function setupCardInteractions(card, dream) {
        const resizer = card.querySelector('.card-resizer');
        
        // ВАРИАНТ А: ПЕРЕТАСКИВАНИЕ КАРТОЧКИ (DRAG)
        card.addEventListener('mousedown', (e) => {
            if (e.target.closest('.action-round-btn') || e.target.closest('.milestone-item') || e.target === resizer) {
                return; // Не драгаем, если кликнули на кнопку, веху или ресайзер
            }
            
            // Если зажат пробел, мы панорамируем холст, а не двигаем карточку
            if (isSpacePressed) return;
            
            activeDragCard = card;
            card.classList.add('dragging');
            
            // Кэшируем rect вьюпорта на время жеста
            dragViewportRect = canvasViewport.getBoundingClientRect();

            // Вычисляем оффсет с учетом зума
            const point = clientToCanvasPoint(e.clientX, e.clientY);
            dragOffsetX = point.x - dream.canvasPos.x;
            dragOffsetY = point.y - dream.canvasPos.y;
            
            e.preventDefault();
            e.stopPropagation();
        });

        // ВАРИАНТ Б: ИЗМЕНЕНИЕ РАЗМЕРОВ (RESIZE)
        card.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 ||
                e.target.closest('.action-round-btn') ||
                e.target.closest('.milestone-item') ||
                e.target === resizer) {
                return;
            }

            const touch = e.touches[0];
            // Кэшируем rect вьюпорта на время жеста
            dragViewportRect = canvasViewport.getBoundingClientRect();
            const point = clientToCanvasPoint(touch.clientX, touch.clientY);
            activeDragCard = card;
            touchMode = 'card-drag';
            card.classList.add('dragging');
            dragOffsetX = point.x - dream.canvasPos.x;
            dragOffsetY = point.y - dream.canvasPos.y;

            e.preventDefault();
            e.stopPropagation();
        }, { passive: false });

        resizer.addEventListener('mousedown', (e) => {
            activeResizeCard = card;
            // Кэшируем rect вьюпорта на время жеста
            dragViewportRect = canvasViewport.getBoundingClientRect();
            resizeStartW = dream.canvasPos.width;
            resizeStartH = dream.canvasPos.height;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            
            e.preventDefault();
            e.stopPropagation();
        });
    }

    // Слушатели на все окно для гладкого драга и ресайза
    // RAF-coalescing: не более одного DOM-обновления позиции/размера на кадр;
    // последнее значение читается из dream.canvasPos, поэтому не теряется.
    let pendingDragCard = null;
    let pendingResizeCard = null;

    function applyCardLayoutFrame() {
        if (pendingDragCard) {
            const d = dreams.find(x => x.id === pendingDragCard.dataset.id);
            if (d) {
                pendingDragCard.style.left = `${d.canvasPos.x}px`;
                pendingDragCard.style.top = `${d.canvasPos.y}px`;
            }
            pendingDragCard = null;
        }
        if (pendingResizeCard) {
            const d = dreams.find(x => x.id === pendingResizeCard.dataset.id);
            if (d) {
                pendingResizeCard.style.width = `${d.canvasPos.width}px`;
                pendingResizeCard.style.height = `${d.canvasPos.height}px`;
            }
            pendingResizeCard = null;
        }
    }

    // RAF-coalescer для drag/resize (реальный RAF handle вместо boolean):
    // позволяет отменить ожидающий кадр и синхронно применить последнее
    // состояние при завершении жеста (flush до обнуления pending refs и
    // saveDreams) — последний drag/resize update не теряется.
    const cardLayoutCoalescer = perfApi && typeof perfApi.createRafCoalescer === 'function'
        ? perfApi.createRafCoalescer({
            requestFrame: (fn) => requestAnimationFrame(fn),
            cancelFrame: (id) => cancelAnimationFrame(id),
            apply: applyCardLayoutFrame
        })
        : null;

    function requestCardLayoutUpdate() {
        if (cardLayoutCoalescer) {
            cardLayoutCoalescer.schedule();
            return;
        }
        requestAnimationFrame(applyCardLayoutFrame);
    }

    window.addEventListener('mousemove', (e) => {
        // Логика перетаскивания карточки
        if (activeDragCard) {
            const dreamId = activeDragCard.dataset.id;
            const dream = dreams.find(d => d.id === dreamId);
            
            if (dream) {
                const point = clientToCanvasPoint(e.clientX, e.clientY);
                let newX = point.x - dragOffsetX;
                let newY = point.y - dragOffsetY;
                
                // Привязка к невидимой сетке
                newX = Math.round(newX / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
                newY = Math.round(newY / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
                
                // Ограничиваем в пределах гигантского холста 5000x5000px
                newX = Math.max(10, Math.min(4600, newX));
                newY = Math.max(10, Math.min(4600, newY));
                
                dream.canvasPos.x = newX;
                dream.canvasPos.y = newY;
                
                pendingDragCard = activeDragCard;
                requestCardLayoutUpdate();
            }
        }
        
        // Логика изменения размеров
        if (activeResizeCard) {
            const dreamId = activeResizeCard.dataset.id;
            const dream = dreams.find(d => d.id === dreamId);
            
            if (dream) {
                const deltaX = (e.clientX - resizeStartX) / zoom;
                const deltaY = (e.clientY - resizeStartY) / zoom;
                
                let newWidth = resizeStartW + deltaX;
                let newHeight = resizeStartH + deltaY;
                
                // Ограничения размеров карточки
                newWidth = Math.max(260, Math.min(600, newWidth));
                newHeight = Math.max(340, Math.min(700, newHeight));
                
                // Привязка
                newWidth = Math.round(newWidth / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
                newHeight = Math.round(newHeight / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
                
                dream.canvasPos.width = newWidth;
                dream.canvasPos.height = newHeight;
                
                pendingResizeCard = activeResizeCard;
                requestCardLayoutUpdate();
            }
        }
    });

    window.addEventListener('touchmove', (e) => {
        if (!activeDragCard || touchMode !== 'card-drag' || e.touches.length !== 1) return;

        const dreamId = activeDragCard.dataset.id;
        const dream = dreams.find(d => d.id === dreamId);
        if (dream) {
            const touch = e.touches[0];
            const point = clientToCanvasPoint(touch.clientX, touch.clientY);
            let newX = point.x - dragOffsetX;
            let newY = point.y - dragOffsetY;

            newX = Math.round(newX / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
            newY = Math.round(newY / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
            newX = Math.max(10, Math.min(4600, newX));
            newY = Math.max(10, Math.min(4600, newY));

            dream.canvasPos.x = newX;
            dream.canvasPos.y = newY;
            pendingDragCard = activeDragCard;
            requestCardLayoutUpdate();
        }

        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', () => {
        if (activeDragCard && touchMode === 'card-drag') {
            activeDragCard.classList.remove('dragging');
            if (cardLayoutCoalescer) cardLayoutCoalescer.flush();
            activeDragCard = null;
            touchMode = null;
            dragViewportRect = null;
            pendingDragCard = null;
            saveDreams();
        }
    }, { passive: false });

    window.addEventListener('mouseup', () => {
        if (activeDragCard) {
            activeDragCard.classList.remove('dragging');
            if (cardLayoutCoalescer) cardLayoutCoalescer.flush();
            activeDragCard = null;
            dragViewportRect = null;
            pendingDragCard = null;
            saveDreams();
        }
        if (activeResizeCard) {
            if (cardLayoutCoalescer) cardLayoutCoalescer.flush();
            activeResizeCard = null;
            dragViewportRect = null;
            pendingResizeCard = null;
            saveDreams();
        }
    });

    // ==========================================================================
    // 8. МОДАЛЬНОЕ ОКНО СОЗДАНИЯ И РЕДАКТИРОВАНИЯ ЦЕЛЕЙ
    // ==========================================================================
    
    function discardPendingLocalUpload() {
        if (pendingLocalImageRef) {
            deleteLocalImageRef(pendingLocalImageRef);
            pendingLocalImageRef = null;
        }
    }

    function resetLocalImagePreview(discardPending = false) {
        if (discardPending) {
            discardPendingLocalUpload();
        }
        if (currentLocalImagePreviewUrl) {
            URL.revokeObjectURL(currentLocalImagePreviewUrl);
            currentLocalImagePreviewUrl = null;
        }
        if (dreamImageFile) dreamImageFile.value = '';
        localImagePreview.classList.add('hidden');
        localImagePreviewImg.removeAttribute('src');
        localImagePreviewName.innerText = '';
        localImagePreviewSize.innerText = '';
    }

    function openDreamModal(dream = null) {
        tempMilestones = [];
        resetLocalImagePreview(true);
        
        if (dream) {
            // Режим редактирования
            modalTitle.innerText = 'Редактировать мечту';
            editDreamId.value = dream.id;
            dreamTitleInput.value = dream.title;
            dreamCategorySelect.value = dream.category;
            dreamYearInput.value = dream.year || '';
            dreamDescInput.value = dream.desc;
            
            // Картинка
            dreamImageFinalPath.value = dream.imageUrl;
            
            // Подзадачи
            if (dream.milestones) {
                tempMilestones = [...dream.milestones];
            }
        } else {
            // Режим создания новой цели
            modalTitle.innerText = 'Создать новую мечту';
            editDreamId.value = '';
            dreamForm.reset();
            
            // Ставим картинку-заглушку по умолчанию
            dreamImageFinalPath.value = UNSPLASH_PRESETS.career[0];
            
            // Если мы находимся в фильтре категорий, автоматически подставляем категорию
            if (currentCategoryFilter !== 'all') {
                dreamCategorySelect.value = currentCategoryFilter;
            }
        }
        
        renderModalMilestones();
        renderUnsplashPresets();
        
        // По умолчанию открываем вкладку Unsplash
        switchImageTab(isLocalImageRef(dreamImageFinalPath.value) ? 'upload' : 'unsplash');
        
        dreamModal.classList.add('active');
    }

    function closeDreamModal() {
        dreamModal.classList.remove('active');
        resetLocalImagePreview(true);
    }

    closeButtons.forEach(btn => btn.addEventListener('click', (e) => {
        e.preventDefault();
        closeDreamModal();
        archiveModal.classList.remove('active');
        if (trashModal) {
            trashModal.classList.remove('active');
            trashModal.setAttribute('aria-hidden', 'true');
        }
    }));

    // Вкладки выбора картинки
    tabButtons.forEach(btn => btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        switchImageTab(tab);
    }));

    function switchImageTab(tab) {
        tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        if (tab === 'unsplash') {
            unsplashTab.classList.remove('hidden');
            uploadTab.classList.add('hidden');
            urlTab.classList.add('hidden');
        } else if (tab === 'upload') {
            unsplashTab.classList.add('hidden');
            uploadTab.classList.remove('hidden');
            urlTab.classList.add('hidden');
        } else {
            unsplashTab.classList.add('hidden');
            uploadTab.classList.add('hidden');
            urlTab.classList.remove('hidden');
        }
    }

    dreamImageFile.addEventListener('change', async () => {
        const file = dreamImageFile.files && dreamImageFile.files[0];
        if (!file) return;

        try {
            localImagePreviewName.innerText = 'Обработка изображения...';
            localImagePreviewSize.innerText = '';
            localImagePreview.classList.remove('hidden');

            discardPendingLocalUpload();
            const blob = await compressImageFile(file);
            const imageRef = await saveLocalImageBlob(blob, file.name);
            dreamImageFinalPath.value = imageRef;
            pendingLocalImageRef = imageRef;

            if (currentLocalImagePreviewUrl) {
                URL.revokeObjectURL(currentLocalImagePreviewUrl);
            }
            currentLocalImagePreviewUrl = URL.createObjectURL(blob);
            localImagePreviewImg.src = currentLocalImagePreviewUrl;
            localImagePreviewName.innerText = file.name;
            localImagePreviewSize.innerText = `${formatBytes(file.size)} -> ${formatBytes(blob.size)}`;
            showToast('Картинка сжата и добавлена локально', 'success');
        } catch (error) {
            console.error('[DreamBoard] Image upload failed', error);
            resetLocalImagePreview();
            showToast(error.message || 'Не удалось обработать изображение', 'info');
        }
    });

    // Рендеринг подзадач в модальном окне
    function renderModalMilestones() {
        modalMilestonesList.innerHTML = '';
        tempMilestones.forEach(m => {
            const div = document.createElement('div');
            div.className = 'modal-milestone-item';
            const label = document.createElement('span');
            label.textContent = m.text;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'delete-milestone-btn';
            remove.dataset.mid = m.id;
            remove.textContent = '×';
            div.append(label, remove);

            remove.addEventListener('click', () => {
                tempMilestones = tempMilestones.filter(x => x.id !== m.id);
                renderModalMilestones();
            });
            
            modalMilestonesList.appendChild(div);
        });
    }

    // Добавление новой вехи в список внутри формы
    addMilestoneBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const text = newMilestoneInput.value.trim();
        if (text) {
            tempMilestones.push({
                id: 'm-' + Date.now() + Math.random().toString(36).substr(2, 4),
                text: text,
                checked: false
            });
            newMilestoneInput.value = '';
            renderModalMilestones();
            playSoundEffect('hover');
        }
    });

    // Отрисовка пресетов картинок Unsplash
    function renderUnsplashPresets() {
        unsplashResultsGrid.innerHTML = '';
        const cat = dreamCategorySelect.value;
        const photos = UNSPLASH_PRESETS[cat] || UNSPLASH_PRESETS.career;
        
        photos.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            img.className = 'unsplash-img-item';
            if (dreamImageFinalPath.value === url) {
                img.classList.add('selected');
            }
            
            img.addEventListener('click', () => {
                unsplashResultsGrid.querySelectorAll('.unsplash-img-item').forEach(i => i.classList.remove('selected'));
                img.classList.add('selected');
                discardPendingLocalUpload();
                dreamImageFinalPath.value = url;
                playSoundEffect('hover');
            });
            unsplashResultsGrid.appendChild(img);
        });
    }

    // Перерисовка пресетов при изменении категории цели
    dreamCategorySelect.addEventListener('change', () => {
        renderUnsplashPresets();
        // Автоматически выбираем первую картинку из новой категории
        const cat = dreamCategorySelect.value;
        if (UNSPLASH_PRESETS[cat]) {
            discardPendingLocalUpload();
            dreamImageFinalPath.value = UNSPLASH_PRESETS[cat][0];
            renderUnsplashPresets();
        }
    });

    // Имитация поиска по Unsplash (генерирует качественные случайные совпадения)
    unsplashSearchBtn.addEventListener('click', () => {
        const query = unsplashSearchInput.value.trim();
        if (query) {
            unsplashResultsGrid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:var(--text-muted); font-size:12px;">Поиск картинок...</p>`;
            setTimeout(() => {
                unsplashResultsGrid.innerHTML = '';
                // Создаем 4 псевдослучайных высококачественных Unsplash фото по тегу
                for (let i = 0; i < 4; i++) {
                    const sig = Math.floor(Math.random() * 1000);
                    const url = `https://images.unsplash.com/featured/800x600/?${encodeURIComponent(query)}&sig=${sig}`;
                    
                    const img = document.createElement('img');
                    img.src = url;
                    img.className = 'unsplash-img-item';
                    
                    img.addEventListener('click', () => {
                        unsplashResultsGrid.querySelectorAll('.unsplash-img-item').forEach(idx => idx.classList.remove('selected'));
                        img.classList.add('selected');
                        discardPendingLocalUpload();
                        dreamImageFinalPath.value = url;
                        playSoundEffect('hover');
                    });
                    
                    unsplashResultsGrid.appendChild(img);
                }
            }, 800);
        }
    });

    // Обработчик сабмита формы создания / изменения мечты
    dreamForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const id = editDreamId.value;
        const title = dreamTitleInput.value.trim();
        const category = dreamCategorySelect.value;
        const year = parseInt(dreamYearInput.value) || null;
        const desc = dreamDescInput.value.trim();
        
        // Определяем итоговый путь к картинке
        let finalImage = dreamImageFinalPath.value;
        const directUrl = document.getElementById('dream-image-url').value.trim();
        if (!urlTab.classList.contains('hidden') && directUrl) {
            finalImage = directUrl;
        }
        if (pendingLocalImageRef && pendingLocalImageRef !== finalImage) {
            discardPendingLocalUpload();
        }

        let previousDreamSnapshot = null;
        let changedIndex = -1;
        let createdDream = null;
        let imageToCleanup = '';

        if (id) {
            // Обновление существующей цели
            const index = dreams.findIndex(d => d.id === id);
            if (index !== -1) {
                changedIndex = index;
                previousDreamSnapshot = typeof DreamBoardTrash !== 'undefined'
                    ? DreamBoardTrash.cloneSafe(dreams[index])
                    : JSON.parse(JSON.stringify(dreams[index]));
                const previousImage = dreams[index].imageUrl;
                dreams[index] = {
                    ...dreams[index],
                    title,
                    category,
                    year,
                    desc,
                    imageUrl: finalImage,
                    milestones: [...tempMilestones]
                };
                if (previousImage !== finalImage) {
                    imageToCleanup = previousImage;
                }
            }
        } else {
            // Создание новой цели
            // Генерируем красивую случайную позицию около центра холста
            const randomX = 2200 + (Math.random() - 0.5) * 400;
            const randomY = 2200 + (Math.random() - 0.5) * 400;
            
            const newDream = {
                id: 'dream-' + Date.now(),
                title,
                category,
                year,
                desc,
                imageUrl: finalImage,
                milestones: [...tempMilestones],
                status: 'active',
                canvasPos: { x: Math.round(randomX/10)*10, y: Math.round(randomY/10)*10, width: 320, height: 420 }
            };
            
            dreams.push(newDream);
            createdDream = newDream;
        }

        const saveResult = saveDreams();
        if (!saveResult.ok) {
            if (changedIndex !== -1 && previousDreamSnapshot) dreams[changedIndex] = previousDreamSnapshot;
            if (createdDream) dreams = dreams.filter(dream => dream !== createdDream);
            renderAll();
            return;
        }
        if (imageToCleanup && !isImageRefInUse(imageToCleanup)) {
            deleteLocalImageRef(imageToCleanup);
        }
        if (id) {
            showToast('Цель успешно обновлена', 'success');
        } else {
            playSoundEffect('manifest-success');
            showToast('Новая мечта визуализирована!', 'success');
        }
        renderAll();
        pendingLocalImageRef = null;
        closeDreamModal();
    });

    // Добавление мечты с холста
    canvasAddDream.addEventListener('click', () => openDreamModal());
    document.querySelectorAll('.add-dream-btn').forEach(btn => {
        btn.addEventListener('click', () => openDreamModal());
    });

    // Удаление цели
    function deleteDream(id) {
        const originalIndex = dreams.findIndex(dream => dream.id === id);
        if (originalIndex === -1) return;
        const dream = dreams[originalIndex];
        if (!window.confirm(`Удалить цель «${dream.title}»? Её можно будет восстановить в течение 30 дней.`)) return;
        if (trashProtected || typeof DreamBoardTrash === 'undefined') {
            showToast('Удаление недоступно: корзина защищена', 'error');
            return;
        }

        const added = DreamBoardTrash.add(appStorageRef, dream, originalIndex, { makeId: makeTrashRecordId });
        if (!added.ok) {
            showToast(added.error === 'trash-full' ? 'Корзина заполнена. Восстановите или удалите старые цели.' : 'Не удалось создать безопасную копию цели', 'error');
            return;
        }
        trashItems = added.items;
        updateTrashCount();

        dreams = dreams.slice(0, originalIndex).concat(dreams.slice(originalIndex + 1));
        const saved = saveDreams();
        if (!saved.ok) {
            dreams.splice(originalIndex, 0, dream);
            const rollback = DreamBoardTrash.remove(appStorageRef, added.record.id);
            if (rollback.ok) trashItems = rollback.items;
            else reloadTrashItems();
            updateTrashCount();
            renderAll();
            return;
        }

        renderAll();
        playSoundEffect('hover');
        showToast(`Цель «${dream.title}» удалена`, 'info', {
            duration: 10000,
            actionLabel: 'Отменить',
            onAction: () => restoreTrashRecord(added.record.id, { silent: true })
        });
    }

    // Манифестация (успешное воплощение мечты)
    function manifestDreamSuccess(id, event) {
        const dream = dreams.find(d => d.id === id);
        if (dream) {
            dream.status = 'manifested';
            saveDreams();
            
            // Золотой салют из конфетти в месте клика
            const rect = event.target.getBoundingClientRect();
            runConfettiCelebration(rect.left + rect.width/2, rect.top + rect.height/2, dream.category);
            
            playSoundEffect('manifest-success');
            showToast(`★ Поздравляем! Цель "${dream.title}" Воплощена!`, 'success');
            
            // Плавный переход
            setTimeout(() => {
                renderAll();
            }, 800);
        }
    }

    // ==========================================================================
    // 9. ИММЕРСИВНЫЙ РЕЖИМ МАНИФЕСТАЦИИ (MANIFESTATION DEEP MEDITATION)
    // ==========================================================================
    let manifestInterval = null;
    let currentManifestIdx = 0;
    let isManifestPlaying = true;
    let breathGuideTimer = null;
    let manifestWakeLock = null;
    let manifestTouchStartX = 0;
    let manifestTouchStartY = 0;
    let manifestTouchStartTime = 0;
    
    // Список вдохновляющих аффирмаций
    const GENERAL_AFFIRMATIONS = [
        "Я уверенно иду к реализации своих истинных желаний.",
        "Каждый вдох наполняет меня силой для воплощения мечты.",
        "Мои цели гармонично материализуются в моей жизни.",
        "Я благодарен Вселенной за безграничные возможности.",
        "Творческая энергия Вселенной течет во мне.",
        "С каждым днем я приближаюсь к своему идеальному будущему."
    ];

    startManifestBtn.addEventListener('click', () => {
        // Проверяем, есть ли активные цели
        const activeDreams = dreams.filter(d => d.status === 'active');
        if (activeDreams.length === 0) {
            showToast('Создайте хотя бы одну мечту, чтобы войти в Режим Манифестации', 'info');
            return;
        }
        
        enterManifestMode(activeDreams);
    });

    exitManifestBtn.addEventListener('click', () => {
        exitManifestMode();
    });

    function enterManifestMode(activeDreams) {
        initAudioContext();
        currentManifestIdx = 0;
        isManifestPlaying = true;
        
        manifestPlayBtn.classList.add('active');
        manifestPlayBtn.querySelector('.pause-icon').classList.remove('hidden');
        manifestPlayBtn.querySelector('.play-icon').classList.add('hidden');
        
        manifestOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Запускаем расслабляющую фоновую музыку
        startManifestationMusic();
        
        // Инициализируем звездное небо в Режиме Манифестации
        initManifestStarfield();
        
        // Рендерим слайды
        renderManifestSlides(activeDreams);
        
        // Показываем первую карточку
        showManifestSlide(currentManifestIdx, activeDreams);
        
        // Запускаем авто-пролистывание слайдов (каждые 12 секунд)
        startManifestLoop(activeDreams);
        
        // Запускаем Дыхательный Гид
        startBreathingGuide();
        requestManifestWakeLock();
    }

    function exitManifestMode() {
        manifestOverlay.classList.remove('active');
        document.body.style.overflow = '';
        
        // Останавливаем музыку и циклы
        stopManifestationMusic();
        clearInterval(manifestInterval);
        manifestInterval = null;
        
        clearInterval(breathGuideTimer);
        breathGuideTimer = null;
        
        stopManifestStarfield();
        releaseManifestWakeLock();
    }

    async function requestManifestWakeLock() {
        if (!('wakeLock' in navigator)) return;
        try {
            manifestWakeLock = await navigator.wakeLock.request('screen');
            manifestWakeLock.addEventListener('release', () => {
                manifestWakeLock = null;
            });
        } catch (error) {
            console.warn('[DreamBoard] Wake Lock unavailable', error);
        }
    }

    async function releaseManifestWakeLock() {
        if (!manifestWakeLock) return;
        try {
            await manifestWakeLock.release();
        } catch (error) {
            console.warn('[DreamBoard] Wake Lock release failed', error);
        } finally {
            manifestWakeLock = null;
        }
    }

    // ==========================================================================
    // PAUSE/RESUME ДЕКОРАТИВНОЙ РАБОТЫ ПРИ СКРЫТОЙ ВКЛАДКЕ
    // ==========================================================================
    // Централизованная архитектура: document.hidden останавливает все
    // декоративные циклы во всех профилях, visible возобновляет только те,
    // что реально активны (без дубликатов).

    function pauseDecorativeLoops() {
        pauseAmbientParticles();
        stopManifestStarfield();

        if (chimeInterval) {
            clearInterval(chimeInterval);
            chimeInterval = null;
        }

        if (manifestOverlay.classList.contains('active')) {
            if (manifestInterval) {
                clearInterval(manifestInterval);
                manifestInterval = null;
            }
            if (breathGuideTimer) {
                clearInterval(breathGuideTimer);
                breathGuideTimer = null;
            }
        }

        // Flush незавершённого debounce-персиста при уходе со вкладки.
        if (canvasPersistTimer) {
            clearTimeout(canvasPersistTimer);
            canvasPersistTimer = null;
        }
        persistCanvasViewState();
    }

    function resumeDecorativeLoops() {
        if (document.hidden) return;

        resumeAmbientParticles();

        if (manifestOverlay.classList.contains('active')) {
            resumeManifestStarfield();

            const activeDreams = dreams.filter(d => d.status === 'active');
            if (!manifestInterval && activeDreams.length > 0) {
                startManifestLoop(activeDreams); // текущий слайд не сбрасывается
            }
            if (!breathGuideTimer) {
                startBreathingGuide(); // фаза начинается с безопасного «Вдох»
            }
            // Звук сам не включается: переливы возобновляются только если
            // музыка манифестации была активна до скрытия вкладки.
            if (isSoundOn && ambientSynth && !chimeInterval) {
                chimeInterval = setInterval(() => {
                    if (Math.random() > 0.3) {
                        playSoundEffect('chime-scale');
                        setTimeout(() => playSoundEffect('chime-scale'), 350);
                    }
                }, 6000);
            }
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            pauseDecorativeLoops();
        } else if (document.visibilityState === 'visible') {
            resumeDecorativeLoops();
            // Существующее восстановление Wake Lock сохраняется.
            if (manifestOverlay.classList.contains('active')) {
                requestManifestWakeLock();
            }
        }
    });

    function renderManifestSlides(activeDreams) {
        manifestSlider.innerHTML = '';
        activeDreams.forEach(dream => {
            const slide = document.createElement('div');
            slide.className = 'manifest-slide';
            slide.dataset.dreamId = dream.id;
            slide.innerHTML = `
                ${getImageHtml(dream.imageUrl, 'manifest-slide-img', dream.title, false)}
                <div class="manifest-slide-overlay"></div>
            `;
            manifestSlider.appendChild(slide);
        });
        hydrateLocalImages(manifestSlider);
    }

    function showManifestSlide(idx, activeDreams) {
        const slides = manifestOverlay.querySelectorAll('.manifest-slide');
        const dream = activeDreams[idx];
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', slide.dataset.dreamId === dream.id || i === idx);
        });
        
        updateManifestCardInfo(dream);
        
        // Обновляем аффирмацию внизу
        const aff = GENERAL_AFFIRMATIONS[Math.floor(Math.random() * GENERAL_AFFIRMATIONS.length)];
        manifestAffirmationText.style.opacity = 0;
        setTimeout(() => {
            manifestAffirmationText.innerText = aff;
            manifestAffirmationText.style.opacity = 0.9;
        }, 800);
        
        playSoundEffect('chime-scale');
    }

    function updateManifestCardInfo(dream) {
        manifestCategoryBadge.className = `card-badge`;
        manifestCategoryBadge.classList.add(`category-${dream.category}`);
        manifestCategoryBadge.innerText = getCategoryNameRU(dream.category);
        manifestTitle.innerText = dream.title;
        manifestDesc.innerText = dream.desc;
        
        // Отрисовка вех в Режиме Манифестации
        manifestMilestones.innerHTML = '';
        if (dream.milestones && dream.milestones.length > 0) {
            const done = dream.milestones.filter(m => m.checked).length;
            const total = dream.milestones.length;
            const percent = Math.round((done / total) * 100);
            
            manifestMilestones.innerHTML = `
                <div style="font-size:12px; color:var(--text-secondary); display:flex; justify-content:space-between; margin-bottom:4px;">
                    <span>Выполнение вех: ${done}/${total}</span>
                    <span>${percent}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.06); height:4px; border-radius:2px; width:100%; overflow:hidden;">
                    <div style="background:linear-gradient(90deg, #00f2fe 0%, #a18cd1 100%); width:${percent}%; height:100%; transition: width 0.5s ease;"></div>
                </div>
            `;
        }
    }

    function startManifestLoop(activeDreams) {
        if (manifestInterval) clearInterval(manifestInterval);
        
        manifestInterval = setInterval(() => {
            if (isManifestPlaying) {
                currentManifestIdx = (currentManifestIdx + 1) % activeDreams.length;
                showManifestSlide(currentManifestIdx, activeDreams);
            }
        }, 12000); // 12 секунд на мечту
    }

    // Управление кнопками плеера
    manifestPlayBtn.addEventListener('click', () => {
        isManifestPlaying = !isManifestPlaying;
        manifestPlayBtn.classList.toggle('active', isManifestPlaying);
        
        if (isManifestPlaying) {
            manifestPlayBtn.querySelector('.pause-icon').classList.remove('hidden');
            manifestPlayBtn.querySelector('.play-icon').classList.add('hidden');
            showToast('Манифестация возобновлена', 'info');
        } else {
            manifestPlayBtn.querySelector('.pause-icon').classList.add('hidden');
            manifestPlayBtn.querySelector('.play-icon').classList.remove('hidden');
            showToast('Пауза', 'info');
        }
    });

    manifestPrevBtn.addEventListener('click', () => {
        const activeDreams = dreams.filter(d => d.status === 'active');
        currentManifestIdx = (currentManifestIdx - 1 + activeDreams.length) % activeDreams.length;
        showManifestSlide(currentManifestIdx, activeDreams);
        startManifestLoop(activeDreams); // Перезапускаем таймер
    });

    manifestNextBtn.addEventListener('click', () => {
        const activeDreams = dreams.filter(d => d.status === 'active');
        currentManifestIdx = (currentManifestIdx + 1) % activeDreams.length;
        showManifestSlide(currentManifestIdx, activeDreams);
        startManifestLoop(activeDreams);
    });

    // ЛОГИКА ДЫХАТЕЛЬНОГО ГИДА (4-4-4 SECONDS BOX BREATHING)
    function isManifestGestureBlocked(target) {
        return target.closest('.exit-manifest-btn') ||
            target.closest('.manifest-controls') ||
            target.closest('.manifest-rotate-prompt');
    }

    function swipeManifestStep(direction) {
        const activeDreams = dreams.filter(d => d.status === 'active');
        if (activeDreams.length === 0) return;
        currentManifestIdx = (currentManifestIdx + direction + activeDreams.length) % activeDreams.length;
        showManifestSlide(currentManifestIdx, activeDreams);
        startManifestLoop(activeDreams);
    }

    manifestOverlay.addEventListener('touchstart', (e) => {
        if (!manifestOverlay.classList.contains('active') || isManifestGestureBlocked(e.target)) return;
        manifestTouchStartX = e.touches[0].clientX;
        manifestTouchStartY = e.touches[0].clientY;
        manifestTouchStartTime = Date.now();
    }, { passive: true });

    manifestOverlay.addEventListener('touchend', (e) => {
        if (!manifestOverlay.classList.contains('active') || isManifestGestureBlocked(e.target) || !e.changedTouches.length) return;

        const touch = e.changedTouches[0];
        const dx = touch.clientX - manifestTouchStartX;
        const dy = touch.clientY - manifestTouchStartY;
        const elapsed = Date.now() - manifestTouchStartTime;

        if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            swipeManifestStep(dx < 0 ? 1 : -1);
            e.preventDefault();
            return;
        }

        if (Math.abs(dx) < 18 && Math.abs(dy) < 18 && elapsed < 500) {
            manifestPlayBtn.click();
            e.preventDefault();
        }
    }, { passive: false });

    manifestOverlay.addEventListener('click', (e) => {
        if (!manifestOverlay.classList.contains('active') || isManifestGestureBlocked(e.target)) return;
        if (window.matchMedia('(max-width: 900px) and (orientation: landscape)').matches) {
            manifestPlayBtn.click();
        }
    });

    function startBreathingGuide() {
        if (breathGuideTimer) clearInterval(breathGuideTimer);
        
        let phase = 0; // 0: inhale, 1: hold, 2: exhale, 3: hold
        
        function runPhase() {
            if (phase === 0) {
                // ВДОХ (4 секунды)
                breathText.innerText = 'Вдох';
                breathCircle.className = 'breath-circle-inner inhale';
                phase = 1;
            } 
            else if (phase === 1) {
                // ЗАДЕРЖКА (4 секунды)
                breathText.innerText = 'Задержка';
                breathCircle.className = 'breath-circle-inner hold';
                phase = 2;
            } 
            else if (phase === 2) {
                // ВЫДОХ (4 секунды)
                breathText.innerText = 'Выдох';
                breathCircle.className = 'breath-circle-inner exhale';
                phase = 3;
            } 
            else if (phase === 3) {
                // ЗАДЕРЖКА (4 секунды)
                breathText.innerText = 'Покой';
                breathCircle.className = 'breath-circle-inner';
                phase = 0;
            }
        }
        
        runPhase();
        breathGuideTimer = setInterval(runPhase, 4000);
    }

    // АНИМИРОВАННЫЙ ЗВЕЗДНЫЙ ФОН НА КАНВАСЕ (MANIFEST OVERLAY)
    let starfieldFrameId = null;
    let starfieldAnimateFn = null;
    function initManifestStarfield() {
        const canvas = document.getElementById('manifest-starfield');
        const ctx = canvas.getContext('2d');
        
        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        
        const stars = [];
        const starCount = starCountLimit; // lite: ≤40, normal: 140
        
        for (let i = 0; i < starCount; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                z: Math.random() * canvas.width, // Используем Z для глубины 3D
                color: `rgba(${Math.floor(Math.random() * 55 + 200)}, ${Math.floor(Math.random() * 55 + 200)}, 255, ${Math.random() * 0.8 + 0.2})`,
                size: Math.random() * 1.5 + 0.5
            });
        }
        
        // В lite-профиле свечение звёзд отключено (shadowBlur дорог на слабом GPU).
        const starGlow = isLite ? 0 : 10;

        function animate() {
            ctx.fillStyle = 'rgba(2, 1, 6, 0.08)'; // Легкий шлейф
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            stars.forEach(star => {
                // Приближаем звезды в 3D
                star.z -= 0.65;
                if (star.z <= 0) {
                    star.z = canvas.width;
                    star.x = Math.random() * canvas.width;
                    star.y = Math.random() * canvas.height;
                }
                
                // Проекция 3D в 2D координаты
                const k = 128.0 / star.z;
                const px = (star.x - canvas.width / 2) * k + canvas.width / 2;
                const py = (star.y - canvas.height / 2) * k + canvas.height / 2;
                
                if (px >= 0 && px <= canvas.width && py >= 0 && py <= canvas.height) {
                    const size = star.size * k * 1.8;
                    
                    ctx.beginPath();
                    ctx.arc(px, py, Math.min(size, 4), 0, Math.PI * 2);
                    ctx.fillStyle = star.color;
                    if (starGlow > 0) {
                        ctx.shadowBlur = starGlow;
                        ctx.shadowColor = 'rgba(0, 242, 254, 0.2)';
                    }
                    ctx.fill();
                }
            });
            
            starfieldFrameId = requestAnimationFrame(animate);
        }
        starfieldAnimateFn = animate;
        animate();
    }

    function stopManifestStarfield() {
        if (starfieldFrameId) {
            cancelAnimationFrame(starfieldFrameId);
            starfieldFrameId = null;
        }
    }

    // Возобновление после hidden: только если манифестация активна и цикл
    // действительно был запущен; дубликат RAF не создаётся (проверка frameId).
    function resumeManifestStarfield() {
        if (!starfieldFrameId && starfieldAnimateFn) {
            starfieldAnimateFn();
        }
    }

    // ==========================================================================
    // 10. АРХИВ БЛАГОДАРНОСТИ (GRATITUDE ARCHIVE)
    // ==========================================================================
    
    archiveToggleBtn.addEventListener('click', () => {
        openArchiveModal();
    });

    function openArchiveModal() {
        archivedDreamsGrid.innerHTML = '';
        const manifested = dreams.filter(d => d.status === 'manifested');
        
        if (manifested.length === 0) {
            archivedDreamsGrid.innerHTML = `
                <div class="empty-archive-state" style="grid-column: 1/-1; padding:60px 0; text-align:center;">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" style="margin-bottom:12px;">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/>
                    </svg>
                    <p style="color:var(--text-secondary);">Здесь пока нет ваших воплощенных мечтаний. Всему свое время!</p>
                </div>
            `;
        } else {
            manifested.forEach(dream => {
                const card = document.createElement('div');
                card.className = `dream-card glass-card category-manifested`;
                
                // Рендерим поле для дневниковой записи благодарности
                const note = dream.gratitudeNote || '';
                
                card.innerHTML = `
                    <div class="card-image-wrapper">
                        ${getImageHtml(dream.imageUrl, 'card-image', dream.title, false)}
                        <div class="card-image-overlay"></div>
                        <span class="card-badge">Воплощено ★</span>
                    </div>
                    <div class="card-body">
                        <h4 class="card-title">${escapeHtml(dream.title)}</h4>
                        <p class="card-desc" style="margin-bottom:12px;">${escapeHtml(dream.desc)}</p>
                        
                        <div class="gratitude-note-box" style="border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; margin-top:auto;">
                            <label style="font-size:10px; color:var(--manifested-color); font-weight:700;">Ваш Дневник Благодарности</label>
                            <textarea class="gratitude-note-input" rows="2" placeholder="Запишите свои мысли и чувства, когда эта цель реализовалась..." style="font-size:12px; padding:8px; margin-top:6px; background:rgba(0,0,0,0.25); border-color:rgba(255,215,0,0.1);">${escapeHtml(note)}</textarea>
                        </div>
                        
                        <button class="simple-btn reactivate-btn" style="margin-top:12px; font-size:11px; padding:6px 10px; width:fit-content; border-color:rgba(255,255,255,0.05); color:var(--text-secondary);">Вернуть на доску</button>
                    </div>
                `;
                
                // Обработчик сохранения дневника благодарности при потере фокуса
                const textarea = card.querySelector('.gratitude-note-input');
                textarea.addEventListener('blur', () => {
                    dream.gratitudeNote = textarea.value.trim();
                    saveDreams();
                    showToast('Дневник благодарности сохранен', 'success');
                });
                
                // Кнопка реактивации цели (вернуть на доску)
                card.querySelector('.reactivate-btn').addEventListener('click', () => {
                    dream.status = 'active';
                    saveDreams();
                    playSoundEffect('chime-milestone');
                    showToast(`Цель "${dream.title}" возвращена на интерактивную доску`, 'success');
                    openArchiveModal(); // Перерисовываем архив
                    renderAll(); // Перерисовываем доску
                });
                
                archivedDreamsGrid.appendChild(card);
            });
        }
        
        hydrateLocalImages(archivedDreamsGrid);
        archiveModal.classList.add('active');
        playSoundEffect('hover');
    }

    // ==========================================================================
    // 11. НАВИГАЦИЯ: ПЕРЕКЛЮЧЕНИЕ ВИДОВ И ФИЛЬТРОВ
    // ==========================================================================
    
    // Переключение Вид Сетки / Вид Холста
    gridViewBtn.addEventListener('click', () => {
        if (currentViewMode !== 'grid') {
            currentViewMode = 'grid';
            gridViewBtn.classList.add('active');
            canvasViewBtn.classList.remove('active');
            gridViewSection.classList.add('active');
            canvasViewSection.classList.remove('active');
            playSoundEffect('hover');
            renderGrid();
        }
    });

    canvasViewBtn.addEventListener('click', () => {
        if (currentViewMode !== 'canvas') {
            currentViewMode = 'canvas';
            canvasViewBtn.classList.add('active');
            gridViewBtn.classList.remove('active');
            canvasViewSection.classList.add('active');
            gridViewSection.classList.remove('active');
            playSoundEffect('hover');
            
            // Сбрасываем и рендерим холст
            renderCanvas();
            updateCanvasTransform();
        }
    });

    // Клик по фильтрам категорий в шапке
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentCategoryFilter = btn.dataset.category;
            playSoundEffect('hover');
            
            renderAll();
        });
    });

    // ==========================================================================
    // 12. СИСТЕМА УВЕДОМЛЕНИЙ (TOAST NOTIFICATIONS)
    // ==========================================================================
    
    function showToast(message, type = 'info', options = {}) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const text = document.createElement('span');
        text.className = 'toast-message';
        text.textContent = String(message);
        toast.appendChild(text);

        let actionButton = null;
        if (options.actionLabel && typeof options.onAction === 'function') {
            actionButton = document.createElement('button');
            actionButton.type = 'button';
            actionButton.className = 'toast-action';
            actionButton.textContent = options.actionLabel;
            toast.appendChild(actionButton);
        }
        
        container.appendChild(toast);

        let remaining = typeof options.duration === 'number' ? options.duration : 3500;
        let startedAt = 0;
        let timer = null;
        let dismissed = false;

        const dismiss = () => {
            if (dismissed) return;
            dismissed = true;
            if (timer) clearTimeout(timer);
            toast.style.animation = 'toast-out 0.4s ease forwards';
            toast.addEventListener('animationend', () => toast.remove(), { once: true });
            // Fallback: если browser/reduced-motion не отдаст animationend.
            setTimeout(() => toast.remove(), 600);
        };

        const schedule = () => {
            if (dismissed || remaining <= 0) return dismiss();
            startedAt = Date.now();
            timer = setTimeout(dismiss, remaining);
        };
        const pause = () => {
            if (!timer || dismissed) return;
            clearTimeout(timer);
            timer = null;
            remaining = Math.max(0, remaining - (Date.now() - startedAt));
        };

        toast.addEventListener('focusin', pause);
        toast.addEventListener('focusout', schedule);
        if (actionButton) {
            actionButton.addEventListener('click', async () => {
                if (actionButton.disabled) return;
                pause();
                actionButton.disabled = true;
                try { await options.onAction(); }
                finally { dismiss(); }
            });
        }
        schedule();
        return toast;
    }
    
    // Добавляем стиль для ухода тостов в style.css программно
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        @keyframes toast-out {
            0% { transform: translateY(0); opacity: 1; }
            100% { transform: translateY(-20px); opacity: 0; }
        }
    `;
    document.head.appendChild(styleSheet);

    // ==========================================================================
    // СТАРТ ПРИЛОЖЕНИЯ
    // ==========================================================================
    init();
});
