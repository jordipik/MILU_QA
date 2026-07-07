# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Image Pipeline: Flujo End-to-End

DocumentaciÃ³n del pipeline completo que sigue una imagen desde su origen en PDFs hasta su visualizaciÃ³n en milu_qa.

## ðŸŒŠ Flujo Global de ImÃ¡genes

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Fuentes Originales â”‚
â”‚  (Proveedores)      â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â”œâ”€ PDFs con imÃ¡genes
           â”œâ”€ CatÃ¡logos Excel
           â”œâ”€ Archivos SharePoint
           â””â”€ Bases de datos externas
           
           â†“
           
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Almacenamientos Locales  â”‚
â”‚ (Directorios del repo)   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â”œâ”€ fotos_articulos/          â† ImÃ¡genes de artÃ­culos (JPG)
           â”œâ”€ fotos_motores/            â† ImÃ¡genes de motores
           â”œâ”€ esquemas/                 â† Esquemas generales (PNG)
           â””â”€ esquemas_pos_circulos/    â† Esquemas con cÃ­rculos (WebP)
           
           â†“
           
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Procesamiento: depuracion_json.py â”‚
â”‚ â€¢ NormalizaciÃ³n              â”‚
â”‚ â€¢ ValidaciÃ³n                 â”‚
â”‚ â€¢ CÃ¡lculo exp_imagenes       â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â”œâ”€ Colapsa espacios mÃºltiples
           â”œâ”€ Calcula campos finales
           â”œâ”€ Construye URLs
           â””â”€ AÃ±ade metadatos
           
           â†“
           
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ engine_*.json            â”‚
â”‚ (9 archivos, 67K items) â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â”œâ”€ engine_12V4000M40A.json
           â”œâ”€ engine_12V4000M53.json
           â”œâ”€ ... (7 mÃ¡s)
           â””â”€ engine_20V4000M93L.json
           
           â†“
           
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ SÃ­ntesis: generate_synthetic_exports.js â”‚
â”‚ â€¢ Agrupa por PN                  â”‚
â”‚ â€¢ Selecciona representante       â”‚
â”‚ â€¢ Extrae imÃ¡genes Ãºnicas         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â”œâ”€ qa_synthetic_new.json
           â””â”€ qa_synthetic_superseded.json
           
           â†“
           
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Frontend: milu_qa.html           â”‚
â”‚ â€¢ Carga datos en state.allData   â”‚
â”‚ â€¢ Renderiza tabla                â”‚
â”‚ â€¢ Carga Ã­ndice esquemas_pos      â”‚
â”‚ â€¢ Renderiza panels laterales     â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
           â”‚
           â”œâ”€ qa-table.js renderRow()
           â”œâ”€ schemas.js buildSchemaPosImageCandidates()
           â”œâ”€ pos-preload.js preload en background
           â””â”€ Event handlers para fallback
           
           â†“
           
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ VisualizaciÃ³n Usuarios   â”‚
â”‚ â€¢ Tablas con badges      â”‚
â”‚ â€¢ Panels de esquemas     â”‚
â”‚ â€¢ Previews de imÃ¡genes   â”‚
â”‚ â€¢ GalerÃ­as interactivas  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## ðŸ“‚ Almacenamientos y Directorios

### 1. **fotos_articulos/** â€” ImÃ¡genes de Partes

```
fotos_articulos/
â”œâ”€ 0049976736.jpeg           â† Referencia de artÃ­culo
â”œâ”€ 0050000001.jpeg
â”œâ”€ X00007116.jpeg            â† Prefijo X para variantes
â””â”€ ...
```

**PropÃ³sito**: Fotos de partes individuales (rodamientos, tuercas, pernos, etc.)  
**Formato**: JPEG  
**Campo en JSON**: `ruta_foto` / `filename_foto`  
**Uso**: Referencia visual del artÃ­culo en milu_qa

### 2. **fotos_motores/** â€” ImÃ¡genes de Motores

```
fotos_motores/
â”œâ”€ 12V4000 M40A.jpg
â”œâ”€ 16V4000 M73.jpg
â”œâ”€ 20V4000 M93L.jpg
â””â”€ ...
```

**PropÃ³sito**: Fotos completas del motor  
**Formato**: JPG  
**Uso**: Referencia visual en documentaciÃ³n de motores

### 3. **esquemas/** â€” Esquemas Generales (PNG)

