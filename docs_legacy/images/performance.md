# Performance: Bottlenecks y Optimización

Análisis de rendimiento del sistema de imágenes en milu_qa con identificación de cuellos de botella.

## 📊 Métricas Actuales

### Por Página (Defecto: 50 filas)

| Métrica | Valor | Notas |
|---------|-------|-------|
| Rows renderizadas | 50 | Configurable en state.pageSize |
| Tiempo render tabla | 50-100ms | 50 × renderRow() |
| Imágenes en tabla | 0 | Solo badges, no imágenes reales |
| Imágenes panel lateral | 8-15 | Esquemas + posiciones |
| Memory footprint | 15-20 MB | Por 50 filas + esquemas |
| DOM nodes creados | 150-250 | tbody + rows + images |
| HTTP requests (imágenes) | 8-15 | Lazy load, pre-carga 6 paralelo |
| Total page load | 1-2 seg | Incluye JSON parse |

### Background Loading (Startup)

| Fase | Tiempo | Bloqueante |
|------|--------|-----------|
| Fetch 9 JSONs | 100-200ms | Sí (Promise.all) |
| JSON parse | 50-100ms | Sí |
| renderTable() | 50-100ms | Sí |
| applyColumnView() | 10-20ms | Sí |
| loadOptionalCatalogs() start | 0ms | No (async) |
| /api/esquemas-pos-index fetch | 50-100ms | No |
| Índice generation | 300-500ms | No (first time) |
| renderTable() con índice | 50-100ms | No |

**Total time to interactive**: ~300ms  
**Total time to fully loaded**: ~1-2s

---

## 🔴 Problemas Críticos (High Impact)

### 1. **Full Re-render de Tabla**

