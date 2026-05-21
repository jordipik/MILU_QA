# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU QA: Renderizado de ImÃ¡genes y Esquemas

DocumentaciÃ³n tÃ©cnica de cÃ³mo `milu_qa.html` carga, renderiza y maneja imÃ¡genes y esquemas de posiciÃ³n.

## ðŸ—ï¸ Arquitectura General

```
qa_milu.html (HTML estructura)
    â”œâ”€ qa-milu.js (entry point, startup, background loading)
    â”‚  â”œâ”€ data-loader.js (cargar engine_*.json)
    â”‚  â””â”€ loadOptionalCatalogsInBackground() â†’ /api/esquemas-pos-index
    â”‚
    â”œâ”€ qa-table.js (renderizado tabla + filtros)
    â”‚  â”œâ”€ renderRow() [Ã—50 por pÃ¡gina]
    â”‚  â”œâ”€ renderErrorViewRow() [vista alternativa]
    â”‚  â”œâ”€ getEsquemaPosStatus() [validaciÃ³n OK/MISS/FALTA]
    â”‚  â””â”€ applyFilters(), sortData(), renderTable()
    â”‚
    â”œâ”€ schemas.js (resoluciÃ³n de imÃ¡genes)
    â”‚  â”œâ”€ getPosSchemasForRow() [construye candidatos]
    â”‚  â”œâ”€ buildSchemaPosImageCandidates() [busca archivos]
    â”‚  â”œâ”€ updateSchemasInline() [panel lateral 1]
    â”‚  â”œâ”€ renderSelectedRowPosPanel() [panel lateral 2]
    â”‚  â””â”€ setSchemaImageSource(), error handling
    â”‚
    â”œâ”€ state.js (estado global)
    â”‚  â”œâ”€ allData = [] [todos los registros]
    â”‚  â”œâ”€ filteredData = [] [despuÃ©s de filtros]
    â”‚  â””â”€ esquemasPosFileSet = Set() [Ã­ndice local]
    â”‚
    â””â”€ pos-preload.js (preload en background)
       â””â”€ scheduleVisiblePosCirclePreload() [6 paralelo]
```

---

## ðŸ“Š Flujo de Carga de Datos

### 1. Startup (qa_milu.js)

```javascript
// Secuencia temporal:
T=0ms:    PÃ¡gina carga, ejecuta qa_milu.js
T=0-100ms: loadPartitionedEngineData()
          â””â”€ Promise.all([fetch 9 JSONs])
          
T=100-150ms: JSON parsing, normalizaciÃ³n
            â””â”€ state.allData = [...67K items]
            
T=150ms:   renderTable()  // Tabla inicial (sin ESQ_POS info)
           
T=150-200ms: applyColumnView()  // Ajusta anchos

T=200ms:   loadOptionalCatalogsInBackground() inicia (async)
           â””â”€ fetch /api/esquemas-pos-index
           
T=200-300ms: Backend escanea esquemas_pos_circulos/
            â””â”€ Ãndice ~50K archivos
            
T=300ms:   state.esquemasPosFileSet = new Set([...basenames])

T=300-350ms: renderTable()  // Re-render con ESQ_POS actualizado
             â””â”€ Badges OK/MISS/FALTA correctos ahora
```

**Nota**: Usuario ve tabla a T=150ms pero sin ESQ_POS. Se actualiza automÃ¡tico a T=300ms.

---

## ðŸŽ¯ Renderizado de Tabla

### FunciÃ³n renderTable()

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js) lÃ­nea ~440

