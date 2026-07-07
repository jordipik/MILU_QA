# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

> **PROPUESTA — PENDIENTE DE VALIDAR**
>
> Arquitectura futura de imágenes. Diseño sin implementar.
>
> Movido a `docs/proposals/` el 2026-05-12. **No representa el estado actual del código.**

---

# Propuesta de Arquitectura Futura

Visión de una arquitectura moderna, escalable y mantenible para el sistema de imágenes de MILU.

---

## 🎯 Principios de Diseño

### 1. **Centralización de Índices**

**Problema Actual**:
- Índice esquemas_pos indexado en frontend (runtime)
- Cada sesión re-indexa 50K archivos
- No hay persistencia del índice

**Solución**:
```json
// backend/assets/indexes/schemas-pos-index.json (precalculado)
{
  "generatedAt": "2026-05-11T10:00:00Z",
  "version": "1",
  "files": {
    "12v4000m40a": {
      "50px": ["0001-01-50.webp", "0001-02-50.webp", ...],
      "80px": ["0001-01-80.webp", "0001-02-80.webp", ...],
      "count": 4200
    },
    "16v4000m61": {...},
    ...
  },
  "stats": {
    "totalFiles": 49972,
    "models": 9,
    "lastScanned": "2026-05-11T09:00:00Z"
  }
}

// Frontend:
GET /api/schemas-pos-index  // Devuelve JSON precalculado, no escanea
```

**Beneficios**:
- ✅ Startup 300ms → 50ms (sin escaneo)
- ✅ Índice versionado y auditable
- ✅ Pre-computado offline

---

### 2. **Manifest de Imágenes Centralizado**

**Problema Actual**:
- Imágenes dispersas en múltiples campos (ruta_foto, ruta_esquemas_pos, exp_imagenes)
- Sin información de integridad
- Sin metadata

**Solución**:
```json
// backend/assets/manifests/images-manifest-2026-05-11.json
{
  "schema_version": "2",
  "generated": "2026-05-11T10:00:00Z",
  "images": [
    {
      "id": "IMG_0049976736",
      "filename": "0049976736.jpeg",
      "pn": "ABC-789",
      "models": ["12V4000M40A", "16V4000M61"],
      "type": "article",
      "size_bytes": 245678,
      "md5": "a1b2c3d4e5f6g7h8",
      "status": "valid",
      "accessible_at": "2026-05-11T08:00:00Z",
      "fallback_urls": [
        "https://cdn.milu-naval.com/articles/0049976736.jpeg",
        "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/0049976736.jpeg"
      ]
    },
    {
      "id": "SCHEMA_12V4000M40A_0001_01_50",
      "filename": "12V4000M40A-0001-01-50.webp",
      "pn": null,
      "models": ["12V4000M40A"],
      "type": "schema_pos",
      "size_bytes": 12345,
      "md5": "f7g8h9i0j1k2l3m4",
      "status": "valid",
      "sizes": [50, 80],
      "related_schemas": ["12V4000M40A-0001-02-50.webp"]
    },
    ...
  ],
  "summary": {
    "total": 72345,
    "by_type": {
      "article": 12500,
      "schema_general": 8000,
      "schema_pos": 49972,
      "engine": 1873
    },
    "valid": 72100,
    "broken": 245
  }
}
```

**Beneficios**:
- ✅ Single source of truth
- ✅ Metadata y checksums
- ✅ Detección automática de imágenes rotas
- ✅ Fallback URLs configurables

---

### 3. **Validación en R Scripts (Upstream)**

**Problema Actual**:
- Python scripts generan datos sin validar URLs
- Errores descubiertos al final del pipeline

**Solución**:
```r
# R script: validate_images.r (antes de depuracion_json.py)

validate_image_existence <- function(url, timeout = 3) {
  tryCatch({
    response <- httr::HEAD(url, timeout(timeout))
    status_code(response) < 400
  }, error = function(e) {
    logging::warn("URL inaccesible: %s", url)
    FALSE
  })
}

validate_record_images <- function(record) {
  issues <- list()
  
  if (!is.na(record$ruta_foto) && record$ruta_foto != "") {
    if (!validate_image_existence(record$ruta_foto)) {
      issues$foto_broken <- record$ruta_foto
    }
  }
  
  if (!is.na(record$ruta_esquemas_pos) && record$ruta_esquemas_pos != "") {
    if (!validate_image_existence(record$ruta_esquemas_pos)) {
      issues$schema_broken <- record$ruta_esquemas_pos
    }
  }
  
  if (length(issues) > 0) {
    logging::warn("Record %s tiene imágenes rotas", record$ID)
    return(list(valid = FALSE, issues = issues))
  }
  
  return(list(valid = TRUE, issues = NULL))
}

# Aplicar a todo dataset
validation_report <- data.frame()
for (i in 1:nrow(df_raw)) {
  result <- validate_record_images(df_raw[i,])
  validation_report <- rbind(validation_report, data.frame(
    record_id = df_raw$ID[i],
    valid = result$valid,
    issues = paste(names(result$issues), collapse = ",")
  ))
}

# Exportar reporte
write.csv(validation_report, "validation_report_2026-05-11.csv")

# Continuar solo con válidos
df_valid <- df_raw[validation_report$valid,]
```

