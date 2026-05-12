> **PROPUESTA — PENDIENTE DE VALIDAR**
>
> Mejoras pendientes para multimedia. No implementadas.
>
> Movido a `docs/proposals/` el 2026-05-12. **No representa el estado actual del código.**

---

# Mejoras Pendientes: Roadmap Técnico

Resumen de mejoras recomendadas, deuda técnica y plan de acción para evolucionar el sistema de imágenes.

---

## 🎯 Matriz de Mejoras

### Leyenda
- **P**: Prioridad (1=Crítica, 2=Alta, 3=Media, 4=Baja)
- **E**: Esfuerzo (1h, 2h, 4h, 8h, 16h, 32h+)
- **I**: Impacto (Bajo, Medio, Alto, Crítico)
- **D**: Deuda técnica acumulada (Sí/No)

---

## 🔴 Críticas (P=1)

### 1. Validación de URLs en Backend

**Descripción**: depuracion_json.py genera exp_imagenes sin verificar si URLs son accesibles

**Ubicación**: [depuracion_json.py](../../depuracion_json.py)

**Problema**: 
- Imágenes pueden estar rotas sin detectarse
- Descubrimiento solo cuando WordPress intenta descargar
- WordPress export falla silenciosamente

**Solución**:
```python
import requests

def validate_url_accessible(url, timeout=5):
    """Verifica si URL es accesible"""
    try:
        response = requests.head(url, timeout=timeout, allow_redirects=True)
        return response.status_code < 400
    except Exception as e:
        logging.debug(f"URL inaccesible: {url} ({e})")
        return False

# En calculate_exp_imagenes():
if ruta_foto and validate_url_accessible(ruta_foto):
    imagenes.append(ruta_foto)
else:
    logging.warning(f"Foto no accesible para PN {record.get('PART NO.')}: {ruta_foto}")
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 1 (Crítica) |
| **Esfuerzo** | 4h |
| **Impacto** | Crítico |
| **Deuda acumulada** | Sí |
| **Bloqueante** | Sí |
| **Sprint** | NEXT |

---

### 2. Deduplicación Completa en generate_synthetic_exports.js

**Descripción**: Síntesis pierde imágenes de registros duplicados en diferentes modelos

**Ubicación**: [generate_synthetic_exports.js](../../generate_synthetic_exports.js)

**Problema**:
```
PN 123456 en 3 modelos:
  - 12V4000M40A: exp_imagenes = "URL_FOTO_A, URL_ESQUEMA_A"
  - 16V4000M61: exp_imagenes = "URL_FOTO_A, URL_ESQUEMA_B"  ← ESQUEMA_B perdido
  - 20V4000M93: exp_imagenes = "URL_FOTO_A, URL_ESQUEMA_C"  ← ESQUEMA_C perdido

Síntesis solo guarda del representante:
  exp_imagenes = "URL_FOTO_A, URL_ESQUEMA_A"
```

**Solución**:
```javascript
// En generate_synthetic_exports.js, al procesar grupo:
const allImages = new Set();
const repImages = new Map();  // track qué vinieron del representante

group.forEach((record, idx) => {
    const images = (record.exp_imagenes || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => s && !isPlaceholder(s));
    
    images.forEach(img => {
        allImages.add(img);
        if (idx === 0) {  // Representante
            repImages.set(img, true);
        }
    });
});

// Coloca primero imágenes del representante
const prioritized = [
    ...Array.from(allImages).filter(img => repImages.has(img)),
    ...Array.from(allImages).filter(img => !repImages.has(img))
];

synthetic.exp_imagenes = prioritized.join(', ');
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 1 (Crítica) |
| **Esfuerzo** | 2h |
| **Impacto** | Alto |
| **Deuda acumulada** | Sí |
| **Sprint** | NEXT |

---

### 3. Placeholder URL Configurable

**Descripción**: sin_imagen.jpeg URL hardcoded en depuracion_json.py