```javascript
function renderTable() {
    // 1. APLICAR FILTROS
    const filtered = applyFilters(state.allData);
    state.filteredData = filtered;
    
    // 2. SORT
    const sorted = sortData(filtered, state.sortKey, state.sortAsc);
    
    // 3. PAGINACIÃ“N
    const pageSize = state.pageSize;
    const start = (state.currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageData = sorted.slice(start, end);
    
    // 4. RENDERIZAR FILAS
    const tbody = document.getElementById('tbody');
    tbody.innerHTML = '';
    
    if (pageData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="30">Sin registros</td></tr>';
        return;
    }
    
    // Construir HTML de todas las filas
    const html = pageData
        .map(row => renderRow(row))
        .join('');
    
    tbody.innerHTML = html;  // FULL RE-RENDER
    
    // 5. RE-APLICAR ESTILOS
    applyColumnView();
    
    // 6. PRE-CARGAR IMÃGENES (background)
    scheduleVisiblePosCirclePreload(pageData);
}
```

**Problema ðŸ”´**: LÃ­nea 4 hace `tbody.innerHTML = ''` y luego asigna nuevo HTML. Esto causa:
- Full repaint del DOM
- Loss de estados (focus, selection, scroll)
- Lag visible en cambios rÃ¡pidos

### FunciÃ³n renderRow(row)

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js) lÃ­nea ~797

Renderiza **UNA fila** con ~30 columnas:

```javascript
function renderRow(row) {
    // Extrae flags
    const isGesa = hasFlag(row, 'gesa_flag');
    const isNormalizado = hasFlag(row, 'normalized_flag');
    const hasImg = (row.filename_foto || row.ruta_foto || '').trim() !== '';
    const hierarchie = extractHierarchie(row);
    const hasError = getRowErrorCount(row) > 0;
    
    // Genera HTML string
    return `
        <tr data-revision-key="${getRevisionKey(row)}" class="${state.selectedRevisionRowKey === getRevisionKey(row) ? 'row-selected' : ''}">
            <td>${escapeHtml(row.ID)}</td>
            <td class="icon-cell">${isGesa ? '<span class="status-icon yes">G</span>' : '<span class="status-icon no">-</span>'}</td>
            <td class="icon-cell">${isNormalizado ? '<span class="status-icon yes">N</span>' : '<span class="status-icon no">-</span>'}</td>
            <td class="icon-cell">${hierarchie ? '<span class="status-icon">' + hierarchie + '</span>' : '<span class="status-icon no">-</span>'}</td>
            <td class="icon-cell">${renderEsquemaPosCell(row)}</td>
            <td class="icon-cell">${hasImg ? '<span class="status-icon yes">F</span>' : '<span class="status-icon no">-</span>'}</td>
            <td class="icon-cell">${hasError ? '<span class="status-icon error">' + getRowErrorCount(row) + '</span>' : '<span class="status-icon no">-</span>'}</td>
            ... 23+ columnas mÃ¡s ...
        </tr>
    `;
}
```

**Importante**: `renderRow()` **NO renderiza imÃ¡genes reales**. Solo badges indicadores (F, G, N, etc.)

Las imÃ¡genes reales van en panels laterales (updateSchemasInline, renderSelectedRowPosPanel).

### FunciÃ³n renderEsquemaPosCell(row)

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js) lÃ­nea ~786

```javascript
function renderEsquemaPosCell(row) {
    const status = getEsquemaPosStatus(row);
    
    const badges = {
        'ok': '<span class="badge-pos-ok" title="Archivo encontrado">OK</span>',
        'missing': '<span class="badge-pos-missing" title="Archivo no encontrado">MISS</span>',
        'empty': '<span class="badge-pos-empty" title="Sin esquema_pos">FALTA</span>'
    };
    
    return badges[status] || badges.empty;
}
```

**Complejidad**: O(1) por celda (bÃºsqueda en Set es O(1))

---

## ðŸ–¼ï¸ Panels Laterales (Esquemas)

### Panel 1: "Esquemas del Libro (PÃ¡gina Activa)"

**UbicaciÃ³n**: updateSchemasInline() en [js/schemas.js](../../js/schemas.js) lÃ­nea ~160

**Renderiza**:
- TÃ­tulos de esquemas generales para el libro actual
- Hasta 3 imÃ¡genes de esquemas con lazy loading

