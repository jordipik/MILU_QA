# Image Pipeline: Flujo End-to-End

Documentación del pipeline completo que sigue una imagen desde su origen en PDFs hasta su visualización en milu_qa.

## 🌊 Flujo Global de Imágenes

```
┌─────────────────────┐
│  Fuentes Originales │
│  (Proveedores)      │
└──────────┬──────────┘
           │
           ├─ PDFs con imágenes
           ├─ Catálogos Excel
           ├─ Archivos SharePoint
           └─ Bases de datos externas
           
           ↓
           
┌──────────────────────────┐
│ Almacenamientos Locales  │
│ (Directorios del repo)   │
└──────────┬───────────────┘
           │
           ├─ fotos_articulos/          ← Imágenes de artículos (JPG)
           ├─ fotos_motores/            ← Imágenes de motores
           ├─ esquemas/                 ← Esquemas generales (PNG)
           └─ esquemas_pos_circulos/    ← Esquemas con círculos (WebP)
           
           ↓
           
┌──────────────────────────────┐
│ Procesamiento: depuracion_json.py │
│ • Normalización              │
│ • Validación                 │
│ • Cálculo exp_imagenes       │
└──────────┬───────────────────┘
           │
           ├─ Colapsa espacios múltiples
           ├─ Calcula campos finales
           ├─ Construye URLs
           └─ Añade metadatos
           
           ↓
           
┌──────────────────────────┐
│ engine_*.json            │
│ (9 archivos, 67K items) │
└──────────┬───────────────┘
           │
           ├─ engine_12V4000M40A.json
           ├─ engine_12V4000M53.json
           ├─ ... (7 más)
           └─ engine_20V4000M93L.json
           
           ↓
           
┌──────────────────────────────────┐
│ Síntesis: generate_synthetic_exports.js │
│ • Agrupa por PN                  │
│ • Selecciona representante       │
│ • Extrae imágenes únicas         │
└──────────┬──────────────────────┘
           │
           ├─ qa_synthetic_new.json
           └─ qa_synthetic_superseded.json
           
           ↓
           
┌──────────────────────────────────┐
│ Frontend: milu_qa.html           │
│ • Carga datos en state.allData   │
│ • Renderiza tabla                │
│ • Carga índice esquemas_pos      │
│ • Renderiza panels laterales     │
└──────────┬──────────────────────┘
           │
           ├─ qa-table.js renderRow()
           ├─ schemas.js buildSchemaPosImageCandidates()
           ├─ pos-preload.js preload en background
           └─ Event handlers para fallback
           
           ↓
           
┌──────────────────────────┐
│ Visualización Usuarios   │
│ • Tablas con badges      │
│ • Panels de esquemas     │
│ • Previews de imágenes   │
│ • Galerías interactivas  │
└──────────────────────────┘
```

---

## 📂 Almacenamientos y Directorios

### 1. **fotos_articulos/** — Imágenes de Partes

```
fotos_articulos/
├─ 0049976736.jpeg           ← Referencia de artículo
├─ 0050000001.jpeg
├─ X00007116.jpeg            ← Prefijo X para variantes
└─ ...
```

**Propósito**: Fotos de partes individuales (rodamientos, tuercas, pernos, etc.)  
**Formato**: JPEG  
**Campo en JSON**: `ruta_foto` / `filename_foto`  
**Uso**: Referencia visual del artículo en milu_qa

### 2. **fotos_motores/** — Imágenes de Motores

```
fotos_motores/
├─ 12V4000 M40A.jpg
├─ 16V4000 M73.jpg
├─ 20V4000 M93L.jpg
└─ ...
```

**Propósito**: Fotos completas del motor  
**Formato**: JPG  
**Uso**: Referencia visual en documentación de motores

### 3. **esquemas/** — Esquemas Generales (PNG)

```
esquemas/
├─ 12V4000M40A_esquemas/
│  ├─ 12V4000M40A-0001-01.png
│  ├─ 12V4000M40A-0001-02.png
│  ├─ 12V4000M40A-0002-01.png
│  └─ ...
├─ 16V4000M61_esquemas/
│  ├─ 16V4000M61-0001-01.png
│  └─ ...
└─ ...
```

