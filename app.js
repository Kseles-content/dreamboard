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
    let currentCategoryFilter = 'all';
    let currentViewMode = 'grid'; // 'grid' | 'canvas'

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

    // Звук
    const audioToggleBtn = document.getElementById('audio-toggle-btn');

    // ==========================================================================
    // 2. ИНИЦИАЛИЗАЦИЯ И ХРАНЕНИЕ (STORAGE & SEED)
    // ==========================================================================
    
    function init() {
        const storedDreams = localStorage.getItem('dreams_db');
        if (storedDreams) {
            dreams = JSON.parse(storedDreams);
        } else {
            dreams = [...DEFAULT_DREAMS];
            saveDreams();
        }
        
        // Восстановление сохраненных позиций холста
        zoom = parseFloat(localStorage.getItem('canvas_zoom') || '1.0');
        panX = parseFloat(localStorage.getItem('canvas_pan_x') || '-2100');
        panY = parseFloat(localStorage.getItem('canvas_pan_y') || '-2050');
        
        renderAll();
        updateCanvasTransform();
        initAmbientParticles();
        setupAudioToggle();
    }

    function saveDreams() {
        localStorage.setItem('dreams_db', JSON.stringify(dreams));
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

    function getImageHtml(imageUrl, className, altText, lazy = true) {
        const safeAlt = String(altText || '').replace(/"/g, '&quot;');
        if (!isLocalImageRef(imageUrl)) {
            return `<img src="${imageUrl}" class="${className}" alt="${safeAlt}"${lazy ? ' loading="lazy"' : ''}>`;
        }

        const id = getLocalImageId(imageUrl);
        const cachedUrl = localImageObjectUrls.get(id) || 'assets/images/og-preview.png';
        return `<img src="${cachedUrl}" class="${className}" alt="${safeAlt}" data-local-image-id="${id}"${lazy ? ' loading="lazy"' : ''}>`;
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
        let animationFrameId;
        
        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
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
            
            animationFrameId = requestAnimationFrame(animate);
        }
        animate();
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
        const count = 120;
        
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
        renderGrid();
        renderCanvas();
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
                    <div class="milestone-item ${m.checked ? 'checked' : ''}" data-mid="${m.id}">
                        <div class="milestone-checkbox">
                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 3L3.5 5.5L8 1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                        </div>
                        <span>${m.text}</span>
                    </div>
                `;
            });
            milestonesHTML += `</div>`;
        }

        card.innerHTML = `
            <div class="card-image-wrapper">
                ${getImageHtml(dream.imageUrl, 'card-image', dream.title)}
                <div class="card-image-overlay"></div>
                <span class="card-badge">${getCategoryNameRU(dream.category)}</span>
                ${dream.year ? `<span class="card-year">${dream.year} г.</span>` : ''}
                
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
                <h4 class="card-title">${dream.title}</h4>
                <p class="card-desc">${dream.desc}</p>
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

    function updateCanvasTransform() {
        spatialCanvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
        canvasZoomIndicator.innerText = `${Math.round(zoom * 100)}%`;
        
        // Сохраняем в localStorage
        localStorage.setItem('canvas_zoom', zoom);
        localStorage.setItem('canvas_pan_x', panX);
        localStorage.setItem('canvas_pan_y', panY);
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
            updateCanvasTransform();
        }
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
    });

    // Масштабирование холста (Zoom) колесиком мыши
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
        
        updateCanvasTransform();
    }, { passive: false });

    // Кнопки зума
    canvasZoomIn.addEventListener('click', () => {
        zoom = Math.min(2.0, zoom + 0.15);
        updateCanvasTransform();
    });

    canvasZoomOut.addEventListener('click', () => {
        zoom = Math.max(0.2, zoom - 0.15);
        updateCanvasTransform();
    });

    canvasZoomReset.addEventListener('click', () => {
        zoom = 1.0;
        // Возвращаем в центр
        panX = -2100;
        panY = -2050;
        updateCanvasTransform();
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
            
            // Вычисляем оффсет с учетом зума
            const clientX = e.clientX;
            const clientY = e.clientY;
            
            dragOffsetX = (clientX / zoom) - dream.canvasPos.x;
            dragOffsetY = (clientY / zoom) - dream.canvasPos.y;
            
            e.preventDefault();
            e.stopPropagation();
        });

        // ВАРИАНТ Б: ИЗМЕНЕНИЕ РАЗМЕРОВ (RESIZE)
        resizer.addEventListener('mousedown', (e) => {
            activeResizeCard = card;
            resizeStartW = dream.canvasPos.width;
            resizeStartH = dream.canvasPos.height;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            
            e.preventDefault();
            e.stopPropagation();
        });
    }

    // Слушатели на все окно для гладкого драга и ресайза
    window.addEventListener('mousemove', (e) => {
        // Логика перетаскивания карточки
        if (activeDragCard) {
            const dreamId = activeDragCard.dataset.id;
            const dream = dreams.find(d => d.id === dreamId);
            
            if (dream) {
                let newX = (e.clientX / zoom) - dragOffsetX;
                let newY = (e.clientY / zoom) - dragOffsetY;
                
                // Привязка к невидимой сетке
                newX = Math.round(newX / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
                newY = Math.round(newY / GRID_SNAP_SIZE) * GRID_SNAP_SIZE;
                
                // Ограничиваем в пределах гигантского холста 5000x5000px
                newX = Math.max(10, Math.min(4600, newX));
                newY = Math.max(10, Math.min(4600, newY));
                
                dream.canvasPos.x = newX;
                dream.canvasPos.y = newY;
                
                activeDragCard.style.left = `${newX}px`;
                activeDragCard.style.top = `${newY}px`;
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
                
                activeResizeCard.style.width = `${newWidth}px`;
                activeResizeCard.style.height = `${newHeight}px`;
            }
        }
    });

    window.addEventListener('mouseup', () => {
        if (activeDragCard) {
            activeDragCard.classList.remove('dragging');
            activeDragCard = null;
            saveDreams();
        }
        if (activeResizeCard) {
            activeResizeCard = null;
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
            div.innerHTML = `
                <span>${m.text}</span>
                <button type="button" class="delete-milestone-btn" data-mid="${m.id}">&times;</button>
            `;
            
            div.querySelector('.delete-milestone-btn').addEventListener('click', () => {
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

        if (id) {
            // Обновление существующей цели
            const index = dreams.findIndex(d => d.id === id);
            if (index !== -1) {
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
                    deleteLocalImageRef(previousImage);
                }
                showToast('Цель успешно обновлена', 'success');
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
            playSoundEffect('manifest-success');
            showToast('Новая мечта визуализирована!', 'success');
        }
        
        saveDreams();
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
        const dream = dreams.find(d => d.id === id);
        if (dream) {
            deleteLocalImageRef(dream.imageUrl);
        }
        dreams = dreams.filter(d => d.id !== id);
        saveDreams();
        renderAll();
        playSoundEffect('hover');
        showToast('Цель отпущена и удалена', 'info');
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
    }

    function renderManifestSlides(activeDreams) {
        manifestSlider.innerHTML = '';
        activeDreams.forEach(dream => {
            const slide = document.createElement('div');
            slide.className = 'manifest-slide';
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
        slides.forEach((slide, i) => {
            slide.classList.toggle('active', i === idx);
        });
        
        const dream = activeDreams[idx];
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
    function initManifestStarfield() {
        const canvas = document.getElementById('manifest-starfield');
        const ctx = canvas.getContext('2d');
        
        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        
        const stars = [];
        const starCount = 140;
        
        for (let i = 0; i < starCount; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                z: Math.random() * canvas.width, // Используем Z для глубины 3D
                color: `rgba(${Math.floor(Math.random() * 55 + 200)}, ${Math.floor(Math.random() * 55 + 200)}, 255, ${Math.random() * 0.8 + 0.2})`,
                size: Math.random() * 1.5 + 0.5
            });
        }
        
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
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = 'rgba(0, 242, 254, 0.2)';
                    ctx.fill();
                }
            });
            
            starfieldFrameId = requestAnimationFrame(animate);
        }
        animate();
    }

    function stopManifestStarfield() {
        if (starfieldFrameId) {
            cancelAnimationFrame(starfieldFrameId);
            starfieldFrameId = null;
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
                        <h4 class="card-title">${dream.title}</h4>
                        <p class="card-desc" style="margin-bottom:12px;">${dream.desc}</p>
                        
                        <div class="gratitude-note-box" style="border-top:1px solid rgba(255,255,255,0.06); padding-top:12px; margin-top:auto;">
                            <label style="font-size:10px; color:var(--manifested-color); font-weight:700;">Ваш Дневник Благодарности</label>
                            <textarea class="gratitude-note-input" rows="2" placeholder="Запишите свои мысли и чувства, когда эта цель реализовалась..." style="font-size:12px; padding:8px; margin-top:6px; background:rgba(0,0,0,0.25); border-color:rgba(255,215,0,0.1);">${note}</textarea>
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
    
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerText = message;
        
        container.appendChild(toast);
        
        // Плавный уход через 3.5 секунды
        setTimeout(() => {
            toast.style.animation = 'toast-out 0.4s ease forwards';
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, 3500);
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