**Flujo**:

```javascript
export function updateSchemasInline(bookValue, pageValue) {
    // 1. Obtiene esquemas para este libro+pÃ¡gina
    const schemas = getSchemasForBookPage(bookValue, pageValue);
    
    // 2. Renderiza tÃ­tulos
    const inlineEl = document.getElementById('schemasInlineList');
    inlineEl.textContent = schemas.join(', ') || 'â€”';
    
    // 3. Renderiza imÃ¡genes (preview)
    updateSchemasImageInline(bookValue, schemas);
}

function updateSchemasImageInline(bookValue, schemas) {
    const strip = document.getElementById('schemasImagesStrip');
    strip.innerHTML = '';
    
    schemas.slice(0, 3).forEach(schemaToken => {
        // Construir link + img
        const candidates = buildSchemaImageCandidates(bookValue, schemaToken);
        
        const link = document.createElement('a');
        link.href = candidates[0];
        link.target = '_blank';
        link.className = 'schema-thumb large';
        
        const img = document.createElement('img');
        img.alt = schemaToken;
        img.loading = 'lazy';       // âœ… Lazy loading
        img.decoding = 'async';     // âœ… Async decoding
        
        // ERROR HANDLER
        img.addEventListener('error', () => {
            const idx = Number(img.dataset.schemaCandidateIndex || '0');
            const nextIdx = idx + 1;
            
            if (nextIdx < candidates.length) {
                link.href = candidates[nextIdx];
                setSchemaImageSource(img, candidates, nextIdx);
            } else {
                link.remove();  // No mÃ¡s candidatos
            }
        });
        
        link.appendChild(img);
        strip.appendChild(link);
        setSchemaImageSource(img, candidates, 0);  // Intenta primero
    });
}
```

**CaracterÃ­sticas**:
- âœ… Lazy loading habilitado
- âœ… Fallback en cascada (4 candidatos: 2 nombres Ã— 2 extensiones)
- âœ… DeduplicaciÃ³n (si mÃºltiples campos referencian mismo archivo)
- âš ï¸ MÃ¡ximo 3 imÃ¡genes (corta si hay mÃ¡s)

### Panel 2: "Esquema CÃ­rculos del ArtÃ­culo Seleccionado"

**UbicaciÃ³n**: renderSelectedRowPosPanel() en [js/schemas.js](../../js/schemas.js) lÃ­nea ~317

**Renderiza**:
- Metadatos de fila (PN, POS, Libro, PÃ¡gina)
- **TODAS** las imÃ¡genes de posiciÃ³n del artÃ­culo seleccionado
- GalerÃ­a con label de cada imagen

**Flujo**:

