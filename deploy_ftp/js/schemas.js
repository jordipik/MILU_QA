/**
 * Funciones relacionadas con imágenes de esquemas y posiciones.
 */

import { state } from './state.js';
import { val } from './helpers.js';

const missingSchemaImagePaths = new Set();

export function splitSchemaTokens(rawValue) {
    return String(rawValue || '').split(/[,;|\n]+/).map(s => s.trim()).filter(Boolean);
}

function getNormalizedBookForSchemaPaths(bookValue) {
    return String(bookValue || '').trim().replace(/\.pdf$/i, '');
}

export function stripFileExtension(value) {
    return String(value || '').trim().replace(/\.(png|webp|jpg|jpeg)$/i, '');
}

export function buildSchemaImageCandidates(bookValue, schemaToken) {
    const book = getNormalizedBookForSchemaPaths(bookValue);
    const token = String(schemaToken || '').trim();
    if (!book || !token) return [];

    const tokenNoExt = stripFileExtension(token);
    const folder = `esquemas/${encodeURIComponent(book)}_esquemas/`;
    const extensions = ['png', 'webp', 'jpg', 'jpeg'];
    const names = [tokenNoExt];
    if (!tokenNoExt.toLowerCase().startsWith(`${book.toLowerCase()}-`)) {
        names.push(`${book}-${tokenNoExt}`);
    }

    const paths = [];
    const seen = new Set();
    if (/\.(png|webp|jpg|jpeg)$/i.test(token)) {
        const direct = `${folder}${encodeURIComponent(token)}`;
        seen.add(direct); paths.push(direct);
    }
    names.forEach(name => {
        extensions.forEach(ext => {
            const path = `${folder}${encodeURIComponent(name)}.${ext}`;
            if (!seen.has(path)) { seen.add(path); paths.push(path); }
        });
    });
    return paths;
}

export function extractFileNameFromPath(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw);
        return decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
    } catch (_) {
        return decodeURIComponent(raw.replace(/\\/g, '/').split('/').pop() || '').trim();
    }
}

export function buildSchemaPosImageCandidates(bookValue, rawTokenOrPath) {
    const book = getNormalizedBookForSchemaPaths(bookValue);
    const raw = String(rawTokenOrPath || '').trim();
    if (!book || !raw) return [];

    const tokenFromPath = extractFileNameFromPath(raw) || raw;
    const tokenNoExt = stripFileExtension(tokenFromPath);
    const tokenExtMatch = tokenFromPath.match(/\.(png|webp|jpg|jpeg)$/i);
    const tokenExt = tokenExtMatch ? tokenExtMatch[1].toLowerCase() : '';
    const folder = `esquemas_pos_circulos/${encodeURIComponent(book)}-POS/`;
    const extensions = tokenExt ? [tokenExt] : ['png', 'webp'];
    const names = [tokenNoExt];
    if (!tokenNoExt.toLowerCase().startsWith(`${book.toLowerCase()}-`)) {
        names.push(`${book}-${tokenNoExt}`);
    }

    const paths = [];
    const seen = new Set();
    const pushPath = (p) => { if (!p || seen.has(p)) return; seen.add(p); paths.push(p); };

    names.forEach(name => { extensions.forEach(ext => { pushPath(`${folder}${encodeURIComponent(name)}.${ext}`); }); });
    if (tokenExt) {
        names.forEach(name => { pushPath(`${folder}${encodeURIComponent(name)}.${tokenExt}`); });
    }
    return paths;
}

export function setSchemaImageSource(imgElement, candidates, index = 0) {
    if (!imgElement) return;
    if (!Array.isArray(candidates) || index >= candidates.length) {
        imgElement.closest('.schema-thumb')?.remove();
        return;
    }

    let nextIndex = index;
    while (nextIndex < candidates.length && missingSchemaImagePaths.has(candidates[nextIndex])) {
        nextIndex += 1;
    }

    if (nextIndex >= candidates.length) {
        imgElement.closest('.schema-thumb')?.remove();
        return;
    }

    imgElement.src = candidates[nextIndex];
    imgElement.dataset.schemaCandidateIndex = String(nextIndex);
}

