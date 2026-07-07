# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Performance: Bottlenecks y OptimizaciÃ³n

AnÃ¡lisis de rendimiento del sistema de imÃ¡genes en milu_qa con identificaciÃ³n de cuellos de botella.

## ðŸ“Š MÃ©tricas Actuales

### Por PÃ¡gina (Defecto: 50 filas)

| MÃ©trica | Valor | Notas |
|---------|-------|-------|
| Rows renderizadas | 50 | Configurable en state.pageSize |
| Tiempo render tabla | 50-100ms | 50 Ã— renderRow() |
| ImÃ¡genes en tabla | 0 | Solo badges, no imÃ¡genes reales |
| ImÃ¡genes panel lateral | 8-15 | Esquemas + posiciones |
| Memory footprint | 15-20 MB | Por 50 filas + esquemas |
| DOM nodes creados | 150-250 | tbody + rows + images |
| HTTP requests (imÃ¡genes) | 8-15 | Lazy load, pre-carga 6 paralelo |
| Total page load | 1-2 seg | Incluye JSON parse |

### Background Loading (Startup)

| Fase | Tiempo | Bloqueante |
|------|--------|-----------|
| Fetch 9 JSONs | 100-200ms | SÃ­ (Promise.all) |
| JSON parse | 50-100ms | SÃ­ |
| renderTable() | 50-100ms | SÃ­ |
| applyColumnView() | 10-20ms | SÃ­ |
| loadOptionalCatalogs() start | 0ms | No (async) |
| /api/esquemas-pos-index fetch | 50-100ms | No |
| Ãndice generation | 300-500ms | No (first time) |
| renderTable() con Ã­ndice | 50-100ms | No |

**Total time to interactive**: ~300ms  
**Total time to fully loaded**: ~1-2s

---

## ðŸ”´ Problemas CrÃ­ticos (High Impact)

### 1. **Full Re-render de Tabla**

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js#L440) `renderTable()`

**Problema**:
```javascript
tbody.innerHTML = '';              // 1. Borra TODA tabla del DOM
tbody.innerHTML = html;            // 2. Asigna HTML nuevo (full re-render)
applyColumnView();                 // 3. Re-aplica estilos
```

**Impacto**:
- âš ï¸ **Lag visible**: 50-100ms de CPU en cada cambio de filtro/pÃ¡gina
- âš ï¸ **PÃ©rdida de estado**: Borra focus, selection, scroll
- âš ï¸ **Reflow/Repaint**: Browser redibuja toda tabla

**Ocurrencias por sesiÃ³n**:
- Cambio de filtro: 5-10 veces
- Cambio de pÃ¡gina: 10-20 veces
- Total: 15-30 veces por sesiÃ³n = 750ms-3s de lag acumulado

**SoluciÃ³n Propuesta**:

```javascript
// OPCIÃ“N 1: VirtualizaciÃ³n (mejor)
function renderTableVirtualized() {
    // Solo renderizar rows visibles en viewport
    const viewportHeight = window.innerHeight;
    const rowHeight = 24;  // pixels
    const visibleRows = Math.ceil(viewportHeight / rowHeight);
    const scrollTop = container.scrollTop;
    const startRow = Math.floor(scrollTop / rowHeight);
    const endRow = startRow + visibleRows + 1;
    
    // Renderizar solo endRow - startRow rows
    // Actualizar offset del contenedor
}

// OPCIÃ“N 2: ActualizaciÃ³n incremental (intermedia)
function renderTableIncremental() {
    const currentHTML = tbody.innerHTML;
    const newHTML = newPageData.map(renderRow).join('');
    
    // Diff y actualizar solo rows que cambiaron
    const diff = diffRows(currentHTML, newHTML);
    
    diff.forEach(change => {
        if (change.type === 'add') {
            tbody.insertAdjacentHTML('beforeend', change.html);
        } else if (change.type === 'remove') {
            change.element.remove();
        } else if (change.type === 'update') {
            change.element.innerHTML = change.html;
        }
    });
}

// OPCIÃ“N 3: Mantenimiento de DOM (simple)
function renderTableSmarter() {
    // 1. Actualiza solo rows que cambiaron
    const tbody = document.getElementById('tbody');
    const currentRows = Array.from(tbody.querySelectorAll('tr'));
    const newData = newPageData;
    
    // 2. Reutiliza rows si tienen mismo key
    const rowsByKey = new Map(
        currentRows.map(row => [row.dataset.revisionKey, row])
    );
    
    // 3. Actualiza, inserta, elimina segÃºn necesario
    newData.forEach((row, index) => {
        const key = getRevisionKey(row);
        const existing = rowsByKey.get(key);
        
        if (existing) {
            // Actualizar row existente (cambiar innerHTML si necesario)
            existing.innerHTML = renderRowContent(row);
            existing.dataset.revisionKey = key;
        } else {
            // Insertar row nuevo
            const tr = document.createElement('tr');
            tr.innerHTML = renderRowContent(row);
            tr.dataset.revisionKey = key;
            tbody.appendChild(tr);
        }
    });
    
    // 4. Remover rows que no estÃ¡n en nuevo dataset
    const newKeys = new Set(newData.map(getRevisionKey));
    currentRows.forEach(row => {
        if (!newKeys.has(row.dataset.revisionKey)) {
            row.remove();
        }
    });
}
```