```javascript
export function renderSelectedRowPosPanel(row) {
    const strip = document.getElementById('selectedPosStrip');
    const meta = document.getElementById('selectedPosMeta');
    
    buildPosStrip(row, strip, meta, {
        emptyText: 'Sin selecciÃ³n',
        showMeta: true
    });
}

function buildPosStrip(row, stripEl, metaEl, opts) {
    stripEl.innerHTML = '';
    
    if (!row) {
        // Caso: no hay fila seleccionada
        const empty = document.createElement('span');
        empty.textContent = opts.emptyText;
        stripEl.appendChild(empty);
        return;
    }
    
    // 1. METADATOS
    const pn = val(row, 'PART NO.', 'â€”');
    const pos = val(row, 'POS', 'â€”');
    const book = val(row, 'engine_model', 'â€”');
    const page = val(row, 'Source Page', 'â€”');
    
    if (metaEl) {
        metaEl.textContent = `PN: ${pn} | POS: ${pos} | Libro: ${book} | PÃ¡gina: ${page}`;
    }
    
    // 2. IMÃGENES DE POSICIÃ“N
    const posItems = getPosSchemasForRow(row);  // Llama a schemas.js
    
    if (!posItems.length) {
        const empty = document.createElement('span');
        empty.textContent = 'Sin imÃ¡genes de posiciÃ³n';
        stripEl.appendChild(empty);
        return;
    }
    
    // 3. RENDERIZAR CADA IMAGEN
    posItems.forEach(item => {
        const { candidates, label } = item;
        
        const link = document.createElement('a');
        link.href = candidates[0];
        link.target = '_blank';
        link.className = 'schema-thumb';
        
        const img = document.createElement('img');
        img.alt = label;
        img.loading = 'lazy';
        img.decoding = 'async';
        
        // ERROR HANDLER (fallback)
        img.addEventListener('error', () => {
            const idx = Number(img.dataset.schemaCandidateIndex || '0');
            const nextIdx = idx + 1;
            
            if (nextIdx < candidates.length) {
                link.href = candidates[nextIdx];
                setSchemaImageSource(img, candidates, nextIdx);
            } else {
                link.remove();
            }
        });
        
        const caption = document.createElement('span');
        caption.textContent = label;
        
        link.appendChild(img);
        link.appendChild(caption);
        stripEl.appendChild(link);
        setSchemaImageSource(img, candidates, 0);
    });
    
    // 4. Si no hay imÃ¡genes despuÃ©s de todo
    if (!stripEl.querySelector('.schema-thumb')) {
        const empty = document.createElement('span');
        empty.textContent = 'Sin imÃ¡genes disponibles';
        stripEl.appendChild(empty);
    }
}
```

**CaracterÃ­sticas**:
- âœ… Metadatos completos (PN, POS, Libro, PÃ¡gina)
- âœ… **TODAS** las imÃ¡genes (no limitado a 3 como Panel 1)
- âœ… Labels para cada imagen
- âœ… Lazy loading + async decoding
- âœ… Fallback en cascada

---

## ðŸ” ResoluciÃ³n de Candidatos (schemas.js)

### FunciÃ³n getPosSchemasForRow(row)

**UbicaciÃ³n**: [js/schemas.js](../../js/schemas.js) lÃ­nea ~119

**PropÃ³sito**: Construir lista de **candidatos de imÃ¡genes** a partir de mÃºltiples campos

```javascript
export function getPosSchemasForRow(row) {
    const book = String(val(row, 'engine_model', '') || '').trim();
    const itemsByLabel = new Map();
    
    const mergeItem = (rawToken, preferredPath = '') => {
        const cleanToken = String(rawToken || '').trim();
        const fileName = extractFileNameFromPath(cleanToken) || cleanToken;
        const label = stripFileExtension(fileName);
        
        // Construye candidatos (4 variantes)
        const candidates = [
            ...buildSchemaPosImageCandidates(book, preferredPath || cleanToken),
            ...buildSchemaPosImageCandidates(book, cleanToken)
        ];
        
        // Deduplica por label
        if (!itemsByLabel.has(label)) {
            itemsByLabel.set(label, { label, candidates: [] });
        }
        
        const item = itemsByLabel.get(label);
        const existing = new Set(item.candidates);
        candidates.forEach(path => {
            if (!existing.has(path)) {
                existing.add(path);
                item.candidates.push(path);
            }
        });
    };
    
    // PROCESA 3 FUENTES
    splitSchemaTokens(row?.ruta_esquemas_pos).forEach(r => mergeItem(r, r));
    splitSchemaTokens(row?.exp_imagenes).forEach(e => mergeItem(e));      // â† NEW
    splitSchemaTokens(row?.esquemas_circulos).forEach(t => mergeItem(t));
    
    // Retorna ordenado
    return [...itemsByLabel.values()]
        .filter(item => item.candidates.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
```

**Salida tÃ­pica**:
```javascript
[
    {
        label: '12v4000m40a-0001-01-50',
        candidates: [
            'esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.webp',
            'esquemas_pos_circulos/12V4000M40A-POS/12V4000M40A-0001-01-50.png',
            'esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.webp',
            'esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-0001-01-50.png'
        ]
    },
    {
        label: '12v4000m40a-0001-02-50',
        candidates: [...]
    }
]
```