function buildImageStrip(candidates, stripEl, label, thumbClass = 'schema-thumb', emptyText = '') {
    stripEl.innerHTML = '';
    if (!candidates || !candidates.length) {
        const empty = document.createElement('span');
        empty.className = 'schemas-images-empty';
        empty.textContent = emptyText;
        stripEl.appendChild(empty);
        return;
    }

    const link = document.createElement('a');
    link.className = thumbClass;
    link.href = candidates[0];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = label || 'Abrir imagen';

    const img = document.createElement('img');
    img.alt = label || 'Imagen';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
        const currentIndex = Number(img.dataset.schemaCandidateIndex || '0');
        missingSchemaImagePaths.add(candidates[currentIndex]);
        const nextIndex = currentIndex + 1;
        if (nextIndex >= candidates.length) {
            link.remove();
            if (!stripEl.querySelector('.schema-thumb') && !stripEl.querySelector('.schemas-images-empty')) {
                const empty = document.createElement('span');
                empty.className = 'schemas-images-empty';
                empty.textContent = emptyText;
                stripEl.appendChild(empty);
            }
            return;
        }
        link.href = candidates[nextIndex];
        setSchemaImageSource(img, candidates, nextIndex);
    });
    link.appendChild(img);
    stripEl.appendChild(link);
    setSchemaImageSource(img, candidates, 0);
}

export function updateSchemasImageInline(bookValue, schemas) {
    const strip = document.getElementById('schemasImagesStrip');
    if (!strip) return;
    strip.innerHTML = '';
    if (!schemas || !schemas.length) {
        const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = '';
        strip.appendChild(empty); return;
    }
    schemas.slice(0, 3).forEach(schemaToken => {
        const candidates = buildSchemaImageCandidates(bookValue, schemaToken);
        if (!candidates.length) return;
        const link = document.createElement('a');
        link.className = 'schema-thumb large';
        link.href = candidates[0]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = 'Abrir imagen';
        const img = document.createElement('img');
        img.alt = 'Esquema'; img.loading = 'lazy'; img.decoding = 'async';
        img.addEventListener('error', () => {
            const currentIndex = Number(img.dataset.schemaCandidateIndex || '0');
            missingSchemaImagePaths.add(candidates[currentIndex]);
            const ci = currentIndex + 1;
            if (ci >= candidates.length) {
                link.remove();
                if (!strip.querySelector('.schema-thumb') && !strip.querySelector('.schemas-images-empty')) {
                    const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = '';
                    strip.appendChild(empty);
                }
                return;
            }
            link.href = candidates[ci]; setSchemaImageSource(img, candidates, ci);
        });
        link.appendChild(img); strip.appendChild(link); setSchemaImageSource(img, candidates, 0);
    });
    if (!strip.querySelector('.schema-thumb')) {
        const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = '';
        strip.appendChild(empty);
    }
}