**Ubicación**: [depuracion_json.py](../../depuracion_json.py#L34)

**Problema**:
```python
DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
```

Si dominio cambia → todos los JSONs deben regenerarse

**Solución**:

```python
# 1. Crear config.json
{
  "wordpress": {
    "base_url": "https://milu-naval.mystagingwebsite.com/wp-content/uploads",
    "placeholder_path": "/2026/01/sin_imagen.jpeg",
    "article_path_template": "/2026/01/{filename}",
    "schema_path_template": "/2026/02/{filename}"
  },
  "image_validation": {
    "check_accessibility": true,
    "timeout_seconds": 5
  }
}

# 2. En depuracion_json.py
import json

with open('config.json') as f:
    CONFIG = json.load(f)

PLACEHOLDER_URL = CONFIG['wordpress']['base_url'] + CONFIG['wordpress']['placeholder_path']

def calculate_exp_imagenes(record):
    ...
    if not imagenes:
        exp_imagenes = PLACEHOLDER_URL
    ...
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 1 (Crítica) |
| **Esfuerzo** | 1h |
| **Impacto** | Medio |
| **Deuda acumulada** | Sí |
| **Sprint** | CURRENT |

---

## 🟠 Altas (P=2)

### 4. Caché para getEsquemaPosStatus

**Descripción**: getEsquemaPosStatus llamado 3× por fila sin caché

**Ubicación**: [js/qa-table.js](../../js/qa-table.js#L771)

**Problema**: 50 rows × 3 calls = 150 cálculos redundantes

**Solución**:
```javascript
const esquemasPosStatusCache = new WeakMap();

function getEsquemaPosStatusCached(row) {
    if (esquemasPosStatusCache.has(row)) {
        return esquemasPosStatusCache.get(row);
    }
    
    const status = getEsquemaPosStatus(row);
    esquemasPosStatusCache.set(row, status);
    return status;
}
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 2 (Alta) |
| **Esfuerzo** | 1h |
| **Impacto** | Medio |
| **Deuda acumulada** | No |
| **Sprint** | NEXT |

---

### 5. Timeout Agresivo en Fallback de Imágenes

**Descripción**: Cascada de requests puede tardar 4-20s

**Ubicación**: [js/schemas.js](../../js/schemas.js#L180)

**Problema**: Cada candidato puede esperar 5s de HTTP timeout

**Solución**:
```javascript
// Reducir timeout a 1s
const img = new Image();
img.src = candidateUrl;

const timeoutId = setTimeout(() => {
    img.src = '';  // Cancela
    tryNextCandidate();
}, 1000);  // 1s máximo por candidato

img.onload = () => {
    clearTimeout(timeoutId);
    // Success
};

img.onerror = () => {
    clearTimeout(timeoutId);
    tryNextCandidate();
};
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 2 (Alta) |
| **Esfuerzo** | 2h |
| **Impacto** | Alto |
| **Deuda acumulada** | No |
| **Sprint** | NEXT |

---

### 6. Tests Unitarios para Imagen Logic

**Descripción**: renderEsquemaPosCell, getEsquemaPosStatus, buildSchemaPosImageCandidates sin tests

**Ubicación**: `tests/qa-table.test.js` (new file)

**Solución**:
```javascript
// tests/qa-table.test.js

describe('ESQ_POS Badge Logic', () => {
    beforeEach(() => {
        state.esquemasPosFileSet.clear();
    });
    
    it('renderEsquemaPosCell returns OK when file exists', () => {
        state.esquemasPosFileSet.add('12v4000m40a-0001-01-50.webp');
        const row = { ruta_esquemas_pos: 'https://.../12V4000M40A-0001-01-50.webp' };
        
        expect(renderEsquemaPosCell(row)).toContain('badge-pos-ok');
    });
    
    it('renderEsquemaPosCell returns MISS when references exist but file missing', () => {
        const row = { ruta_esquemas_pos: 'https://.../12V4000M40A-0001-01-50.webp' };
        
        expect(renderEsquemaPosCell(row)).toContain('badge-pos-missing');
    });
    
    it('renderEsquemaPosCell returns FALTA when no references', () => {
        const row = { };
        
        expect(renderEsquemaPosCell(row)).toContain('badge-pos-empty');
    });
});

describe('buildSchemaPosImageCandidates', () => {
    it('builds 4 candidates with 2 names and 2 extensions', () => {
        const candidates = buildSchemaPosImageCandidates('12V4000M40A', 'pos-001');
        
        expect(candidates.length).toBe(8);  // 2 names × 4 extensions
        expect(candidates[0]).toContain('pos-001.webp');
        expect(candidates[4]).toContain('12v4000m40a-pos-001.webp');
    });
});
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 2 (Alta) |
| **Esfuerzo** | 8h |
| **Impacto** | Medio |
| **Deuda acumulada** | Sí |
| **Sprint** | NEXT+1 |

---

### 7. Refactor: Función Común para Flags de Fila

**Descripción**: renderRow y renderErrorViewRow comparten 70 líneas de código

**Ubicación**: [js/qa-table.js](../../js/qa-table.js)

**Solución**:
```javascript
// Extraer función común
function extractRowFlags(row) {
    return {
        isGesa: hasFlag(row, 'gesa_flag'),
        isNormalizado: hasFlag(row, 'normalized_flag'),
        hierarchie: extractHierarchie(row),
        hasImg: (row.filename_foto || row.ruta_foto || '').trim() !== '',
        hasError: getRowErrorCount(row) > 0,
        errorCount: getRowErrorCount(row)
    };
}

// Usar en ambas funciones
function renderRow(row) {
    const f = extractRowFlags(row);
    return `<tr>...<td>${f.isGesa ? ... }</td>...</tr>`;
}
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 2 (Alta) |
| **Esfuerzo** | 2h |
| **Impacto** | Bajo (mantenibilidad) |
| **Deuda acumulada** | No |
| **Sprint** | NEXT+1 |

---

## 🟡 Medianas (P=3)

### 8. Actualización Incremental de Tabla

**Descripción**: Reemplazar full re-render con actualización inteligente

**Ubicación**: [js/qa-table.js](../../js/qa-table.js#L440)

**Beneficio**: 50-100ms → 25-50ms per render

**Complejidad**: Media

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 3 (Media) |
| **Esfuerzo** | 8h |
| **Impacto** | Alto (performance) |
| **Sprint** | NEXT+2 |

---

### 9. Índice Secundario por Modelo

**Descripción**: esquemasPosFileSet indexado por modelo para búsquedas más rápidas

**Ubicación**: [js/state.js](../../js/state.js#L31)

**Estructura**:
```javascript
esquemasPosFilesByModel = {
    '12v4000m40a': Set(['0001-01-50.webp', ...]),
    '16v4000m61': Set([...]),
    ...
}
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 3 (Media) |
| **Esfuerzo** | 2h |
| **Impacto** | Bajo (~10%) |
| **Sprint** | NEXT+1 |

---

### 10. CSV Normalization en depuracion_json.py

**Descripción**: Normalizar separadores CSV (", " vs "," vs ";" vs "\n")

**Ubicación**: [depuracion_json.py](../../depuracion_json.py)

**Función**:
```python
def normalize_csv_field(value):
    if not value:
        return None
    
    # Reemplaza separadores comunes
    value = str(value).replace(';', ',').replace('\n', ',').replace('\r', ',')
    
    # Normaliza espacios
    parts = [p.strip() for p in value.split(',') if p.strip()]
    
    return ', '.join(parts) if parts else None
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 3 (Media) |
| **Esfuerzo** | 2h |
| **Impacto** | Medio (data quality) |
| **Sprint** | NEXT+1 |

---

### 11. Documentación de Tamaños (50, 80)

**Descripción**: Clarificar qué significan 50 y 80 en esquemas_pos

**Ubicación**: [docs/images/esquemas_pos.md](esquemas_pos.md)

**Acción**: Documentar o consolidar a un solo tamaño

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 3 (Media) |
| **Esfuerzo** | 2h |
| **Impacto** | Bajo (documentación) |
| **Sprint** | CURRENT |

---

## 🟢 Bajas (P=4)

### 12. Pre-validación de URLs en Backend

**Descripción**: Endpoint que valida lote de URLs antes de exportar

**Ubicación**: `server.js` (new endpoint)

**Endpoint**: `GET /api/validate-image-urls?urls=URL1,URL2,URL3`

**Respuesta**:
```json
{
  "ok": ["URL1", "URL3"],
  "error": ["URL2"]
}
```

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 4 (Baja) |
| **Esfuerzo** | 4h |
| **Impacto** | Medio (developer experience) |
| **Sprint** | FUTURE |

---

### 13. Lazy Loading y Caching de Esquemas Locales

**Descripción**: Cache localStorage para esquemas descargados

**Ubicación**: [js/schemas.js](../../js/schemas.js)

**Beneficio**: Usuarios recurrentes cargan más rápido

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 4 (Baja) |
| **Esfuerzo** | 8h |
| **Impacto** | Medio (UX) |
| **Sprint** | FUTURE |

---

### 14. Virtualización Completa de Tabla

**Descripción**: Scroll virtual para tablas de 10K+ rows

**Ubicación**: [js/qa-table.js](../../js/qa-table.js)

**Beneficio**: 100ms → 10ms per page load

**Requiere**: Librería como `olist` o custom implementación

| Atributo | Valor |
|----------|-------|
| **Prioridad** | 4 (Baja) |
| **Esfuerzo** | 16h+ |
| **Impacto** | Alto (performance) |
| **Sprint** | FUTURE |

---

## 📅 Propuesta de Sprints

### SPRINT ACTUAL (This Week)

1. ✅ [P1] Placeholder URL configurable (1h)
2. ⏳ [P1] Validación de URLs en backend (4h)
3. ⏳ [P3] Documentar tamaños 50/80 (2h)

**Total**: 7 horas, **Outcome**: Data integrity mejorada

---

### SPRINT NEXT (Next Week)

1. ✅ [P1] Deduplicación completa (2h)
2. ✅ [P2] Timeout agresivo fallback (2h)
3. ✅ [P2] Caché para getEsquemaPosStatus (1h)
4. ⏳ [P2] Refactor extractRowFlags (2h)
5. ⏳ [P3] Normalización CSV (2h)
6. ⏳ [P3] Índice por modelo (2h)

**Total**: 13 horas, **Outcome**: Performance +30%, Data quality++

---

### SPRINT NEXT+1 (2 Weeks Out)

1. ✅ [P2] Tests unitarios (8h)
2. ⏳ [P3] Actualización incremental tabla (8h)

**Total**: 16 horas, **Outcome**: Test coverage established, Rendering 2x faster

---

### SPRINT NEXT+2 (3+ Weeks)

1. 📋 [P4] Pre-validación backend (4h)
2. 📋 [P4] Lazy loading localStorage (8h)
3. 📋 [P4] Virtualización (16h+)

**Total**: 28+ horas, **Outcome**: Production-grade performance & caching

---

## ✅ Checklist de Mantenimiento Continuo

### Antes de cada deploy:

- [ ] Ejecutar depuracion_json.py
- [ ] Validar no hay URLs rotas (con nuevo validator)
- [ ] Ejecutar tests unitarios
- [ ] Check performance: no hay regresión en renderTime
- [ ] Validar ESQ_POS badges en milu_qa

### Cada mes:

- [ ] Revisar error logs en milu_qa
- [ ] Comprobar si hay imágenes nuevas en esquemas_pos_circulos/
- [ ] Auditar integridad de exp_imagenes
- [ ] Documentar cambios en docs/

### Cada trimestre:

- [ ] Revisar nuevas técnicas de optimización
- [ ] Evaluar migración a librería de virtualización
- [ ] Benchmark actual vs baseline
- [ ] Planificar refactors mayores

---

## 📊 Impacto Esperado (Roadmap Completo)

**Actual** (May 11, 2026):
- Render tabla: 50-100ms
- Fallback imagen: 4-20s
- getEsquemaPosStatus: O(15) × 150 calls
- Test coverage: 0%

**Después Sprint NEXT** (May 31, 2026):
- Render tabla: 25-50ms ⬇️ 50%
- Fallback imagen: 1-2s ⬇️ 80%
- getEsquemaPosStatus: O(1) cached ⬇️ 95%
- Test coverage: ~30%

**Después Roadmap Completo** (June 30, 2026):
- Render tabla: 10-20ms ⬇️ 80%
- Fallback imagen: <1s ⬇️ 95%
- Virtualización: <2s cargar 10K rows
- Test coverage: ~70%

---

**Última actualización**: May 11, 2026  
**Responsable**: AI Context System  
**Próxima revisión**: May 25, 2026
