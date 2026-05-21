# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Diagramas y Flujos: VisualizaciÃ³n del Sistema

Representaciones visuales de los procesos principales del sistema de imÃ¡genes en MILU.

---

## ðŸ”„ Flujo 1: GeneraciÃ³n de ImÃ¡genes (Offline)

```
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  Fuentes Externas            â”ƒ
â”ƒ - PDFs con imÃ¡genes          â”ƒ
â”ƒ - CatÃ¡logos Excel            â”ƒ
â”ƒ - SharePoint / S3            â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â”œâ”€â†’ ExtracciÃ³n manual
        â”‚   o scripts R
        â”‚
        â†“
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  Almacenamiento Local        â”ƒ
â”ƒ â”œâ”€ fotos_articulos/          â”ƒ
â”ƒ â”œâ”€ fotos_motores/            â”ƒ
â”ƒ â”œâ”€ esquemas/                 â”ƒ
â”ƒ â””â”€ esquemas_pos_circulos/    â”ƒ
â”ƒ   (~50K archivos)            â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â”‚ Procesamiento
        â”‚
        â†“
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  depuracion_json.py          â”ƒ
â”ƒ âœ“ NormalizaciÃ³n              â”ƒ
â”ƒ âœ“ ValidaciÃ³n                 â”ƒ
â”ƒ âœ“ CÃ¡lculo exp_imagenes       â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â†“
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  engine_*.json               â”ƒ
â”ƒ  (9 archivos, 67K items)     â”ƒ
â”ƒ âœ“ ruta_foto                  â”ƒ
â”ƒ âœ“ ruta_esquemas_pos          â”ƒ
â”ƒ âœ“ exp_imagenes (FINAL)       â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â”‚ SÃ­ntesis
        â”‚
        â†“
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  generate_synthetic_exports  â”ƒ
â”ƒ âœ“ Agrupa por PN              â”ƒ
â”ƒ âœ“ Deduplica imÃ¡genes         â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â”œâ”€â†’ qa_synthetic_new.json
        â””â”€â†’ qa_synthetic_superseded.json
```

---

## ðŸŒ Flujo 2: Carga en milu_qa (Startup)

```
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  Usuario abre milu_qa.html   â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â”‚ T=0ms
        â”‚
        â†“
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  Inicia qa_milu.js           â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â”‚ T=0-100ms
        â”‚
        â†“
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  loadPartitionedEngineData() â”ƒ
â”ƒ Promise.all([9 JSONs])       â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â”‚ T=100-200ms
        â”‚
        â†“
â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”“
â”ƒ  state.allData = [67K items] â”ƒ
â”ƒ  Parse + normalizaciÃ³n       â”ƒ
â”—â”â”â”â”â”â”â”â”¬â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”›
        â”‚
        â”‚ T=200ms
        â”‚
        â†“
    â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    â•‘  TABLE APPEARS (sin ESQ_POS info) â•‘
    â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        â”‚
        â”‚ renderTable()
        â”‚ (50 first rows, no badges yet)
        â”‚
        â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
        â”‚                              â”‚
    BLOQUEANTE              NO BLOQUEANTE
        â”‚                              â”‚
        â”‚                          T=200ms
        â”‚                              â”‚
        â†“                              â†“
   applyColumnView()      loadOptionalCatalogs()
   (10-20ms)                  (ASYNC)
                                â”‚
        â”‚                       â”‚ fetch /api/esquemas-pos-index
        â”‚                       â”‚ (50-100ms)
        â”‚                       â”‚
        â”‚                       â†“
        â”‚               Backend indexa
        â”‚               esquemas_pos_circulos/
        â”‚               (~300-500ms, first time)
        â”‚
        â”‚                       â”‚
        â”‚               T=300-400ms
        â”‚                       â”‚
        â”‚                       â†“
        â”‚          state.esquemasPosFileSet
        â”‚               = Set(basenames)
        â”‚                       â”‚
        â”‚                       â†“
        â”‚            renderTable()
        â”‚         (con ESQ_POS info)
        â”‚
        â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                       â”‚
                       â”‚ T=350-450ms
                       â”‚
                       â†“
        â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
        â•‘  TABLA ACTUALIZADA              â•‘
        â•‘  OK/MISS/FALTA badges visible  â•‘
        â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
```

---