```
esquemas/
â”œâ”€ 12V4000M40A_esquemas/
â”‚  â”œâ”€ 12V4000M40A-0001-01.png
â”‚  â”œâ”€ 12V4000M40A-0001-02.png
â”‚  â”œâ”€ 12V4000M40A-0002-01.png
â”‚  â””â”€ ...
â”œâ”€ 16V4000M61_esquemas/
â”‚  â”œâ”€ 16V4000M61-0001-01.png
â”‚  â””â”€ ...
â””â”€ ...
```

**PropÃ³sito**: Esquemas tÃ©cnicos generales sin cÃ­rculos de posiciÃ³n  
**Formato**: PNG  
**Campo en JSON**: `esquemas` (CSV de filenames)  
**Estructura de nombre**:
```
{MODELO}-{LIBRO_PAGINA}-{INDICE}.png
 12V4000M40A   0001         01
```

### 4. **esquemas_pos_circulos/** â€” Esquemas con Posiciones (WebP)

```
esquemas_pos_circulos/
â”œâ”€ 12V4000M40A-POS/
â”‚  â”œâ”€ 12V4000M40A-0001-01-50.webp
â”‚  â”œâ”€ 12V4000M40A-0001-01-80.webp   â† Diferentes tamaÃ±os
â”‚  â”œâ”€ 12V4000M40A-0001-02-50.webp
â”‚  â”œâ”€ 12V4000M40A-0001-02-80.webp
â”‚  â””â”€ ... (~5K archivos por modelo)
â”œâ”€ 16V4000M61-POS/
â”‚  â””â”€ ... (~5K archivos)
â””â”€ ... (9 modelos Ã— ~5K = ~50K archivos totales)
```

**PropÃ³sito**: Esquemas con nÃºmeros de posiciÃ³n en cÃ­rculos  
**Formato**: WebP (compresiÃ³n moderna, mÃ¡s compacta que PNG)  
**Campo en JSON**: `ruta_esquemas_pos` (URL), `esquemas_circulos` (nombre)  
**Estructura de nombre**:
```
{MODELO}-{LIBRO_PAGINA}-{INDICE}-{TAMAÃ‘O}.webp
 12V4000M40A   0001         01      50
 
 TAMAÃ‘O: 50, 80 (probablemente radio/diÃ¡metro de cÃ­rculo en pixels)
```

**EstadÃ­sticas**:
- 9 modelos de motor
- ~5,500 archivos por modelo
- Total: ~49,972 archivos
- TamaÃ±o total: ~15-20 GB
- Indexados en memoria: `state.esquemasPosFileSet` (Set de basenames)

---

## ðŸ”§ Scripts de Procesamiento

### 1. **depuracion_json.py** â€” NormalizaciÃ³n y CÃ¡lculo de Campos Finales

**UbicaciÃ³n**: [depuracion_json.py](../../depuracion_json.py)

**Responsabilidad**: Procesa engine_*.json y calcula campos finales

**Proceso paso a paso**:

```python
1. Para cada archivo engine_*.json:
   - Carga como JSON
   - Para cada registro:
     
     a) NORMALIZACIÃ“N:
        - Colapsa espacios mÃºltiples
        - "A  55   X  5" â†’ "A 55 X 5"
        - Aplica a: dimensions_gesa, MEASUREMENT / STANDARD
        
     b) VALIDACIÃ“N ERRORES:
        - Checkea 7 tipos de errores
        - Cuenta y agrega a error_list
        
     c) CÃLCULO DE CAMPOS FINALES:
        - measurement_final:
          * Si dimensions_gesa existe â†’ usar
          * Si no â†’ usar MEASUREMENT / STANDARD
          * Si no â†’ null
        
        - exp_imagenes (CRÃTICO):
          * Si ruta_foto:
            - Agregar a lista
          * Si ruta_esquemas_pos:
            - Agregar a lista
          * Si hay imÃ¡genes:
            - exp_imagenes = "URL1, URL2, ..."
          * Si NO hay imÃ¡genes:
            - exp_imagenes = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"

2. Salida:
   - Sobrescribe engine_*.json con campos normalizados
   - Todos los registros tienen: measurement_final, exp_imagenes, error_list
```

**InvocaciÃ³n**:
```bash
python depuracion_json.py
# Sin parÃ¡metros, procesa TODOS los engine_*.json en paralelo
```

**Importante**: Es el PUNTO CRÃTICO donde se generan campos finales para exportaciÃ³n.

### 2. **generate_synthetic_exports.js** â€” SÃ­ntesis de Exportaciones

**UbicaciÃ³n**: [generate_synthetic_exports.js](../../generate_synthetic_exports.js)