### FunciÃ³n buildSchemaPosImageCandidates(book, rawToken)

**UbicaciÃ³n**: [js/schemas.js](../../js/schemas.js) lÃ­nea ~41

**PropÃ³sito**: Construir 4 variantes de candidatos (2 nombres Ã— 2 extensiones)

```javascript
export function buildSchemaPosImageCandidates(book, rawToken) {
    if (!rawToken) return [];
    
    const book_lower = (book || '').toLowerCase();
    
    // 1. Extrae nombre y extensiÃ³n
    const tokenFromPath = extractFileNameFromPath(rawToken) || rawToken;
    const tokenNoExt = stripFileExtension(tokenFromPath);
    const tokenExt = tokenFromPath.match(/\.(png|webp|jpg|jpeg)$/i)?.[1].toLowerCase();
    
    // 2. Define nombres a intentar
    const names = [tokenNoExt];
    
    if (!tokenNoExt.startsWith(book_lower)) {
        names.push(`${book_lower}-${tokenNoExt}`);
    }
    
    // 3. Define extensiones
    const extensions = tokenExt ? [tokenExt] : ['webp', 'png', 'jpg', 'jpeg'];
    
    // 4. Construye candidatos (order importa)
    const candidates = [];
    
    names.forEach(name => {
        extensions.forEach(ext => {
            const encoded = encodeURIComponent(name);
            const path = `esquemas_pos_circulos/${book}-POS/${encoded}.${ext}`;
            candidates.push(path);
        });
    });
    
    return candidates;
}
```

**Ejemplo con input "pos-001"**:
```
book = "12V4000M40A"
rawToken = "pos-001"

â†’ tokenNoExt = "pos-001"
â†’ tokenExt = null (no extension en input)
â†’ names = ["pos-001", "12v4000m40a-pos-001"]
â†’ extensions = ["webp", "png", "jpg", "jpeg"]

â†’ candidates = [
    "esquemas_pos_circulos/12V4000M40A-POS/pos-001.webp",
    "esquemas_pos_circulos/12V4000M40A-POS/pos-001.png",
    "esquemas_pos_circulos/12V4000M40A-POS/pos-001.jpg",
    "esquemas_pos_circulos/12V4000M40A-POS/pos-001.jpeg",
    "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-pos-001.webp",
    "esquemas_pos_circulos/12V4000M40A-POS/12v4000m40a-pos-001.png",
    ... (8 variantes totales)
]
```

---

## ðŸŽ›ï¸ Filtros Relacionados con ImÃ¡genes

### Filtro has_img (Tiene Foto)

**UbicaciÃ³n**: [qa_milu.html](../../qa_milu.html) + [js/qa-table.js](../../js/qa-table.js) lÃ­nea ~392

**HTML**:
```html
<select data-filter="has_img">
    <option value="">â€” Todos â€”</option>
    <option value="true">Con Foto</option>
    <option value="false">Sin Foto</option>
</select>
```

**LÃ³gica**:
```javascript
case 'has_img': {
    const imgValue = (row.filename_foto || row.ruta_foto || '').toString().trim();
    rowValue = imgValue ? 'true' : 'false';
    break;
}
```

### Filtro has_esquema_pos (Estado Esquema POS)

**UbicaciÃ³n**: [qa_milu.html](../../qa_milu.html) + [js/qa-table.js](../../js/qa-table.js) lÃ­nea ~405

**HTML**:
```html
<select data-filter="has_esquema_pos">
    <option value="">â€” Todos â€”</option>
    <option value="ok">OK</option>
    <option value="missing">MISS</option>
    <option value="empty">FALTA</option>
</select>
```