export function getSchemasForBookPage(bookValue, pageValue) {
    const book = String(bookValue || '').trim();
    const page = String(pageValue || '').trim();
    if (!book || !page) return [];
    const requestedPage = Number(page.replace(/[^0-9]/g, ''));
    if (!Number.isFinite(requestedPage)) return [];
    const schemaSet = new Set();
    state.allData.forEach(row => {
        const rowBook = val(row, 'engine_model', '').toString().trim();
        const rowPage = Number(val(row, 'Source Page', '').toString().replace(/[^0-9]/g, ''));
        if (rowBook !== book || rowPage !== requestedPage) return;
        splitSchemaTokens(row?.esquemas).forEach(token => schemaSet.add(token));
    });
    return [...schemaSet].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function getPosSchemasForRow(row) {
    if (!row) return [];
    const book = String(val(row, 'engine_model', '') || '').trim();
    const itemsByLabel = new Map();
    const mergeItem = (rawToken, preferredPath = '') => {
        const cleanToken = String(rawToken || '').trim();
        if (!cleanToken) return;
        const fileName = extractFileNameFromPath(cleanToken) || cleanToken;
        const label = stripFileExtension(fileName);
        if (!label) return;
        const candidates = [
            ...buildSchemaPosImageCandidates(book, preferredPath || cleanToken),
            ...buildSchemaPosImageCandidates(book, cleanToken)
        ];
        if (!itemsByLabel.has(label)) itemsByLabel.set(label, { label, candidates: [] });
        const item = itemsByLabel.get(label);
        const existing = new Set(item.candidates);
        candidates.forEach(path => { if (!existing.has(path)) { existing.add(path); item.candidates.push(path); } });
    };
    splitSchemaTokens(row?.ruta_esquemas_pos).forEach(r => mergeItem(r, r));
    // exp_imagenes suele contener la URL final publicada; se valida tambien
    // contra la carpeta local esquemas_pos_circulos/<BOOK>-POS/ por basename.
    splitSchemaTokens(row?.exp_imagenes).forEach(r => mergeItem(r, r));
    splitSchemaTokens(row?.esquemas_circulos).forEach(t => mergeItem(t));
    return [...itemsByLabel.values()]
        .filter(item => item.candidates.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

export function updateSchemasInline(bookValue, pageValue) {
    const inlineEl = document.getElementById('schemasInlineList');
    const schemas = getSchemasForBookPage(bookValue, pageValue);
    if (!schemas.length) {
        if (inlineEl) { inlineEl.textContent = '—'; inlineEl.title = 'Sin esquemas vinculados para esta página'; }
        updateSchemasImageInline(bookValue, []);
        return;
    }
    const joined = schemas.join(', ');
    if (inlineEl) { inlineEl.textContent = joined; inlineEl.title = joined; }
    updateSchemasImageInline(bookValue, schemas);
}

// ─── Panel de posición seleccionada ─────────────────────────────────────────

function buildPosStrip(row, stripEl, metaEl, opts = {}) {
    const { emptyText = 'Sin selección', showMeta = true } = opts;
    stripEl.innerHTML = '';
    if (!row) {
        if (metaEl) metaEl.textContent = showMeta ? 'Selecciona un registro de la tabla' : '';
        const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = emptyText;
        stripEl.appendChild(empty); return;
    }
    const pn = String(val(row, 'PART NO.', '') || '').trim() || '—';
    const pos = String(val(row, 'POS', '') || '').trim() || '—';
    const book = String(val(row, 'engine_model', '') || '').trim() || '—';
    const page = String(val(row, 'Source Page', '') || '').trim() || '—';
    if (metaEl) metaEl.textContent = showMeta ? `PN: ${pn} | POS: ${pos} | Libro: ${book} | Página: ${page}` : '';

    const posItems = getPosSchemasForRow(row);
    if (!posItems.length) {
        const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = 'Este artículo no tiene imágenes de posición';
        stripEl.appendChild(empty); return;
    }

    posItems.forEach(item => {
        const { candidates, label } = item;
        if (!candidates.length) return;
        const link = document.createElement('a');
        link.className = 'schema-thumb'; link.href = candidates[0]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = label;
        const img = document.createElement('img');
        img.alt = label; img.loading = 'lazy'; img.decoding = 'async';
        img.addEventListener('error', () => {
            const currentIndex = Number(img.dataset.schemaCandidateIndex || '0');
            missingSchemaImagePaths.add(candidates[currentIndex]);
            const ci = currentIndex + 1;
            if (ci >= candidates.length) {
                link.remove();
                if (!stripEl.querySelector('.schema-thumb') && !stripEl.querySelector('.schemas-images-empty')) {
                    const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = 'Este artículo no tiene imágenes de posición';
                    stripEl.appendChild(empty);
                }
                return;
            }
            link.href = candidates[ci]; setSchemaImageSource(img, candidates, ci);
        });
        const caption = document.createElement('span'); caption.textContent = label;
        link.appendChild(img); link.appendChild(caption); stripEl.appendChild(link); setSchemaImageSource(img, candidates, 0);
    });

    if (!stripEl.querySelector('.schema-thumb')) {
        const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = 'Este artículo no tiene imágenes de posición';
        stripEl.appendChild(empty);
    }
}

export function renderSelectedRowPosPanel(row) {
    const strip = document.getElementById('selectedPosStrip');
    const meta = document.getElementById('selectedPosMeta');
    if (!strip || !meta) return;
    buildPosStrip(row, strip, meta, { emptyText: 'Sin selección', showMeta: true });
}

export function renderSelectedRowPosTop(row) {
    const strip = document.getElementById('selectedPosTopStrip');
    const meta = document.getElementById('selectedPosTopMeta');
    if (!strip || !meta) return;
    strip.innerHTML = '';
    if (!meta) return;
    meta.textContent = '';
    if (!row) {
        const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = '';
        strip.appendChild(empty); return;
    }
    const posItems = getPosSchemasForRow(row);
    if (!posItems.length || !posItems[0].candidates.length) {
        const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = '';
        strip.appendChild(empty); return;
    }
    const { candidates } = posItems[0];
    const link = document.createElement('a');
    link.className = 'schema-thumb pos-top-thumb'; link.href = candidates[0]; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.title = 'Abrir imagen';
    const img = document.createElement('img');
    img.alt = 'Pos circulos'; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => {
        const currentIndex = Number(img.dataset.schemaCandidateIndex || '0');
        missingSchemaImagePaths.add(candidates[currentIndex]);
        const ci = currentIndex + 1;
        if (ci >= candidates.length) {
            link.remove();
            if (!strip.querySelector('.schema-thumb') && !strip.querySelector('.schemas-images-empty')) {
                const empty = document.createElement('span'); empty.className = 'schemas-images-empty'; empty.textContent = '';
                strip.appendChild(empty);
            }
            return;
        }
        link.href = candidates[ci]; setSchemaImageSource(img, candidates, ci);
    });
    link.appendChild(img); strip.appendChild(link); setSchemaImageSource(img, candidates, 0);
}