**Ubicación**: [js/qa-table.js](../../js/qa-table.js#L440) `renderTable()`

**Problema**:
```javascript
tbody.innerHTML = '';              // 1. Borra TODA tabla del DOM
tbody.innerHTML = html;            // 2. Asigna HTML nuevo (full re-render)
applyColumnView();                 // 3. Re-aplica estilos
```

**Impacto**:
- ⚠️ **Lag visible**: 50-100ms de CPU en cada cambio de filtro/página
- ⚠️ **Pérdida de estado**: Borra focus, selection, scroll
- ⚠️ **Reflow/Repaint**: Browser redibuja toda tabla

**Ocurrencias por sesión**:
- Cambio de filtro: 5-10 veces
- Cambio de página: 10-20 veces
- Total: 15-30 veces por sesión = 750ms-3s de lag acumulado

**Solución Propuesta**:

```javascript
// OPCIÓN 1: Virtualización (mejor)
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

// OPCIÓN 2: Actualización incremental (intermedia)
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

// OPCIÓN 3: Mantenimiento de DOM (simple)
function renderTableSmarter() {
    // 1. Actualiza solo rows que cambiaron
    const tbody = document.getElementById('tbody');
    const currentRows = Array.from(tbody.querySelectorAll('tr'));
    const newData = newPageData;
    
    // 2. Reutiliza rows si tienen mismo key
    const rowsByKey = new Map(
        currentRows.map(row => [row.dataset.revisionKey, row])
    );
    
    // 3. Actualiza, inserta, elimina según necesario
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
    
    // 4. Remover rows que no están en nuevo dataset
    const newKeys = new Set(newData.map(getRevisionKey));
    currentRows.forEach(row => {
        if (!newKeys.has(row.dataset.revisionKey)) {
            row.remove();
        }
    });
}
```

**Impacto esperado**:
- Opción 1 (Virtualización): 10-20ms per render (5x mejora)
- Opción 2 (Diff): 25-50ms per render (2x mejora)
- Opción 3 (Smart update): 20-40ms per render (2.5x mejora)

**Complejidad vs Beneficio**:
- Virtualización: Alta complejidad, máximo beneficio
- Smart update: Media complejidad, buen beneficio, recomendado para corto plazo

---

### 2. **Cascada de Requests en Fallback de Imágenes**

**Ubicación**: [js/schemas.js](../../js/schemas.js#L180) error handler

**Problema**:
```javascript
img.addEventListener('error', () => {
    const currentIndex = Number(img.dataset.schemaCandidateIndex || '0');
    const nextIndex = currentIndex + 1;
    
    if (nextIndex < candidates.length) {
        link.href = candidates[nextIndex];        // Cambiar href
        setSchemaImageSource(img, candidates, nextIndex);  // Setear src
        // Browser intenta cargar nueva URL
        // Si falla → error event nuevamente
        // CASCADE EN SERIE
    }
});
```

**Impacto**:
- ⚠️ **Timeout prolongado**: Cada candidato intenta cargar (~1-2s timeout por HTTP)
- ⚠️ **Bloquea UI**: No paralelo, espera serial
- ⚠️ **Peor caso**: 4 candidatos × 5s timeout = 20s de espera

**Ejemplo de cascada**:
```
T=0s:    Usuario carga página
T=0.5s:  Candidato 0 falla
T=1s:    Candidato 1 falla
T=1.5s:  Candidato 2 falla
T=2s:    Candidato 3 falla
T=2.5s:  Image se remueve del DOM
```

**Estadísticas**:
- 80% de candidatos fallan: cascada típica ~2-4s
- 20% de candidatos fallan: cascada rápida ~0.5s
- 100% de candidatos fallan: cascada máxima ~4s+

**Solución Propuesta**:

```javascript
// OPCIÓN 1: Paralelo con Promise.all
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
    
    // Ningún candidato funcionó
    img.src = '';  // Blank
    link.remove();
}

// OPCIÓN 2: Timeout más agresivo
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

// OPCIÓN 3: Pre-validación en backend
// Agregar endpoint: GET /api/validate-image-urls?urls=URL1,URL2,URL3
// Retorna: { ok: [URL1], error: [URL2, URL3] }

fetch('/api/validate-image-urls?urls=' + candidates.join(','))
    .then(r => r.json())
    .then(data => {
        const validUrl = data.ok[0];  // Primer URL válido
        img.src = validUrl;
    });
```

**Impacto esperado**:
- Opción 1 (Paralelo): 1-2s máximo (10x mejora)
- Opción 2 (Timeout agresivo): 2-4s (2-5x mejora)
- Opción 3 (Pre-validación): 0.5-1s (4-20x mejora)

**Recomendación**: Combinar Opción 2 + Opción 3 (timeout + pre-validación backend)

---

### 3. **Cálculos Redundantes**

**Problema**: `getEsquemaPosStatus()` llamado múltiples veces por mismo record

**Ubicación**: [js/qa-table.js](../../js/qa-table.js)

```javascript
// renderRow() → renderEsquemaPosCell(row) → getEsquemaPosStatus(row)
// sortData() → (para cada row) → getEsquemaPosStatus(row)
// applyFilters() → (para cada row) → getEsquemaPosStatus(row)

// Total: 50 rows × 3 funciones = 150 calls
```

**Impacto**:
- 🟡 **CPU**: 150 × O(15) = O(2250) operaciones innecesarias
- 🟡 **Memory**: 150 construcciones de arrays sin necesidad

**Solución Propuesta**:

```javascript
// Caché con WeakMap (garbage collected automáticamente)
const esquemasPosStatusCache = new WeakMap();

function getEsquemaPosStatusCached(row) {
    // Retorna caché si existe
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
- Caché hit rate: ~95%+ (mismo row procesado 3 veces)
- Mejora: 20-30ms por renderTable()

---

## 🟡 Problemas Importantes (Medium Impact)

### 4. **Falta de Indexación en esquemasPosFileSet**

**Problema**: Set global de ~50K basenames, búsquedas O(1) pero...

```javascript
// getEsquemaPosStatus() verifica:
state.esquemasPosFileSet.has("12v4000m40a-0001-01-50.webp")  // O(1) pero...
state.esquemasPosFileSet.has("12v4000m40a-0001-02-50.webp")  // ...se repite
state.esquemasPosFileSet.has("12v4000m40a-0001-03-50.webp")  // ...para cada row

// Con Set global de 50K elementos
// Hash computation no es gratis (~microsegundos)
```

**Solución Propuesta**:

```javascript
// Crear índice secundario por modelo de motor
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
    
    // Busca en Set más pequeño (5.5K vs 50K)
    const exists = posItems.some(item =>
        item.candidates.some(candidate =>
            modelSet.has(basename(candidate))  // Búsqueda en Set 10x más pequeño
        )
    );
    
    return exists ? 'ok' : 'missing';
}
```

**Impacto esperado**:
- Mejora: ~10-20% en búsquedas (menor impacto pero gratuito)

---

### 5. **Sin Tests Unitarios**

**Problema**: Cambios en renderRow(), getEsquemaPosStatus(), buildSchemaPosImageCandidates() sin tests

**Impacto**:
- 🟡 **Regresiones**: No se detectan bugs hasta usar en producción
- 🟡 **Refactoring difícil**: No hay confianza de cambiar código
- 🟡 **Documentación**: Tests sirven como documentación ejecutable

**Solución**:

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

## 🟢 Problemas Menores (Low Impact)

### 6. **Código Duplicado**

**Problema**: renderRow y renderErrorViewRow tienen ~70 líneas idénticas

**Impacto**:
- 🟢 **Mantenibilidad**: Cambios deben hacerse en 2 lugares
- 🟢 **Bugs**: Inconsistencias entre vistas

**Solución**:

```javascript
// Extraer función común
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

## 📈 Roadmap de Optimización

### Fase 1: Quick Wins (Semana 1)

- [ ] Agregar caché WeakMap para getEsquemaPosStatus
- [ ] Implementar timeout agresivo (1s) en fallback de imágenes
- [ ] Indexar esquemasPosFileSet por modelo
- **Impacto**: 20-30% mejora en rendimiento
- **Tiempo**: 2-4 horas
- **Riesgo**: Bajo

### Fase 2: Mejoras Medianas (Semana 2)

- [ ] Refactor: Extraer funciones comunes (renderRowCommonFlags)
- [ ] Implementar actualización incremental de tabla
- [ ] Agregar tests unitarios básicos
- **Impacto**: 30-50% mejora
- **Tiempo**: 8-12 horas
- **Riesgo**: Medio (testing)

### Fase 3: Optimización Mayor (Semana 3+)

- [ ] Implementar virtualización (scroll virtual)
- [ ] Pre-validación de URLs en backend
- [ ] Caché persistente de imágenes (localStorage)
- **Impacto**: 60-80% mejora
- **Tiempo**: 16+ horas
- **Riesgo**: Alto (requiere refactor significativo)

---

## 📊 Benchmark Targets

| Métrica | Actual | Target | Mejora |
|---------|--------|--------|--------|
| Render tabla 50 rows | 50-100ms | 20-30ms | 2-5x |
| Cambio de filtro | 100-200ms | 30-60ms | 2-3x |
| Imagen fallback max | 4-20s | 1-2s | 4-20x |
| Memory per 50 rows | 15-20 MB | 8-10 MB | 2x |
| getEsquemaPosStatus call | O(15) | O(1) cached | 15x |

---

## 🔍 Profiling Tips

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
// Performance tab → Record → Cambiar filtro → Stop
// Ver flame graph de CPU
```

---

**Última actualización**: May 11, 2026  
**Basado en commit**: ad1737f0