**Responsabilidad**: Agrupa registros por PN y genera exportaciones sintÃ©ticas

**Proceso**:

```javascript
1. Carga todos los engine_*.json
   
2. Agrupa por PART NO. (PN):
   - Si PN aparece en mÃºltiples modelos de motor
   - Agrupa todos los registros con ese PN
   
3. Para cada grupo de PN:
   - Selecciona 1 registro "representante"
     * Preferencia: NEW > SUPERSEDED
     * Criterio: tiene imÃ¡genes, estÃ¡ completo, etc.
   
   - Extrae imÃ¡genes Ãºnicas:
     * De TODOS los registros del grupo
     * Deduplica por nombre
     * Crea array de URLs Ãºnicas
   
   - Genera estructura sintÃ©tica:
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

**InvocaciÃ³n**:
```bash
npm run generate:synthetic
```

### 3. **server.js** â€” Ãndice de Esquemas en Runtime

**UbicaciÃ³n**: [server.js](../../server.js#L1912) `/api/esquemas-pos-index`

**Responsabilidad**: Indexar archivos de esquemas_pos_circulos/

**Proceso**:

```javascript
GET /api/esquemas-pos-index

1. First call:
   - Escanea recurivamente esquemas_pos_circulos/
   - Extrae todos los filenames
   - Convierte a minÃºsculas (normalizaciÃ³n)
   - Crea Set para bÃºsqueda O(1)
   - Cachea en memoria: _esquemasPosIndexCache
   
2. Llamadas posteriores:
   - Retorna cachÃ© inmediatamente
   
3. Response:
   {
     "files": ["12v4000m40a-0001-01-50.webp", "12v4000m40a-0001-02-80.webp", ...]
   }
   
   Arrays con ~49,972 elementos
```

**CaracterÃ­sticas**:
- âœ… Una sola vez (cachÃ© en memoria)
- âœ… O(n) construcciÃ³n, O(1) bÃºsquedas posteriores
- âœ… NormalizaciÃ³n de basenames (lowercase)

---

## ðŸ—‚ï¸ Campos de Imagen en engine_*.json

Cada record en engine_*.json contiene estos campos relacionados con imÃ¡genes:

| Campo | Tipo | Ejemplo | PropÃ³sito |
|-------|------|---------|----------|
| `ruta_foto` | URL / null | `https://.../2026/01/0049976736.jpeg` | Enlace a imagen de artÃ­culo |
| `filename_foto` | string / null | `0049976736.jpeg` | Nombre local (informativo) |
| `esquemas` | CSV / null | `12V4000M40A-0001-01.png , 12V4000M40A-0001-02.png` | Esquemas generales (commas con espacios) |
| `esquemas_circulos_all` | CSV / null | Idem | **TODOS** los cÃ­rculos (incluyendo variantes de tamaÃ±o) |
| `esquemas_circulos` | string / null | `12V4000M40A-0001-01-50.webp` | **PRIMER** cÃ­rculo seleccionado |
| `ruta_esquemas_pos` | URL / null | `https://.../2026/02/12V4000M40A-0001-01-50.webp` | Enlace completo al cÃ­rculo |
| **`exp_imagenes`** | CSV / URL | `https://.../0049976736.jpeg, https://.../pos.webp` | **CAMPO FINAL para exportaciÃ³n** |

### Relaciones entre Campos

```
ruta_foto â†’ se genera en depuracion_json.py extrayendo MAPPING
          â†’ basename se almacena en filename_foto
          
esquemas â†’ se proporciona manualmente en catÃ¡logos
        â†’ puede contener mÃºltiples filenames (CSV con ", ")
        
esquemas_circulos â†’ se selecciona de esquemas_circulos_all
                  â†’ se usa para generar ruta_esquemas_pos
                  
ruta_esquemas_pos â†’ se genera combinando base URL + esquemas_circulos
                  â†’ ej: "https://.../" + "12V4000M40A-0001-01-50.webp"
                  
exp_imagenes â†’ se calcula en depuracion_json.py
             â†’ prioridad: ruta_foto > ruta_esquemas_pos > placeholder
             â†’ es el campo FINAL para sincronizaciÃ³n WordPress
```

---

## ðŸ”„ Ciclo de ActualizaciÃ³n de ImÃ¡genes

### Flujo TÃ­pico de ActualizaciÃ³n