**Propósito**: Esquemas técnicos generales sin círculos de posición  
**Formato**: PNG  
**Campo en JSON**: `esquemas` (CSV de filenames)  
**Estructura de nombre**:
```
{MODELO}-{LIBRO_PAGINA}-{INDICE}.png
 12V4000M40A   0001         01
```

### 4. **esquemas_pos_circulos/** — Esquemas con Posiciones (WebP)

```
esquemas_pos_circulos/
├─ 12V4000M40A-POS/
│  ├─ 12V4000M40A-0001-01-50.webp
│  ├─ 12V4000M40A-0001-01-80.webp   ← Diferentes tamaños
│  ├─ 12V4000M40A-0001-02-50.webp
│  ├─ 12V4000M40A-0001-02-80.webp
│  └─ ... (~5K archivos por modelo)
├─ 16V4000M61-POS/
│  └─ ... (~5K archivos)
└─ ... (9 modelos × ~5K = ~50K archivos totales)
```

**Propósito**: Esquemas con números de posición en círculos  
**Formato**: WebP (compresión moderna, más compacta que PNG)  
**Campo en JSON**: `ruta_esquemas_pos` (URL), `esquemas_circulos` (nombre)  
**Estructura de nombre**:
```
{MODELO}-{LIBRO_PAGINA}-{INDICE}-{TAMAÑO}.webp
 12V4000M40A   0001         01      50
 
 TAMAÑO: 50, 80 (probablemente radio/diámetro de círculo en pixels)
```

**Estadísticas**:
- 9 modelos de motor
- ~5,500 archivos por modelo
- Total: ~49,972 archivos
- Tamaño total: ~15-20 GB
- Indexados en memoria: `state.esquemasPosFileSet` (Set de basenames)

---

## 🔧 Scripts de Procesamiento

### 1. **depuracion_json.py** — Normalización y Cálculo de Campos Finales

**Ubicación**: [depuracion_json.py](../../depuracion_json.py)

**Responsabilidad**: Procesa engine_*.json y calcula campos finales

**Proceso paso a paso**:

```python
1. Para cada archivo engine_*.json:
   - Carga como JSON
   - Para cada registro:
     
     a) NORMALIZACIÓN:
        - Colapsa espacios múltiples
        - "A  55   X  5" → "A 55 X 5"
        - Aplica a: dimensions_gesa, MEASUREMENT / STANDARD
        
     b) VALIDACIÓN ERRORES:
        - Checkea 7 tipos de errores
        - Cuenta y agrega a error_list
        
     c) CÁLCULO DE CAMPOS FINALES:
        - measurement_final:
          * Si dimensions_gesa existe → usar
          * Si no → usar MEASUREMENT / STANDARD
          * Si no → null
        
        - exp_imagenes (CRÍTICO):
          * Si ruta_foto:
            - Agregar a lista
          * Si ruta_esquemas_pos:
            - Agregar a lista
          * Si hay imágenes:
            - exp_imagenes = "URL1, URL2, ..."
          * Si NO hay imágenes:
            - exp_imagenes = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"

2. Salida:
   - Sobrescribe engine_*.json con campos normalizados
   - Todos los registros tienen: measurement_final, exp_imagenes, error_list
```

**Invocación**:
```bash
python depuracion_json.py
# Sin parámetros, procesa TODOS los engine_*.json en paralelo
```

**Importante**: Es el PUNTO CRÍTICO donde se generan campos finales para exportación.

### 2. **generate_synthetic_exports.js** — Síntesis de Exportaciones

**Ubicación**: [generate_synthetic_exports.js](../../generate_synthetic_exports.js)

**Responsabilidad**: Agrupa registros por PN y genera exportaciones sintéticas

**Proceso**:

```javascript
1. Carga todos los engine_*.json
   
2. Agrupa por PART NO. (PN):
   - Si PN aparece en múltiples modelos de motor
   - Agrupa todos los registros con ese PN
   
3. Para cada grupo de PN:
   - Selecciona 1 registro "representante"
     * Preferencia: NEW > SUPERSEDED
     * Criterio: tiene imágenes, está completo, etc.
   
   - Extrae imágenes únicas:
     * De TODOS los registros del grupo
     * Deduplica por nombre
     * Crea array de URLs únicas
   
   - Genera estructura sintética:
     {
       "pn": "PART NO.",
       "models": ["12V4000M40A", "16V4000M61", ...],
       "new_data": {...representante...},
       "superseded_data": {...otros...},
       "all_images": ["URL1", "URL2", ...],
       "exp_imagenes": "URL1, URL2, ..."
     }

4. Salida:
   - qa_synthetic_new.json (PNs nuevos)
   - qa_synthetic_superseded.json (PNs deprecated)
```

**Invocación**:
```bash
npm run generate:synthetic
```

### 3. **server.js** — Índice de Esquemas en Runtime

**Ubicación**: [server.js](../../server.js#L1912) `/api/esquemas-pos-index`

**Responsabilidad**: Indexar archivos de esquemas_pos_circulos/

**Proceso**:

```javascript
GET /api/esquemas-pos-index

1. First call:
   - Escanea recurivamente esquemas_pos_circulos/
   - Extrae todos los filenames
   - Convierte a minúsculas (normalización)
   - Crea Set para búsqueda O(1)
   - Cachea en memoria: _esquemasPosIndexCache
   
2. Llamadas posteriores:
   - Retorna caché inmediatamente
   
3. Response:
   {
     "files": ["12v4000m40a-0001-01-50.webp", "12v4000m40a-0001-02-80.webp", ...]
   }
   
   Arrays con ~49,972 elementos
```

**Características**:
- ✅ Una sola vez (caché en memoria)
- ✅ O(n) construcción, O(1) búsquedas posteriores
- ✅ Normalización de basenames (lowercase)

---

## 🗂️ Campos de Imagen en engine_*.json

Cada record en engine_*.json contiene estos campos relacionados con imágenes:

| Campo | Tipo | Ejemplo | Propósito |
|-------|------|---------|----------|
| `ruta_foto` | URL / null | `https://.../2026/01/0049976736.jpeg` | Enlace a imagen de artículo |
| `filename_foto` | string / null | `0049976736.jpeg` | Nombre local (informativo) |
| `esquemas` | CSV / null | `12V4000M40A-0001-01.png , 12V4000M40A-0001-02.png` | Esquemas generales (commas con espacios) |
| `esquemas_circulos_all` | CSV / null | Idem | **TODOS** los círculos (incluyendo variantes de tamaño) |
| `esquemas_circulos` | string / null | `12V4000M40A-0001-01-50.webp` | **PRIMER** círculo seleccionado |
| `ruta_esquemas_pos` | URL / null | `https://.../2026/02/12V4000M40A-0001-01-50.webp` | Enlace completo al círculo |
| **`exp_imagenes`** | CSV / URL | `https://.../0049976736.jpeg, https://.../pos.webp` | **CAMPO FINAL para exportación** |

### Relaciones entre Campos

```
ruta_foto → se genera en depuracion_json.py extrayendo MAPPING
          → basename se almacena en filename_foto
          
esquemas → se proporciona manualmente en catálogos
        → puede contener múltiples filenames (CSV con ", ")
        
esquemas_circulos → se selecciona de esquemas_circulos_all
                  → se usa para generar ruta_esquemas_pos
                  
ruta_esquemas_pos → se genera combinando base URL + esquemas_circulos
                  → ej: "https://.../" + "12V4000M40A-0001-01-50.webp"
                  
exp_imagenes → se calcula en depuracion_json.py
             → prioridad: ruta_foto > ruta_esquemas_pos > placeholder
             → es el campo FINAL para sincronización WordPress
```

---

## 🔄 Ciclo de Actualización de Imágenes

### Flujo Típico de Actualización

```
1. OBTENER imágenes nuevas
   ├─ De proveedores (PDF, Excel, SharePoint)
   └─ Copiarlas a fotos_articulos/, esquemas/, esquemas_pos_circulos/
   
2. VALIDAR estructura
   ├─ Verificar nombres de archivos coinciden con patrones
   └─ Verificar directorios no tienen caracteres especiales
   
3. PROCESAR con depuracion_json.py
   ├─ python depuracion_json.py
   └─ Calcula measurement_final, exp_imagenes, campos finales
   
4. GENERAR síntesis
   ├─ npm run generate:synthetic
   └─ Crea qa_synthetic_new.json, qa_synthetic_superseded.json
   
5. VALIDAR en milu_qa
   ├─ Abrir http://localhost:3000/qa_milu.html
   ├─ Checkear badges OK/MISS/FALTA
   └─ Verificar previews en panels laterales
   
6. REVISAR en milu_qa QA
   ├─ Comprobar imágenes aparecer correctamente
   ├─ Testear filtros has_esquema_pos
   └─ Validar no hay errores en consola
```

### Tiempos Estimados

| Paso | Tiempo | Notas |
|------|--------|-------|
| Copiar archivos | 5-30 min | Depende de volumen y velocidad disk |
| depuracion_json.py | 2-5 min | Procesa 67K registros en paralelo |
| generate:synthetic | 1-2 min | Síntesis y deduplicación |
| Índice esquemas_pos | 30 seg | Se genera automático en primer GET |
| Validación milu_qa | 5-10 min | Manual, clicking y scrolling |
| **Total** | **15-50 min** | Típico 20-30 min |

---

## 📊 Volúmenes de Datos

| Métrica | Valor | Notas |
|---------|-------|-------|
| engine_*.json files | 9 | Un archivo por modelo de motor |
| Total registros | 67,883 | ~7K-12K por modelo |
| Registros con foto | ~45,000 | ~66% tienen ruta_foto |
| Registros con esquema_pos | ~52,000 | ~77% tienen ruta_esquemas_pos |
| Imágenes únicas (fotos) | ~12,500 | Muchos registros comparten foto |
| Imágenes únicas (esquemas) | ~49,972 | Casi únicos en esquemas_pos_circulos/ |
| **Total imagen references** | ~490,000 | 7-8 campos × 67K |
| Tamaño promedio imagen | 150 KB | JPEG/WebP comprimidas |
| **Total disk images** | ~50-60 GB | Fotos + esquemas generales + pos |

---

## ⚠️ Problemas Conocidos en Pipeline

### 1. **sin_imagen URL Hardcoded**
- Ubicación: [depuracion_json.py](../../depuracion_json.py) línea ~34
- Problema: Si dominio cambia, todas las imágenes perdidas usan URL vieja
- Solución: Hacer URL configurable o usar ruta local

### 2. **No hay Validación de URLs**
- Problema: depuracion_json.py genera URLs sin verificar si son accesibles
- Solución: Agregar HEAD requests para validación previa

### 3. **Deduplicación Incompleta en Síntesis**
- Problema: generate_synthetic_exports.js pierde imágenes de PNs duplicados
- Solución: Agregar todas las imágenes únicas al exp_imagenes

### 4. **Espacios en Nombres de Motor**
- Problema: "12V4000 M40A" tiene espacio (conflictivo con URLs)
- Ubicación: fotos_motores/
- Solución: Estandarizar a "12V4000M40A" (sin espacios)

### 5. **Sin Versionado de Campos**
- Problema: Si measurement_final o exp_imagenes cambian, no hay historial
- Solución: Agregar timestamps o versiones a campos calculados

---

## ✅ Validaciones Implementadas

- ✓ Colapso de espacios múltiples
- ✓ Validación de estructura JSON
- ✓ Conteo de errores por registro
- ⚠️ Matching URL ↔ Filesystem (solo en frontend)
- ❌ Validación de URLs accesibles
- ❌ Integridad referencial (filename_foto vs ruta_foto)

---

**Última actualización**: May 11, 2026  
**Basado en commit**: ad1737f0