**Beneficios**:
- ✅ Validación en el origen (early detection)
- ✅ Reporte detallado de errores
- ✅ Evita imágenes rotas en JSON

---

### 4. **Lazy Loading y Virtualización**

**Problema Actual**:
- 67K registros cargados en memoria
- Tabla crea 1500 elementos DOM para 50 filas
- Scroll lento, memory leak potencial

**Solución - Arquitectura de Virtualización**:

```javascript
// frontend/js/virtual-table.js

class VirtualTable {
  constructor(options) {
    this.data = options.data;              // Todos los registros
    this.pageSize = options.pageSize;      // 50 por defecto
    this.visibleRange = { start: 0, end: 50 };
    this.elementHeight = 40;                // px por row
    this.container = options.container;     // DOM element
    this.renderRow = options.renderRow;     // Función render
  }
  
  onScroll(event) {
    const scrollTop = event.target.scrollTop;
    const newStart = Math.floor(scrollTop / this.elementHeight);
    const newEnd = newStart + this.pageSize;
    
    if (newStart !== this.visibleRange.start) {
      this.visibleRange = { start: newStart, end: newEnd };
      this.render();
    }
  }
  
  render() {
    // Calcula posición de spacer top
    const topSpacerHeight = this.visibleRange.start * this.elementHeight;
    
    // Crea 50 rows visibles
    const visibleData = this.data.slice(
      this.visibleRange.start,
      this.visibleRange.end
    );
    
    const html = `
      <div style="height: ${topSpacerHeight}px;"></div>
      ${visibleData.map(row => this.renderRow(row)).join('')}
      <div style="height: ${(this.data.length - this.visibleRange.end) * this.elementHeight}px;"></div>
    `;
    
    this.container.innerHTML = html;
  }
}

// Uso:
const table = new VirtualTable({
  data: state.filteredData,
  pageSize: 50,
  container: document.querySelector('#table-body'),
  renderRow: (row) => renderRow(row)
});

document.querySelector('#table-container').addEventListener(
  'scroll',
  (e) => table.onScroll(e)
);
```

**Beneficios**:
- ✅ Siempre renderiza solo 50 rows (en memoria)
- ✅ Scroll fluido en tablas de 10K+ registros
- ✅ Memory footprint: O(pageSize) en lugar de O(totalRecords)
- ✅ Performance: Siempre 50-100ms por scroll

---

### 5. **Caché Client-Side y Service Worker**

**Problema Actual**:
- Usuario descarga las mismas imágenes en cada sesión
- No hay caché persistente

**Solución**:

```javascript
// frontend/service-worker.js

const CACHE_VERSION = 'milu-images-v1';
const CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000;  // 30 días

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION));
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/esquemas_pos_circulos/') ||
      event.request.url.includes('/fotos_articulos/')) {
    
    event.respondWith(
      caches.open(CACHE_VERSION).then(cache => {
        return cache.match(event.request).then(response => {
          if (response) {
            // Sirve desde caché
            return response;
          }
          
          // Fetch del servidor
          return fetch(event.request).then(response => {
            // Cachea si es exitoso
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(err => {
            // Fallback si está offline
            return caches.match('/offline.html');
          });
        });
      })
    );
  }
});

// Limpieza de caché viejo
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_VERSION) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
```

**Beneficios**:
- ✅ Usuarios recurrentes: Caché local, sin fetch
- ✅ Offline support (parcial)
- ✅ Bandwidth reducido 80%+
- ✅ Load time segundos más rápido

---

### 6. **CDN y Optimización de Imágenes**

**Problema Actual**:
- Imágenes servidas desde servidor local
- Sin compresión ni optimización
- Ancho de banda alto

**Solución - Arquitectura CDN**:

```
WordPress +
  Image Processing
  (ImageMagick/Sharp)
         │
         ├─→ Optimizar formato (WEBP con fallback)
         ├─→ Redimensionar (50px, 80px para pos; thumb para article)
         ├─→ Calcular checksums
         │
         ↓
       AWS S3 / CloudFront CDN
         │
         ├─→ Distribución geográfica
         ├─→ Caching agresivo (1 año para versionado)
         ├─→ HTTP/2 push
         │
         ↓
      Frontend (Lazy load)
         │
         ├─→ Requiere WEBP, fallback PNG/JPEG
         ├─→ Lazy loading con IntersectionObserver
         └─→ Service Worker para caché

Estructura de URLs:
  /cdn/{model}/{type}/{size}/{filename}.{format}
  
Ejemplos:
  /cdn/12v4000m40a/schemas-pos/50/12v4000m40a-0001-01.webp
  /cdn/12v4000m40a/articles/thumb/0049976736.webp
```

**Beneficios**:
- ✅ Ancho de banda 60%+ reducido (WEBP compression)
- ✅ Latencia global reducida (CDN edge servers)
- ✅ Escalabilidad automática (CDN autoscale)
- ✅ Caché HTTP agresivo posible

---

## 🏗️ Arquitectura Propuesta en Capas

```
┌─────────────────────────────────────────────────────┐
│           FRONTEND LAYER (Browser)                  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  qa_milu.html + ES6 modules                        │
│  ├─ Virtual Table (50 rows at a time)              │
│  ├─ Lazy Image Loading (IntersectionObserver)      │
│  ├─ Service Worker Cache (30 días)                 │
│  └─ WEBP with PNG fallback                         │
│                                                     │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────┴──────────────────────────────┐
│          BACKEND API LAYER (Node.js)                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  server.js (Express)                               │
│  ├─ GET /api/schemas-pos-index (precalculated)    │
│  ├─ GET /api/images-manifest (metadata)           │
│  ├─ GET /api/validate-image-urls                  │
│  ├─ GET /api/health (para monitoring)             │
│  └─ Static serving (fallback)                      │
│                                                     │
└──────────────────────┬──────────────────────────────┘
                       │ I/O Sync
┌──────────────────────┴──────────────────────────────┐
│       DATA PROCESSING LAYER (Python/R)              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. R scripts → Extrae imágenes de PDFs            │
│     └─ validate_images.r (NUEVO)                   │
│                                                     │
│  2. Python normalization                           │
│     ├─ depuracion_json.py (mejorado)               │
│     │  └─ Lee config.json                          │
│     │  └─ Normaliza CSV                            │
│     │  └─ Valida URLs (NUEVO)                      │
│     └─ generate_synthetic_exports.js               │
│        └─ Deduplicación completa (NUEVO)           │
│                                                     │
│  3. Index generation                               │
│     └─ generate_indexes.py (NUEVO)                 │
│        ├─ Calcula schemas-pos-index.json           │
│        ├─ Calcula images-manifest.json             │
│        └─ Valida integridad                        │
│                                                     │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────────┐
│       STORAGE LAYER (Filesystem + S3)               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Local (Development)                               │
│  ├─ engine_*.json (data)                           │
│  ├─ fotos_articulos/ (images)                      │
│  ├─ esquemas_pos_circulos/ (images)                │
│  ├─ backends/assets/indexes/ (indices)             │
│  └─ backends/assets/manifests/ (metadata)          │
│                                                     │
│  S3/CDN (Production)                               │
│  ├─ /cdn/articles/thumbs/ (cached)                 │
│  ├─ /cdn/schemas/pos/ (cached)                     │
│  └─ CloudFront distribution                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 Flujo de Actualización Mejorado

```
Usuario sube nuevo PDF
          │
          ↓
   R scripts extraen imágenes
          │
          ├─→ Guarda en fotos_articulos/
          │
          ├─→ validate_images.r
          │   └─→ Valida URLs accesibles
          │   └─→ Genera validation_report.csv
          │
          └─→ Si hay errores:
              └─→ Notifica usuario
              └─→ NO procede a siguientes steps
              
          ↓ (Si validación OK)
          
   depuracion_json.py
          │
          ├─→ Lee engine_*.json
          ├─→ Lee config.json (DB config)
          ├─→ Normaliza campos
          ├─→ Calcula exp_imagenes
          └─→ Escribe engine_*.json actualizado
          
          ↓
          
   generate_synthetic_exports.js
          │
          ├─→ Agrupa por PN
          ├─→ Deduplica imágenes (NUEVO)
          └─→ Escribe qa_synthetic_*.json
          
          ↓
          
   generate_indexes.py (NUEVO)
          │
          ├─→ Lee todos los engine_*.json
          ├─→ Indexa esquemas_pos_circulos/ (si es necesario)
          ├─→ Valida integridad (checksums)
          ├─→ Genera:
          │   ├─ backends/assets/indexes/schemas-pos-index.json
          │   └─ backends/assets/manifests/images-manifest.json
          └─→ Reporta errores encontrados
          
          ↓
          
   Git commit
          │
          ├─→ engine_*.json
          ├─→ qa_synthetic_*.json
          ├─→ schemas-pos-index.json
          └─→ images-manifest.json
          
          ↓
          
   Deploy a producción
          │
          ├─→ Actualiza WordPress (via /apply-revision-to-engines)
          ├─→ Sincroniza imágenes a S3 si es nuevo
          └─→ Invalida caché CDN
          
          ↓
          
   Frontend (siguiente sesión)
          │
          ├─→ GET /api/schemas-pos-index → Instantáneo (50ms)
          ├─→ GET /api/images-manifest → Metadata completa
          └─→ Lazy load imágenes del CDN (cached)