```
1. OBTENER imÃ¡genes nuevas
   â”œâ”€ De proveedores (PDF, Excel, SharePoint)
   â””â”€ Copiarlas a fotos_articulos/, esquemas/, esquemas_pos_circulos/
   
2. VALIDAR estructura
   â”œâ”€ Verificar nombres de archivos coinciden con patrones
   â””â”€ Verificar directorios no tienen caracteres especiales
   
3. PROCESAR con depuracion_json.py
   â”œâ”€ python depuracion_json.py
   â””â”€ Calcula measurement_final, exp_imagenes, campos finales
   
4. GENERAR sÃ­ntesis
   â”œâ”€ npm run generate:synthetic
   â””â”€ Crea qa_synthetic_new.json, qa_synthetic_superseded.json
   
5. VALIDAR en milu_qa
   â”œâ”€ Abrir http://localhost:3000/qa_milu.html
   â”œâ”€ Checkear badges OK/MISS/FALTA
   â””â”€ Verificar previews en panels laterales
   
6. REVISAR en milu_qa QA
   â”œâ”€ Comprobar imÃ¡genes aparecer correctamente
   â”œâ”€ Testear filtros has_esquema_pos
   â””â”€ Validar no hay errores en consola
```

### Tiempos Estimados

| Paso | Tiempo | Notas |
|------|--------|-------|
| Copiar archivos | 5-30 min | Depende de volumen y velocidad disk |
| depuracion_json.py | 2-5 min | Procesa 67K registros en paralelo |
| generate:synthetic | 1-2 min | SÃ­ntesis y deduplicaciÃ³n |
| Ãndice esquemas_pos | 30 seg | Se genera automÃ¡tico en primer GET |
| ValidaciÃ³n milu_qa | 5-10 min | Manual, clicking y scrolling |
| **Total** | **15-50 min** | TÃ­pico 20-30 min |

---

## ðŸ“Š VolÃºmenes de Datos

| MÃ©trica | Valor | Notas |
|---------|-------|-------|
| engine_*.json files | 9 | Un archivo por modelo de motor |
| Total registros | 67,883 | ~7K-12K por modelo |
| Registros con foto | ~45,000 | ~66% tienen ruta_foto |
| Registros con esquema_pos | ~52,000 | ~77% tienen ruta_esquemas_pos |
| ImÃ¡genes Ãºnicas (fotos) | ~12,500 | Muchos registros comparten foto |
| ImÃ¡genes Ãºnicas (esquemas) | ~49,972 | Casi Ãºnicos en esquemas_pos_circulos/ |
| **Total imagen references** | ~490,000 | 7-8 campos Ã— 67K |
| TamaÃ±o promedio imagen | 150 KB | JPEG/WebP comprimidas |
| **Total disk images** | ~50-60 GB | Fotos + esquemas generales + pos |

---

## âš ï¸ Problemas Conocidos en Pipeline

### 1. **sin_imagen URL Hardcoded**
- UbicaciÃ³n: [depuracion_json.py](../../depuracion_json.py) lÃ­nea ~34
- Problema: Si dominio cambia, todas las imÃ¡genes perdidas usan URL vieja
- SoluciÃ³n: Hacer URL configurable o usar ruta local

### 2. **No hay ValidaciÃ³n de URLs**
- Problema: depuracion_json.py genera URLs sin verificar si son accesibles
- SoluciÃ³n: Agregar HEAD requests para validaciÃ³n previa

### 3. **DeduplicaciÃ³n Incompleta en SÃ­ntesis**
- Problema: generate_synthetic_exports.js pierde imÃ¡genes de PNs duplicados
- SoluciÃ³n: Agregar todas las imÃ¡genes Ãºnicas al exp_imagenes

### 4. **Espacios en Nombres de Motor**
- Problema: "12V4000 M40A" tiene espacio (conflictivo con URLs)
- UbicaciÃ³n: fotos_motores/
- SoluciÃ³n: Estandarizar a "12V4000M40A" (sin espacios)

### 5. **Sin Versionado de Campos**
- Problema: Si measurement_final o exp_imagenes cambian, no hay historial
- SoluciÃ³n: Agregar timestamps o versiones a campos calculados

---

## âœ… Validaciones Implementadas

- âœ“ Colapso de espacios mÃºltiples
- âœ“ ValidaciÃ³n de estructura JSON
- âœ“ Conteo de errores por registro
- âš ï¸ Matching URL â†” Filesystem (solo en frontend)
- âŒ ValidaciÃ³n de URLs accesibles
- âŒ Integridad referencial (filename_foto vs ruta_foto)

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Basado en commit**: ad1737f0

