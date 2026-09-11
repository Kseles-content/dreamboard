(function (root) {
    'use strict';
    const BRAND = 'Kseles-DreamBoards';
    const palettes = {
        cosmos: { background: '#121a2b', card: '#1d283a', ink: '#f3f1f8', muted: '#b6c3d4', accent: '#64d9d0' },
        paper: { background: '#f3efe7', card: '#fffdf8', ink: '#26372f', muted: '#55675d', accent: '#287969' }
    };
    function wrap(ctx, value, width) {
        const lines = []; let line = '';
        for (const char of String(value || '')) {
            if (char === '\n') { lines.push(line); line = ''; continue; }
            if (line && ctx.measureText(line + char).width > width) {
                const space = line.lastIndexOf(' ');
                if (space > line.length / 2) { lines.push(line.slice(0, space)); line = line.slice(space + 1); }
                else { lines.push(line); line = ''; }
            }
            line += char;
        }
        if (line) lines.push(line);
        return lines;
    }
    function outputSize(width, height, format) {
        if (format === 'a2' || format === 'a2-hq') {
            const w = format === 'a2-hq' ? 4961 : 2480, h = format === 'a2-hq' ? 7016 : 3508;
            return { width: w, height: h, scale: Math.min(w / width, (h - w * .04) / height) };
        }
        const scale = Math.min(2, 4096 / width, 4096 / height, Math.sqrt(12000000 / (width * height)));
        return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
    }
    function positions(cards, view, columns) {
        if (view === 'canvas') {
            const left = Math.min(...cards.map(c => c.x)), top = Math.min(...cards.map(c => c.y));
            cards.forEach(c => { c.x = c.x - left + 32; c.y = c.y - top + 32; });
        } else {
            const heights = Array(columns).fill(32);
            cards.forEach(c => {
                const col = heights.indexOf(Math.min(...heights));
                c.x = 32 + col * (c.width + 20); c.y = heights[col]; heights[col] += c.height + 20;
            });
        }
        const width = Math.max(...cards.map(c => c.x + c.width)) + 32;
        return { width, height: Math.max(...cards.map(c => c.y + c.height)) + 32 + Math.max(44, width * .07) };
    }
    function printDensity(bytes, dpi) {
        // pHYs: реальная плотность печати, а не стандартные 96 dpi браузерного canvas.
        const chunk = new Uint8Array(21), view = new DataView(chunk.buffer);
        view.setUint32(0, 9); chunk.set([112, 72, 89, 115], 4);
        view.setUint32(8, Math.round(dpi / .0254)); view.setUint32(12, Math.round(dpi / .0254)); chunk[16] = 1;
        let crc = 0xffffffff;
        for (const byte of chunk.slice(4, 17)) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
        view.setUint32(17, (crc ^ 0xffffffff) >>> 0);
        const parts = [bytes.slice(0, 33), chunk];
        for (let at = 33; at < bytes.length;) {
            const size = new DataView(bytes.buffer, bytes.byteOffset + at, 4).getUint32(0) + 12;
            if (String.fromCharCode(...bytes.slice(at + 4, at + 8)) !== 'pHYs') parts.push(bytes.slice(at, at + size));
            at += size;
        }
        return parts;
    }
    const api = { BRAND, wrap, outputSize, positions, printDensity };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.DreamBoardPng = api;
    if (!root.document) return;

    async function loadImage(source, localId, readLocal) {
        let objectUrl;
        try {
            let blob;
            if (localId) blob = await readLocal(localId);
            else {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 12000);
                try {
                    const response = await fetch(source, { mode: 'cors', credentials: 'omit', signal: controller.signal });
                    if (!response.ok) throw new Error('image');
                    blob = await response.blob();
                } finally { clearTimeout(timeout); }
            }
            if (!blob || blob.size > 25000000) throw new Error('image');
            objectUrl = URL.createObjectURL(blob);
            const img = new Image(); img.src = objectUrl;
            let decodeTimer;
            try { await Promise.race([img.decode(), new Promise((_, reject) => { decodeTimer = setTimeout(() => reject(new Error('decode')), 12000); })]); }
            finally { clearTimeout(decodeTimer); }
            return img;
        } finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
    }
    function imageRect(ctx, img, x, y, w, h, fit) {
        const scale = (fit === 'contain' ? Math.min : Math.max)(w / img.naturalWidth, h / img.naturalHeight);
        const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore();
    }
    api.render = async function (dreams, appearance, readLocal, progress, format) {
        if (!dreams.length) throw new Error('На выбранной доске пока нет целей.');
        // Ограничение предотвращает чрезмерное потребление памяти на телефоне.
        if (dreams.length > 100) throw new Error('Для PNG выберите категорию, содержащую не больше 100 целей.');
        const palette = palettes[appearance.theme] || palettes.cosmos;
        const measure = document.createElement('canvas').getContext('2d');
        const print = format === 'a2' || format === 'a2-hq';
        const columns = Math.min(dreams.length, appearance.size === 'compact' ? (print ? 3 : 4) : appearance.size === 'large' ? 2 : (print ? 2 : 3));
        const cards = dreams.map(d => {
            const pos = d.canvasPos || {};
            const width = appearance.view === 'canvas' ? Math.max(160, Math.min(2000, Number(pos.width) || 320)) : (1016 - (columns - 1) * 20) / columns;
            measure.font = '600 21px Arial'; const title = wrap(measure, d.title, width - 36);
            measure.font = '15px Arial';
            const details = appearance.details === 'simple' ? [] : wrap(measure, d.desc, width - 36);
            const milestones = appearance.details === 'simple' ? [] : (d.milestones || []).flatMap(m => wrap(measure, (m.checked ? '✓ ' : '○ ') + m.text, width - 36));
            const credits = d.imageCredit && d.imageCredit.author ? wrap(measure, 'Фото: ' + d.imageCredit.author + ' · Pexels', width - 36) : [];
            const textHeight = 66 + title.length * 26 + details.length * 20 + milestones.length * 20 + credits.length * 18;
            const height = appearance.view === 'canvas' ? Math.max(200, Math.min(2400, Number(pos.height) || 420)) : 210 + textHeight;
            return { dream: d, width, height, x: Number.isFinite(pos.x) ? pos.x : 0, y: Number.isFinite(pos.y) ? pos.y : 0,
                title, details, milestones, credits, imageHeight: appearance.view === 'canvas' ? Math.max(90, height - Math.min(textHeight, height * .6)) : 210 };
        });
        const bounds = positions(cards, appearance.view, columns), output = outputSize(bounds.width, bounds.height, format);
        if (output.scale < .3) throw new Error('Доска слишком велика для читаемого PNG. Выберите категорию или сблизьте карточки на холсте.');
        const canvas = document.createElement('canvas'); canvas.width = output.width; canvas.height = output.height;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Не удалось создать изображение.');
        ctx.fillStyle = palette.background; ctx.fillRect(0, 0, output.width, output.height);
        const offsetX = (output.width - bounds.width * output.scale) / 2;
        const offsetY = (output.height - bounds.height * output.scale) / 2;
        ctx.translate(offsetX, offsetY); ctx.scale(output.scale, output.scale);
        let missing = 0; const started = Date.now();
        // Загружаем по одному изображению: память не растёт с числом фотографий.
        for (let i = 0; i < cards.length; i++) {
            const c = cards[i], d = c.dream; progress(i + 1, cards.length);
            ctx.save(); ctx.beginPath(); ctx.roundRect(c.x, c.y, c.width, c.height, 16); ctx.clip();
            ctx.fillStyle = palette.card; ctx.fillRect(c.x, c.y, c.width, c.height);
            try {
                if (Date.now() - started > 45000) throw new Error('time budget');
                const id = String(d.imageUrl || '').startsWith('dbimage:') ? String(d.imageUrl).slice(8) : null;
                const img = await loadImage(d.imageUrl, id, readLocal);
                imageRect(ctx, img, c.x, c.y, c.width, c.imageHeight, appearance.fit);
            } catch {
                missing++; ctx.fillStyle = palette.muted; ctx.font = '14px Arial';
                ctx.fillText('Фото недоступно', c.x + 18, c.y + c.imageHeight / 2);
            }
            let y = c.y + c.imageHeight + 26;
            ctx.font = '12px Arial'; ctx.fillStyle = palette.accent;
            ctx.fillText(String(d.year || ''), c.x + 18, y); y += 27;
            const draw = (lines, font, color, step) => {
                ctx.font = font; ctx.fillStyle = color;
                for (const line of lines) { if (y > c.y + c.height - 12 - c.credits.length * 18) break; ctx.fillText(line, c.x + 18, y); y += step; }
            };
            draw(c.title, '600 21px Arial', palette.ink, 26); y += 8;
            draw(c.details, '15px Arial', palette.muted, 20); y += 6;
            draw(c.milestones, '15px Arial', palette.muted, 20); y += 6;
            ctx.font = '12px Arial'; ctx.fillStyle = palette.muted;
            c.credits.forEach((line, index) => ctx.fillText(line, c.x + 18, c.y + c.height - 12 - (c.credits.length - index - 1) * 18));
            ctx.restore();
        }
        // Подпись впечатывается в пиксели; отдельное поле не перекрывает карточки.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = palette.muted; ctx.font = `500 ${Math.max(18, output.width * .016)}px Arial`; ctx.textAlign = 'right';
        ctx.fillText(BRAND, output.width * .97, output.height - output.width * .024);
        let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        canvas.width = canvas.height = 1;
        if (!blob) throw new Error('Телефону не хватило памяти. Попробуйте экспортировать одну категорию.');
        if (format === 'a2' || format === 'a2-hq') blob = new Blob(printDensity(new Uint8Array(await blob.arrayBuffer()), format === 'a2-hq' ? 300 : 150), { type: 'image/png' });
        return { blob, missing, width: output.width, height: output.height };
    };
    api.open = async function (dreams, appearance, readLocal) {
        const dialog = document.getElementById('png-export-dialog');
        if (dialog.open) return;
        const status = document.getElementById('png-export-status'), preview = document.getElementById('png-export-preview');
        const download = document.getElementById('png-export-download');
        let url; download.hidden = true; preview.hidden = true;
        status.textContent = 'Выберите размер и подготовьте изображение.'; dialog.showModal();
        const close = document.getElementById('png-export-close'), prepare = document.getElementById('png-export-prepare');
        const format = document.getElementById('png-export-format');
        close.onclick = () => dialog.close();
        prepare.onclick = async () => {
        close.disabled = prepare.disabled = format.disabled = true; download.hidden = true; preview.hidden = true;
        if (url) { URL.revokeObjectURL(url); url = null; }
        const prevent = e => e.preventDefault(); dialog.addEventListener('cancel', prevent);
        try {
            const result = await api.render(dreams, appearance, readLocal, (n, total) => { status.textContent = `Готовим карточки: ${n} из ${total}`; }, format.value);
            url = URL.createObjectURL(result.blob); preview.src = url; preview.hidden = false;
            download.href = url; download.download = 'Kseles-DreamBoards-' + new Date().toISOString().slice(0, 10) + '.png'; download.hidden = false;
            try { root.DreamBoardAnalytics?.track('png_ready'); } catch (_) { /* Optional statistics. */ }
            status.textContent = `${result.width} × ${result.height} · PNG` + (result.missing ? ` · Не удалось загрузить фото: ${result.missing}. Подключитесь к интернету, откройте доску и повторите подготовку. В этом PNG вместо них подписи — проверьте предпросмотр.` : ' · Готово к сохранению');
        } catch (error) { status.textContent = error.message || 'Не удалось подготовить PNG. Попробуйте ещё раз.'; }
        finally { close.disabled = prepare.disabled = format.disabled = false; dialog.removeEventListener('cancel', prevent); }
        };
        dialog.addEventListener('close', () => { preview.removeAttribute('src'); download.removeAttribute('href'); if (url) URL.revokeObjectURL(url); }, { once: true });
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