## ðŸ“Š Flujo 3: Usuario Selecciona Fila

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ Usuario hace click en fila  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚
               â†“
    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
    â”‚ Evento click en tbodyâ”‚
    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚
               â”œâ”€â†’ Extrae revision-key
               â”‚
               â†“
    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
    â”‚ state.selectedRevisionRowKey  â”‚
    â”‚ = revision-key               â”‚
    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚
               â”œâ”€â†’ refreshSelectedRowVisual()
               â”‚   (Agrega clase row-selected)
               â”‚
               â†“
    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
    â”‚ row = state.allData.find()   â”‚
    â”‚ (busca por revision-key)     â”‚
    â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
               â”‚
               â”œâ”€â†’ renderSelectedRowPosPanel(row)
               â”‚   â”‚
               â”‚   â”œâ”€â†’ getPosSchemasForRow(row)
               â”‚   â”‚   (procesa 3 campos)
               â”‚   â”‚
               â”‚   â”œâ”€â†’ buildPosStrip()
               â”‚   â”‚   (renderiza HTML con imÃ¡genes)
               â”‚   â”‚
               â”‚   â””â”€â†’ setSchemaImageSource()
               â”‚       (setea src de img)
               â”‚
               â”œâ”€â†’ updateSchemasInline(book, page)
               â”‚   (actualiza panel 1)
               â”‚
               â””â”€â†’ dispatchSelectionChanged()
                   (eventos personalizados)
                   
               â†“
    â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
    â•‘  PANELS LATERALES UPDATES   â•‘
    â•‘  (imÃ¡genes de posiciÃ³n)     â•‘
    â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
```

---

## ðŸ” Flujo 4: ValidaciÃ³n ESQ_POS (getEsquemaPosStatus)

```
Input: row
  â”‚
  â”œâ”€â†’ getPosSchemasForRow(row)
  â”‚   â”‚
  â”‚   â”œâ”€â†’ Procesa ruta_esquemas_pos
  â”‚   â”‚   â””â”€â†’ splitSchemaTokens() â†’ ["URL1", "URL2", ...]
  â”‚   â”‚
  â”‚   â”œâ”€â†’ Procesa exp_imagenes (NUEVO)
  â”‚   â”‚   â””â”€â†’ splitSchemaTokens() â†’ ["URL1", "URL2", ...]
  â”‚   â”‚
  â”‚   â”œâ”€â†’ Procesa esquemas_circulos
  â”‚   â”‚   â””â”€â†’ splitSchemaTokens() â†’ ["URL1", "URL2", ...]
  â”‚   â”‚
  â”‚   â””â”€â†’ Retorna:
  â”‚       [
  â”‚         { label: "img1", candidates: [4 variantes] },
  â”‚         { label: "img2", candidates: [4 variantes] },
  â”‚         ...
  â”‚       ]
  â”‚
  â”œâ”€â†’ Si posItems.length === 0
  â”‚   â””â”€â†’ Retorna 'empty'
  â”‚
  â”œâ”€â†’ Para cada posItem:
  â”‚   â”‚
  â”‚   â””â”€â†’ Para cada candidate:
  â”‚       â”‚
  â”‚       â”œâ”€â†’ basename(candidate)
  â”‚       â”‚   â””â”€â†’ extrae filename
  â”‚       â”‚   â””â”€â†’ lowercase
  â”‚       â”‚   â””â”€â†’ decode URL
  â”‚       â”‚
  â”‚       â””â”€â†’ state.esquemasPosFileSet.has(basename)
  â”‚           â””â”€â†’ O(1) bÃºsqueda en Set
  â”‚
  â”œâ”€â†’ Si ANY existe en Set
  â”‚   â””â”€â†’ Retorna 'ok' âœ…
  â”‚
  â””â”€â†’ Si NONE existe en Set
      â””â”€â†’ Retorna 'missing' âŒ