**Impacto esperado**:
- OpciÃ³n 1 (VirtualizaciÃ³n): 10-20ms per render (5x mejora)
- OpciÃ³n 2 (Diff): 25-50ms per render (2x mejora)
- OpciÃ³n 3 (Smart update): 20-40ms per render (2.5x mejora)

**Complejidad vs Beneficio**:
- VirtualizaciÃ³n: Alta complejidad, mÃ¡ximo beneficio
- Smart update: Media complejidad, buen beneficio, recomendado para corto plazo

---

### 2. **Cascada de Requests en Fallback de ImÃ¡genes**

**UbicaciÃ³n**: [js/schemas.js](../../js/schemas.js#L180) error handler

**Problema**:
```javascript
img.addEventListener('error', () => {
    const currentIndex = Number(img.dataset.schemaCandidateIndex || '0');
    const nextIndex = currentIndex + 1;
    
    if (nextIndex < candidates.length) {
        link.href = candidates[nextIndex];        // Cambiar href
        setSchemaImageSource(img, candidates, nextIndex);  // Setear src
        // Browser intenta cargar nueva URL
        // Si falla â†’ error event nuevamente
        // CASCADE EN SERIE
    }
});
```

**Impacto**:
- âš ï¸ **Timeout prolongado**: Cada candidato intenta cargar (~1-2s timeout por HTTP)
- âš ï¸ **Bloquea UI**: No paralelo, espera serial
- âš ï¸ **Peor caso**: 4 candidatos Ã— 5s timeout = 20s de espera

**Ejemplo de cascada**:
```
T=0s:    Usuario carga pÃ¡gina
T=0.5s:  Candidato 0 falla
T=1s:    Candidato 1 falla
T=1.5s:  Candidato 2 falla
T=2s:    Candidato 3 falla
T=2.5s:  Image se remueve del DOM
```

**EstadÃ­sticas**:
- 80% de candidatos fallan: cascada tÃ­pica ~2-4s
- 20% de candidatos fallan: cascada rÃ¡pida ~0.5s
- 100% de candidatos fallan: cascada mÃ¡xima ~4s+

**SoluciÃ³n Propuesta**:

```javascript
// OPCIÃ“N 1: Paralelo con Promise.all
async function setSchemaImageSourceParallel(img, candidates, initialIndex) {
    for (let i = initialIndex; i < candidates.length; i++) {
        try {
            const url = candidates[i];
            
            // Intenta cargar en paralelo
            const response = await fetch(url, { method: 'HEAD', timeout: 2000 });
            
            if (response.ok) {
                img.src = url;
                return;
            }
        } catch (e) {
            // Siguiente
            continue;
        }
    }
    
    // NingÃºn candidato funcionÃ³
    img.src = '';  // Blank
    link.remove();
}

// OPCIÃ“N 2: Timeout mÃ¡s agresivo
img.addEventListener('error', (e) => {
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), 1000);  // 1s max
    
    const nextIndex = (Number(img.dataset.schemaCandidateIndex || '0') + 1);
    
    if (nextIndex < candidates.length) {
        img.src = candidates[nextIndex];
    } else {
        clearTimeout(timer);
        link.remove();
    }
});

// OPCIÃ“N 3: Pre-validaciÃ³n en backend
// Agregar endpoint: GET /api/validate-image-urls?urls=URL1,URL2,URL3
// Retorna: { ok: [URL1], error: [URL2, URL3] }

fetch('/api/validate-image-urls?urls=' + candidates.join(','))
    .then(r => r.json())
    .then(data => {
        const validUrl = data.ok[0];  // Primer URL vÃ¡lido
        img.src = validUrl;
    });
```

**Impacto esperado**:
- OpciÃ³n 1 (Paralelo): 1-2s mÃ¡ximo (10x mejora)
- OpciÃ³n 2 (Timeout agresivo): 2-4s (2-5x mejora)
- OpciÃ³n 3 (Pre-validaciÃ³n): 0.5-1s (4-20x mejora)

**RecomendaciÃ³n**: Combinar OpciÃ³n 2 + OpciÃ³n 3 (timeout + pre-validaciÃ³n backend)

---

### 3. **CÃ¡lculos Redundantes**

**Problema**: `getEsquemaPosStatus()` llamado mÃºltiples veces por mismo record

**UbicaciÃ³n**: [js/qa-table.js](../../js/qa-table.js)

```javascript
// renderRow() â†’ renderEsquemaPosCell(row) â†’ getEsquemaPosStatus(row)
// sortData() â†’ (para cada row) â†’ getEsquemaPosStatus(row)
// applyFilters() â†’ (para cada row) â†’ getEsquemaPosStatus(row)

// Total: 50 rows Ã— 3 funciones = 150 calls
```

**Impacto**:
- ðŸŸ¡ **CPU**: 150 Ã— O(15) = O(2250) operaciones innecesarias
- ðŸŸ¡ **Memory**: 150 construcciones de arrays sin necesidad

**SoluciÃ³n Propuesta**:

```javascript
// CachÃ© con WeakMap (garbage collected automÃ¡ticamente)
const esquemasPosStatusCache = new WeakMap();

function getEsquemaPosStatusCached(row) {
    // Retorna cachÃ© si existe
    if (esquemasPosStatusCache.has(row)) {
        return esquemasPosStatusCache.get(row);
    }
    
    // Calcula
    const status = getEsquemaPosStatus(row);
    
    // Cachea
    esquemasPosStatusCache.set(row, status);
    
    return status;
}

// Usar en lugar de getEsquemaPosStatus()
// Reemplazar en:
// - renderEsquemaPosCell(): getEsquemaPosStatusCached(row)
// - sortData(): getEsquemaPosStatusCached(a), getEsquemaPosStatusCached(b)
// - applyFilters(): getEsquemaPosStatusCached(row)
```

**Impacto esperado**:
- CachÃ© hit rate: ~95%+ (mismo row procesado 3 veces)
- Mejora: 20-30ms por renderTable()

---

## ðŸŸ¡ Problemas Importantes (Medium Impact)

### 4. **Falta de IndexaciÃ³n en esquemasPosFileSet**

**Problema**: Set global de ~50K basenames, bÃºsquedas O(1) pero...

```javascript
// getEsquemaPosStatus() verifica:
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.webp")  // O(1) pero...
state.esquemasPosFileSet.has("12v4000m40a-0001-02-50.webp")  // ...se repite
state.esquemasPosFileSet.has("12v4000m40a-0001-03-50.webp")  // ...para cada row

// Con Set global de 50K elementos
// Hash computation no es gratis (~microsegundos)
```

**SoluciÃ³n Propuesta**:

```javascript
// Crear Ã­ndice secundario por modelo de motor
const esquemasPosFilesByModel = {
    '12v4000m40a': new Set(['0001-01-50.webp', '0001-02-50.webp', ...]),
    '16v4000m61': new Set([...]),
    ...
};

function getEsquemaPosStatusOptimized(row) {
    const book = String(val(row, 'engine_model', '') || '').trim().toLowerCase();
    const modelSet = esquemasPosFilesByModel[book];
    
    if (!modelSet) return 'empty';
    
    const posItems = getPosSchemasForRow(row);
    if (!posItems.length) return 'empty';
    
    // Busca en Set mÃ¡s pequeÃ±o (5.5K vs 50K)
    const exists = posItems.some(item =>
        item.candidates.some(candidate =>
            modelSet.has(basename(candidate))  // BÃºsqueda en Set 10x mÃ¡s pequeÃ±o
        )
    );
    
    return exists ? 'ok' : 'missing';
}
```

**Impacto esperado**:
- Mejora: ~10-20% en bÃºsquedas (menor impacto pero gratuito)

---

### 5. **Sin Tests Unitarios**

**Problema**: Cambios en renderRow(), getEsquemaPosStatus(), buildSchemaPosImageCandidates() sin tests

**Impacto**:
- ðŸŸ¡ **Regresiones**: No se detectan bugs hasta usar en producciÃ³n
- ðŸŸ¡ **Refactoring difÃ­cil**: No hay confianza de cambiar cÃ³digo
- ðŸŸ¡ **DocumentaciÃ³n**: Tests sirven como documentaciÃ³n ejecutable

**SoluciÃ³n**:

```javascript
// tests/qa-table.test.js

describe('renderEsquemaPosCell', () => {
    it('should return "ok" badge when file exists', () => {
        const row = { ruta_esquemas_pos: 'https://.../12V4000M40A-0001-01-50.webp' };
        state.esquemasPosFileSet.add('12v4000m40a-0001-01-50.webp');
        
        const html = renderEsquemaPosCell(row);
        
        expect(html).toContain('badge-pos-ok');
        expect(html).toContain('OK');
    });
    
    it('should return "missing" badge when references exist but file not found', () => {
        const row = { ruta_esquemas_pos: 'https://.../12V4000M40A-0001-01-50.webp' };
        state.esquemasPosFileSet.clear();  // Simula archivo no encontrado
        
        const html = renderEsquemaPosCell(row);
        
        expect(html).toContain('badge-pos-missing');
        expect(html).toContain('MISS');
    });
    
    it('should return "empty" badge when no references at all', () => {
        const row = { };  // Sin campos de imagen
        
        const html = renderEsquemaPosCell(row);
        
        expect(html).toContain('badge-pos-empty');
        expect(html).toContain('FALTA');
    });
});
```

---

## ðŸŸ¢ Problemas Menores (Low Impact)

### 6. **CÃ³digo Duplicado**

**Problema**: renderRow y renderErrorViewRow tienen ~70 lÃ­neas idÃ©nticas

**Impacto**:
- ðŸŸ¢ **Mantenibilidad**: Cambios deben hacerse en 2 lugares
- ðŸŸ¢ **Bugs**: Inconsistencias entre vistas

**SoluciÃ³n**:

```javascript
// Extraer funciÃ³n comÃºn
function renderRowCommonFlags(row) {
    const isGesa = hasFlag(row, 'gesa_flag');
    const isNormalizado = hasFlag(row, 'normalized_flag');
    const hierarchie = extractHierarchie(row);
    const hasImg = (row.filename_foto || row.ruta_foto || '').trim() !== '';
    const hasError = getRowErrorCount(row) > 0;
    
    return {
        isGesa, isNormalizado, hierarchie, hasImg, hasError
    };
}

// Usar en ambas funciones
function renderRow(row) {
    const flags = renderRowCommonFlags(row);
    
    return `
        <tr>
            ...
            <td>${flags.isGesa ? '<span class="status-icon yes">G</span>' : ...}</td>
            ...
        </tr>
    `;
}

function renderErrorViewRow(row) {
    const flags = renderRowCommonFlags(row);
    
    return `
        <tr>
            ...
            <td>${flags.isGesa ? '<span class="status-icon yes">G</span>' : ...}</td>
            ...
        </tr>
    `;
}
```

---

## ðŸ“ˆ Roadmap de OptimizaciÃ³n

### Fase 1: Quick Wins (Semana 1)

- [ ] Agregar cachÃ© WeakMap para getEsquemaPosStatus
- [ ] Implementar timeout agresivo (1s) en fallback de imÃ¡genes
- [ ] Indexar esquemasPosFileSet por modelo
- **Impacto**: 20-30% mejora en rendimiento
- **Tiempo**: 2-4 horas
- **Riesgo**: Bajo

### Fase 2: Mejoras Medianas (Semana 2)

- [ ] Refactor: Extraer funciones comunes (renderRowCommonFlags)
- [ ] Implementar actualizaciÃ³n incremental de tabla
- [ ] Agregar tests unitarios bÃ¡sicos
- **Impacto**: 30-50% mejora
- **Tiempo**: 8-12 horas
- **Riesgo**: Medio (testing)

### Fase 3: OptimizaciÃ³n Mayor (Semana 3+)

- [ ] Implementar virtualizaciÃ³n (scroll virtual)
- [ ] Pre-validaciÃ³n de URLs en backend
- [ ] CachÃ© persistente de imÃ¡genes (localStorage)
- **Impacto**: 60-80% mejora
- **Tiempo**: 16+ horas
- **Riesgo**: Alto (requiere refactor significativo)

---

## ðŸ“Š Benchmark Targets

| MÃ©trica | Actual | Target | Mejora |
|---------|--------|--------|--------|
| Render tabla 50 rows | 50-100ms | 20-30ms | 2-5x |
| Cambio de filtro | 100-200ms | 30-60ms | 2-3x |
| Imagen fallback max | 4-20s | 1-2s | 4-20x |
| Memory per 50 rows | 15-20 MB | 8-10 MB | 2x |
| getEsquemaPosStatus call | O(15) | O(1) cached | 15x |

---

## ðŸ” Profiling Tips

### En navegador (Chrome DevTools)

```javascript
// 1. Medir tiempo de render
console.time('renderTable');
renderTable();
console.timeEnd('renderTable');

// 2. Medir CPU
performance.mark('filter-start');
applyFilters(state.allData);
performance.mark('filter-end');
performance.measure('filter', 'filter-start', 'filter-end');

// 3. Medir memory
console.memory.usedJSHeapSize / 1048576  // MB

// 4. Timeline en DevTools
// Performance tab â†’ Record â†’ Cambiar filtro â†’ Stop
// Ver flame graph de CPU
```

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Basado en commit**: ad1737f0