```

---

## 📋 Implementación por Fases

### **Fase 1: Foundation (Semanas 1-2)**
- ✅ config.json configurable
- ✅ Validación de URLs en backend
- ✅ Tests unitarios básicos
- ✅ CSV normalization

**Costo**: 14 horas  
**Riesgo**: Bajo

---

### **Fase 2: Índices y Manifests (Semanas 3-4)**
- ✅ generate_indexes.py (NUEVO script)
- ✅ Precalcular schemas-pos-index.json
- ✅ Precalcular images-manifest.json
- ✅ Backend devuelve índices precalculados
- ✅ Frontend consume nuevos índices

**Costo**: 16 horas  
**Riesgo**: Bajo

---

### **Fase 3: Validación Upstream (Semanas 5-6)**
- ✅ validate_images.r (NUEVO R script)
- ✅ Integración con pipeline R
- ✅ Generación de validation_report.csv
- ✅ Fail-fast si hay errores

**Costo**: 12 horas  
**Riesgo**: Medio (requiere cambios en R)

---

### **Fase 4: Performance (Semanas 7-10)**
- ✅ Virtual Table (Semanas 7-8)
- ✅ Lazy Loading + Service Worker (Semanas 8-9)
- ✅ Full Re-render → Smart Update (Semanas 9-10)

**Costo**: 24 horas  
**Riesgo**: Medio (requiere refactoring big)

---

### **Fase 5: CDN y Producción (Semanas 11+)**
- ✅ Integración AWS S3
- ✅ CloudFront distribution
- ✅ Image optimization pipeline
- ✅ CDN fallback en caso de error

**Costo**: 32+ horas  
**Riesgo**: Alto (infraestructura)

---

## 📊 Impacto Proyectado

### Antes (Actual)

**Performance**:
- Startup: 350-450ms (con índice)
- Render tabla: 50-100ms
- Image fallback: 4-20s
- Memory: 20-30 MB

**Escalabilidad**:
- Max 100K registros
- Max 50K archivos
- Max 50 rows/page

**Confiabilidad**:
- 0 tests
- Imágenes rotas sin detectar
- Manual validación
- No hay rollback

---

### Después (Con Propuesta)

**Performance**:
- Startup: 50-100ms (índice precalculado)
- Render tabla: 10-20ms (virtual)
- Image fallback: <1s (timeout)
- Memory: <15 MB (virtual rows)

**Escalabilidad**:
- 500K+ registros soportados
- 500K+ archivos soportados (indexado)
- Scroll fluido en cualquier tamaño

**Confiabilidad**:
- 70%+ test coverage
- Validación automática upstream
- Manifest de integridad
- Rollback automático

**Costo operacional**:
- 80% menos ancho de banda (CDN + WEBP)
- 90% menos I/O backend (índices precalculados)
- 60% menos storage (WEBP + deduplicación)

---

## 🚀 Recomendación Final

**Implementar en 4 fases** (4 meses de trabajo):

1. **Fase 1-2**: Foundation + Índices (4 semanas)
   - Bajo riesgo, máximo impacto inmediato
   - Fixes críticos + mejora de 60% en startup

2. **Fase 3**: Validación Upstream (2 semanas)
   - Detección temprana de errores
   - Integración con R pipeline

3. **Fase 4**: Performance (4 semanas)
   - Virtual table + lazy loading
   - Mejora de 80% en render performance

4. **Fase 5**: CDN (ongoing)
   - Deployment en AWS
   - Global distribution

**Parallelization**: Fase 1 + 2 pueden ejecutarse en paralelo con Fase 3

**Estimated Total Effort**: 80-100 horas (3 meses con 1 dev FTE)

---

**Última actualización**: May 11, 2026  
**Próxima revisión**: June 1, 2026  
**Responsable**: Arquitectura de MILU