Output: 'ok' | 'missing' | 'empty'
```

---

## ðŸ“¤ Flujo 5: CÃ¡lculo de exp_imagenes (depuracion_json.py)

```
Input: record
  â”‚
  â”œâ”€â†’ Inicializa: imagenes = []
  â”‚
  â”œâ”€â†’ Â¿Tiene ruta_foto?
  â”‚   â”‚
  â”‚   â”œâ”€ SÃ:
  â”‚   â”‚   â”œâ”€â†’ Â¿Es placeholder?
  â”‚   â”‚   â”‚   â”‚
  â”‚   â”‚   â”‚   â”œâ”€ NO:
  â”‚   â”‚   â”‚   â”‚   â””â”€â†’ imagenes.append(ruta_foto)
  â”‚   â”‚   â”‚   â”‚
  â”‚   â”‚   â”‚   â””â”€ SÃ:
  â”‚   â”‚   â”‚       â””â”€â†’ (ignorar)
  â”‚   â”‚   â”‚
  â”‚   â”‚   â””â”€â†’ logging
  â”‚   â”‚
  â”‚   â””â”€ NO:
  â”‚       â””â”€â†’ (siguiente)
  â”‚
  â”œâ”€â†’ Â¿Tiene ruta_esquemas_pos?
  â”‚   â”‚
  â”‚   â”œâ”€ SÃ:
  â”‚   â”‚   â”œâ”€â†’ Â¿Es placeholder?
  â”‚   â”‚   â”‚   â”‚
  â”‚   â”‚   â”‚   â”œâ”€ NO:
  â”‚   â”‚   â”‚   â”‚   â””â”€â†’ imagenes.append(ruta_esquemas_pos)
  â”‚   â”‚   â”‚   â”‚
  â”‚   â”‚   â”‚   â””â”€ SÃ:
  â”‚   â”‚   â”‚       â””â”€â†’ (ignorar)
  â”‚   â”‚   â”‚
  â”‚   â”‚   â””â”€â†’ logging
  â”‚   â”‚
  â”‚   â””â”€ NO:
  â”‚       â””â”€â†’ (siguiente)
  â”‚
  â”œâ”€â†’ Â¿imagenes[] tiene elementos?
  â”‚   â”‚
  â”‚   â”œâ”€ SÃ:
  â”‚   â”‚   â””â”€â†’ exp_imagenes = ", ".join(imagenes)
  â”‚   â”‚       (URL, URL, URL)
  â”‚   â”‚
  â”‚   â””â”€ NO:
  â”‚       â””â”€â†’ exp_imagenes = DEFAULT_PLACEHOLDER
  â”‚           "https://...sin_imagen.jpeg"
  â”‚
  â””â”€â†’ record['exp_imagenes'] = exp_imagenes

Output: record con exp_imagenes calculado
```

---

## ðŸ”— Flujo 6: ConstrucciÃ³n de Candidatos

```
Input: buildSchemaPosImageCandidates(book="12V4000M40A", rawToken="...")
  â”‚
  â”œâ”€â†’ extractFileNameFromPath(rawToken)
  â”‚   â””â”€â†’ "https://.../12V4000M40A-0001-01-50.webp" â†’ "12V4000M40A-0001-01-50.webp"
  â”‚
  â”œâ”€â†’ stripFileExtension()
  â”‚   â””â”€â†’ "12V4000M40A-0001-01-50.webp" â†’ "12V4000M40A-0001-01-50"
  â”‚
  â”œâ”€â†’ Extrae extensiÃ³n
  â”‚   â””â”€â†’ "webp"
  â”‚
  â”œâ”€â†’ Define nombres:
  â”‚   â”œâ”€ "12V4000M40A-0001-01-50"  (como estÃ¡)
  â”‚   â””â”€ "12v4000m40a-0001-01-50"  (lowercase, si no comienza con book_lower)
  â”‚
  â”œâ”€â†’ Define extensiones:
  â”‚   â”œâ”€ Si tiene extensiÃ³n â†’ usar esa sola
  â”‚   â””â”€ Si no â†’ intentar: ["webp", "png", "jpg", "jpeg"]
  â”‚
  â”œâ”€â†’ Para cada (nombre, extensiÃ³n):
  â”‚   â”‚
  â”‚   â””â”€â†’ esquemas_pos_circulos/{BOOK}-POS/{nombre}.{ext}
  â”‚
  â””â”€â†’ Retorna: [candidato1, candidato2, candidato3, ...]

Output: Array de 4-8 candidatos (paths locales)
```

---

## âš™ï¸ Flujo 7: Error Handling en Fallback de ImÃ¡genes

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚ img.src = URL0  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”˜
         â”‚
    â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
    â”‚ Browser intenta cargar URL â”‚
    â””â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
             â”‚
         â”Œâ”€â”€â”€â”´â”€â”€â”€â”
         â”‚       â”‚
       OK?     ERROR?
         â”‚       â”‚
         â†“       â†“
       âœ…      âŒ
      Done    img.onerror dispara
                   â”‚
                   â”œâ”€â†’ currentIdx = 0
                   â”‚
                   â”œâ”€â†’ nextIdx = currentIdx + 1
                   â”‚
                   â”œâ”€â†’ Â¿nextIdx < candidates.length?
                   â”‚   â”‚
                   â”‚   â”œâ”€ SÃ:
                   â”‚   â”‚   â”œâ”€â†’ link.href = candidates[nextIdx]
                   â”‚   â”‚   â”œâ”€â†’ img.src = candidates[nextIdx]
                   â”‚   â”‚   â”‚
                   â”‚   â”‚   â””â”€â†’ img.onerror dispara NUEVAMENTE
                   â”‚   â”‚       (cascada en serie)
                   â”‚   â”‚
                   â”‚   â””â”€ NO:
                   â”‚       â”œâ”€â†’ No hay mÃ¡s candidatos
                   â”‚       â””â”€â†’ link.remove()
                   â”‚           (elimina del DOM)
```