**LÃ³gica**:
```javascript
case 'has_esquema_pos': {
    rowValue = getEsquemaPosStatus(row);  // 'ok' | 'missing' | 'empty'
    break;
}
```

---

## âš¡ Lazy Loading y Pre-carga

### Lazy Loading HTML

En todos los `<img>` elementos creados en schemas.js:

```javascript
const img = document.createElement('img');
img.loading = 'lazy';       // âœ… Native browser lazy loading
img.decoding = 'async';     // âœ… Async image decoding
```

**Efecto**: Browser no carga imagen hasta que entra en viewport (aprox. 500px antes)

### Pre-carga en Background

**Archivo**: [js/pos-preload.js](../../js/pos-preload.js)

```javascript
const POS_PRELOAD_CONCURRENCY = 6;  // Max 6 requests paralelo

export function scheduleVisiblePosCirclePreload(rows) {
    const payload = Array.isArray(rows) ? rows.slice() : [];
    
    const run = () => preloadVisiblePosCircleImages(payload);
    
    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 900 });  // Browser idle
    } else {
        setTimeout(run, 80);  // Fallback: 80ms delay
    }
}

function pumpPosCirclePreloadQueue() {
    while (posCirclePreloadActive < POS_PRELOAD_CONCURRENCY && posCirclePreloadQueue.length > 0) {
        const src = posCirclePreloadQueue.shift();
        
        posCirclePreloadActive += 1;
        const img = new Image();  // Crea Image object (no DOM)
        
        const finalize = () => {
            posCirclePreloadCache.add(src);
            posCirclePreloadActive--;
            pumpPosCirclePreloadQueue();  // Siguiente
        };
        
        img.onload = finalize;
        img.onerror = finalize;
        img.decoding = 'async';
        img.src = src;  // Dispara request
    }
}
```

**CaracterÃ­sticas**:
- âœ… MÃ¡ximo 6 requests simultÃ¡neos
- âœ… Se ejecuta cuando browser idle
- âœ… No bloquea interacciÃ³n usuario
- âœ… DeduplicaciÃ³n (cada URL solo una vez)

---

## ðŸ“ˆ MÃ©tricas de Rendimiento

| MÃ©trica | Valor | Notas |
|---------|-------|-------|
| Filas por pÃ¡gina | 50 | Default, ajustable |
| Tiempo renderRow | 0.5-1ms | HTML string building |
| Total render 50 rows | 50-100ms | + parsing |
| ImÃ¡genes en tabla | 0 | Solo badges, no imÃ¡genes reales |
| ImÃ¡genes panel lateral | 8-15 | Esquemas + posiciones |
| Pre-carga concurrencia | 6 | MÃ¡ximo requests paralelo |
| Lazy load threshold | ~500px | Antes de entrar en viewport |
| Memory footprint | 15-20 MB | Por 50 filas + esquemas |

---

## ðŸ”´ Problemas Identificados

### 1. **Re-render Completo de Tabla**
- Causa: `tbody.innerHTML = ''` + asignaciÃ³n completa
- Impacto: Lag visible en cambios rÃ¡pidos
- SoluciÃ³n: VirtualizaciÃ³n o actualizaciÃ³n incremental

### 2. **Cascada de Requests en Fallback**
- Problema: Si candidato falla, intenta siguiente (en serie)
- Impacto: Hasta 5s de timeout por imagen
- SoluciÃ³n: Timeout mÃ¡s agresivo o pre-validaciÃ³n

### 3. **getEsquemaPosStatus Llamado MÃºltiples Veces**
- Problema: Llamado en renderRow, sortData, applyFilters
- Impacto: 150+ bÃºsquedas innecesarias por render
- SoluciÃ³n: CachÃ© con WeakMap

### 4. **Sin Tests Unitarios**
- Problema: renderRow, getEsquemaPosStatus, buildSchemaPosImageCandidates sin tests
- Impacto: Regressions no detectadas
- SoluciÃ³n: Agregar test suite

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Basado en commit**: ad1737f0