---

## Diagrama Mermaid: Proceso Completo de Startup

```mermaid
graph TD
    A["Usuario abre milu_qa.html"] -->|T=0ms| B["Inicia qa_milu.js"]
    B -->|Promise.all| C["Fetch 9 JSONs en paralelo"]
    C -->|T=0-150ms| D["Parse + normalizar"]
    D -->|T=150ms| E["renderTable<br/>50 filas, sin ESQ_POS"]
    E -->|T=150-200ms| F["applyColumnView<br/>Tabla visible al usuario"]
    
    F -->|No bloqueante| G["loadOptionalCatalogs<br/>ASYNC"]
    G -->|T=200ms| H["Fetch /api/esquemas-pos-index"]
    H -->|T=200-300ms| I["Backend indexa<br/>esquemas_pos_circulos/"]
    I -->|~50K archivos| J["Genera Set basenames"]
    J -->|T=300-400ms| K["state.esquemasPosFileSet<br/>poblado"]
    K -->|T=300-400ms| L["renderTable CON ESQ_POS"]
    L -->|T=300-450ms| M["Tabla actualizada<br/>Badges OK/MISS/FALTA visibles"]
    
    style F fill:#90EE90
    style M fill:#90EE90
```

---

## Diagrama Mermaid: Flujo de Filtros y PaginaciÃ³n

```mermaid
graph TD
    A["Usuario cambia filtro"] -->|event| B["applyFilters"]
    B -->|itera state.allData| C["Para cada row:<br/>Checkea valor vs filtro"]
    C -->|has_esquema_pos| D["getEsquemaPosStatus<br/>OK/MISS/FALTA"]
    D -->|retorna| E["filtered array"]
    
    E -->|next| F["sortData<br/>sorted array"]
    F -->|next| G["Pagina:<br/>slice start, end"]
    G -->|pageData = 50 rows| H["renderTable<br/>tbody.innerHTML = '...'"]
    H -->|HTML string| I["DOM reflow/repaint"]
    I -->|visible| J["Tabla actualizada"]
    
    J -->|background| K["scheduleVisiblePosCirclePreload<br/>requestIdleCallback"]
    K -->|max 6 paralelo| L["Pre-carga imÃ¡genes<br/>en background"]
    
    style H fill:#FFB6C1
    style J fill:#90EE90
```

---

## Diagrama Mermaid: ResoluciÃ³n de Candidatos de Imagen

```mermaid
graph TD
    A["getPosSchemasForRow<br/>procesa 3 campos"] -->|ruta_esquemas_pos| B["splitSchemaTokens"]
    A -->|exp_imagenes| C["splitSchemaTokens"]
    A -->|esquemas_circulos| D["splitSchemaTokens"]
    
    B -->|para cada token| E["mergeItem"]
    C -->|para cada token| E
    D -->|para cada token| E
    
    E -->|extractFileNameFromPath| F["basename"]
    E -->|stripFileExtension| G["label"]
    E -->|buildSchemaPosImageCandidates| H["Genera 4-8 variantes"]
    
    H -->|deduplicaciÃ³n| I["Agrega a Map<br/>por label"]
    
    I -->|retorna| J["Array de items<br/>label + candidates"]
    J -->|cada item| K["{ label, candidates[] }"]
    
    style J fill:#87CEEB
```

---

## Diagrama ASCII: Stack de TecnologÃ­as

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚          BROWSER (Frontend)              â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  qa_milu.html (estructura)              â”‚
â”‚  + qa-milu.js (entry point)             â”‚
â”‚  + qa-table.js (rendering + filtros)    â”‚
â”‚  + schemas.js (image resolution)        â”‚
â”‚  + state.js (global state)              â”‚
â”‚  + pos-preload.js (background loading)  â”‚
â”‚  + styles/qa_milu.css (estilos)        â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â†• HTTP/AJAX
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚        NODE.JS BACKEND (Express)         â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  server.js                              â”‚
â”‚  + GET /api/esquemas-pos-index          â”‚
â”‚  + GET /save-json.php                   â”‚
â”‚  + GET /qa_revision_sync.php            â”‚
â”‚  + Static file serving                  â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
              â†• Filesystem I/O
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚           FILESYSTEM (Local)             â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚  engine_*.json (9 archivos)             â”‚
â”‚  fotos_articulos/ (~12K imÃ¡genes)       â”‚
â”‚  esquemas_pos_circulos/ (~50K imÃ¡genes) â”‚
â”‚  qa_revision_server_data.json           â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Diagrama ASCII: Campos de Imagen en JSON Record

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚              Engine JSON Record                            â”‚
â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤
â”‚                                                            â”‚
â”‚  ID: "123456"                                             â”‚
â”‚  PART NO.: "ABC-789"                                      â”‚
â”‚  engine_model: "12V4000M40A"                              â”‚
â”‚                                                            â”‚
â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â” â”‚
â”‚  â”‚ CAMPOS DE IMAGEN                                    â”‚ â”‚
â”‚  â”œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¤ â”‚
â”‚  â”‚                                                     â”‚ â”‚
â”‚  â”‚  ruta_foto (URL)                                   â”‚ â”‚
â”‚  â”‚  â””â”€â†’ "https://.../0049976736.jpeg"                 â”‚ â”‚
â”‚  â”‚                                                     â”‚ â”‚
â”‚  â”‚  filename_foto (string)                            â”‚ â”‚
â”‚  â”‚  â””â”€â†’ "0049976736.jpeg"                             â”‚ â”‚
â”‚  â”‚                                                     â”‚ â”‚
â”‚  â”‚  esquemas (CSV)                                    â”‚ â”‚
â”‚  â”‚  â””â”€â†’ "12V4000M40A-0001-01.png, 12V4000M40A-0001-02.png" â”‚
â”‚  â”‚                                                     â”‚ â”‚
â”‚  â”‚  esquemas_circulos (string)                        â”‚ â”‚
â”‚  â”‚  â””â”€â†’ "12V4000M40A-0001-01-50.webp"                 â”‚ â”‚
â”‚  â”‚                                                     â”‚ â”‚
â”‚  â”‚  ruta_esquemas_pos (URL)                           â”‚ â”‚
â”‚  â”‚  â””â”€â†’ "https://.../12V4000M40A-0001-01-50.webp"     â”‚ â”‚
â”‚  â”‚                                                     â”‚ â”‚
â”‚  â”‚  â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”  â”‚ â”‚
â”‚  â”‚  â”‚ exp_imagenes (CSV URLs) â† CAMPO FINAL        â”‚  â”‚ â”‚
â”‚  â”‚  â”‚ "https://.../0049976736.jpeg,                â”‚  â”‚ â”‚
â”‚  â”‚  â”‚  https://.../12V4000M40A-0001-01-50.webp"    â”‚  â”‚ â”‚
â”‚  â”‚  â”‚  â†‘                                            â”‚  â”‚ â”‚
â”‚  â”‚  â”‚  Usado en WordPress export                   â”‚  â”‚ â”‚
â”‚  â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜  â”‚ â”‚
â”‚  â”‚                                                     â”‚ â”‚
â”‚  â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜ â”‚
â”‚                                                            â”‚
â”‚  Otros campos (PN, weight, norm, error_list, etc...)   â”‚
â”‚                                                            â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

---

## Timeline: Toda una SesiÃ³n TÃ­pica

```
T=0s      â”‚ Usuario abre milu_qa.html
          â”‚
T=0.1s    â”‚ Tabla visible (50 filas)
          â”‚ Badges aÃºn muestran "FALTA" (por defecto)
          â”‚
T=0.3s    â”‚ Tabla actualizada con ESQ_POS correcto
          â”‚ OK/MISS badges aparecen
          â”‚
T=0.3-1s  â”‚ Pre-carga background de 6 imÃ¡genes
          â”‚
T=1s      â”‚ Sistema completamente cargado
          â”‚ Usuario puede interactuar
          â”‚
T=1.5s    â”‚ Usuario hace click en fila
          â”‚ Panel lateral renderiza imÃ¡genes
          â”‚
T=1.5-2s  â”‚ Lazy loading de imÃ¡genes en viewport
          â”‚
T=2-10s   â”‚ Usuario scrollea, filtra, cambia pÃ¡gina
          â”‚ Cada cambio: 50-100ms renderTime
          â”‚ ImÃ¡genes cargan bajo demanda (lazy)
          â”‚
T=10s     â”‚ Si alguna imagen falla:
          â”‚ Intenta candidato 2 (1s espera)
          â”‚ Si tambiÃ©n falla: candidato 3 (1s)
          â”‚ Max 4 intentos = 4s timeout
          â”‚
T=30s+    â”‚ SesiÃ³n continÃºa...
          â”‚ Memory footprint: ~15-30 MB
```

---

**Ãšltima actualizaciÃ³n**: May 11, 2026  
**Basado en commit**: ad1737f0

