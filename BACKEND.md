# MILU Backend Documentation

## Overview

El backend de MILU es un servidor Express.js que proporciona API REST para:

- **Persistencia de datos**: Guardar cambios en archivos `engine_*.json`
- **Sincronización de revisiones**: Manage QA revision states y actions
- **Exportación de datos**: Pipeline para WordPress, análisis y reportes
- **Comparación PDF**: Extracción de datos desde PDFs y validación contra engine data
- **Auditoría**: Logging de cambios y operaciones
- **Servicio de archivos estáticos**: Frontend HTML, JS, CSS

## Architecture

### Punto de Entrada

- **[server.js](server.js)**: Servidor Express principal
  - Puerto: `3000` (por defecto)
  - Carga configuración de archivos engines desde `engine_files.js`
  - Inicializa middleware y routes
  - Maneja conexión con filesystem para persistencia

### Structure

```
├── server.js                          # Express server principal
├── engine_files.js                    # Configuración de engines
├── recompute_engine_errors.js         # Recálculo de flags QA
├── apply_revision_to_engines.js       # Aplicación de revisiones masivas
├── scripts/
│   ├── export_wordpress_milu.js       # Pipeline WordPress
│   ├── qa_pdf_compare.js              # Comparación PDF
│   ├── prepare-pages-dist.js          # Preparación para GitHub Pages
│   ├── publish-pages.ps1              # Publicación automatizada
│   └── ...
├── qa_revision_server_data.json       # Persistencia de revisiones
├── qa_audit_log.json                  # Log de auditoría
└── engine_*.json                      # Data principal (9 archivos)
```

## Express Server (server.js)

### Middleware Stack

```javascript
// Orden importante:
1. bodyParser.json()              // Parse JSON bodies
2. cors()                         // CORS habilitado
3. Rutas especiales (/qa_revision_sync.php, /save-json, etc.)
4. express.static()               // Servir archivos estáticos
```

### Key Middleware

- **body-parser**: `Content-Type: application/json`
- **CORS**: Permite requests desde cualquier origen
- **Static files**: Sirve desde `.` (root)

### Health Check

```
GET /health
Response: { "status": "ok" }
```

Verifica:
- Conexión backend activa
- Fileystem accesible
- Endpoints disponibles

## Core Endpoints

### 1. Save JSON (`POST /save-json`)

Guarda un cambio puntual en un campo de un registro.

**Request**:
```json
{
  "field": "DESIGNATION",
  "value": "New Designation",
  "rowKey": "engine_12V4000M53:5:A123456",
  "engineFile": "engine_12V4000M53.json"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Saved successfully",
  "updatedField": "DESIGNATION"
}
```

**Implementación**:
- Valida `rowKey` y `engineFile`
- Lee archivo JSON actual
- Encuentra registro por clave
- Actualiza campo específico
- Escribe archivo actualizado
- Registra en audit log
- Recalcula flags QA (`has_error`, `pos_error`, etc.)

### 2. Apply Revision to Engines (`POST /apply-revision-to-engines`)

Aplica cambios masivos a múltiples registros (revisiones).

**Request**:
```json
{
  "updates": [
    {
      "rowKey": "engine_12V4000M53:5:A123456",
      "engineFile": "engine_12V4000M53.json",
      "updates": {
        "qa_revision_estado": "aprobado",
        "qa_revision_accion": "Import"
      }
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "updatedCount": 1,
  "failedUpdates": []
}
```

**Implementación**:
- Recibe array de actualizaciones
- Para cada registro:
  - Valida claves
  - Lee archivo
  - Actualiza múltiples campos
  - Normaliza estados/acciones si es necesario
- Escribe cambios a disco
- Retorna summary

### 3. Revision Sync (`GET/POST /qa_revision_sync.php`)

Sincroniza cambios de revisión entre frontend y servidor.

**GET** - Obtener revisiones remotas:
```
GET /qa_revision_sync.php
Response: {
  "revisions": {
    "revision_key_1": { "estado": "aprobado", "accion": "Import" },
    ...
  }
}
```

**POST** - Enviar cambios locales:
```json
{
  "updates": {
    "revision_key_1": { "estado": 1, "accion": "Import" },
    ...
  }
}
```

**Persistencia**:
- Lee/escribe [qa_revision_server_data.json](qa_revision_server_data.json)
- Formato: `{ revision_key: { estado, accion, timestamp } }`
- Sincronización bidireccional con frontend

### 4. PN Review QA Decision (`GET /qa_pn_review/:filename/:pn`)

Obtiene decisión QA para un PN específico.

**Response**:
```json
{
  "pn": "A123456",
  "status": "ok",
  "decision": "aprobado",
  "action": "Import",
  "summary": { ... }
}
```

## Scripts Node.js

### export_wordpress_milu.js

Pipeline oficial para exportación a WordPress.

**Ejecución**:
```bash
npm run export:wordpress
```

**Responsabilidades**:
1. Lee los 9 `engine_*.json`
2. Agrupa registros por PN (Part Number)
3. Aplica reglas de decisión basadas en:
   - `qa_revision_estado` (estado de aprobación)
   - `qa_revision_accion` (acción: Import, Supersede, etc.)
4. Genera outputs:
   - `milu_wp_import.csv`: Registros listos para importar
   - `milu_wp_discarded.csv`: Registros descartados
   - `milu_wp_pending_review.csv`: Pendientes revisión
   - `milu_wp_import.json`: Version JSON para referencia
   - `milu_wp_export_summary.md`: Resumen ejecutivo

**Funciones Clave**:
- `decideByQa(rows)`: Decide si un PN se exporta
- `buildMergedFields(rows)`: Consolida datos por PN
- `buildPnValidation(sku, rows)`: Valida completitud datos
- `buildMappedSourceRow(row)`: Mapea campos para export

**Decision Rules**:
```
qa_revision_estado == "aprobado" && qa_revision_accion == "Import"
  → EXPORT a WordPress
qa_revision_accion == "Supersede"
  → Marcar como supersedido
qa_revision_estado == "rechazado"
  → DISCARD
Otros
  → PENDING REVIEW
```

### qa_pdf_compare.js

Herramienta de comparación PDF vs datos JSON.

**Ejecución**:
```bash
npm run qa:pdf-compare
npm run qa:pdf-compare:write    # Actualiza engine_*.json con datos PDF
```

**Responsabilidades**:
1. Carga archivo PDF especificado
2. Extrae datos con OCR/parsing
3. Compara contra registro en `engine_*.json`
4. Identifica discrepancias
5. Opcionalmente actualiza campos `*_pdf` en engine data

**Output**:
```
qa_pdf_compare_<engine>_<timestamp>.json
{
  "engine": "engine_12V4000M53",
  "source_pdf": "...",
  "extracted_fields": { ... },
  "comparisons": [
    {
      "field": "DESIGNATION",
      "json_value": "...",
      "pdf_value": "...",
      "match": false
    }
  ]
}
```

### prepare-pages-dist.js

Prepara la carpeta `dist/milu_publish/` para GitHub Pages.

**Ejecución**:
```bash
npm run pages:prepare:incremental    # Recomendado (solo cambios)
npm run pages:prepare                # Full copy (reset + copy all)
npm run pages:prepare:incremental:dry # Preview sin cambios
```

**Responsabilidades**:
1. Copia HTML principal: `qa_milu.html` → `dist/milu_publish/`
2. Copia directorios:
   - `js/` → `dist/milu_publish/js/`
   - `styles/` → `dist/milu_publish/styles/`
   - `esquemas/`, `esquemas_pos_circulos/`
3. Copia archivos de datos:
   - `engine_*.json`
   - `MILU_New_v506.json`, `MILU_Superseded_v506.json`
   - `product-export-*.json`
4. Actualiza `CNAME` (dominio personalizado)
5. En modo `--incremental`: Solo copia cambios (más rápido)

**Output**: `dist/milu_publish/` lista para GitHub Pages

### Otros Scripts

- **recompute_engine_errors.js**: Recalcula flags de error por registro
  - Evaluado por endpoint `/save-json` automáticamente
  - Genera: `pos_error`, `pn_error`, `designation_error`, etc.
  - Suma: `total_error`, `has_error`

- **apply_revision_to_engines.js**: Aplica revisiones masivas
  - Usado por endpoint `/apply-revision-to-engines`
  - Normaliza estados y acciones
  - Valida claves de revisión

## Data Models

### Engine Record Structure

```javascript
{
  "ID": "row_identifier",
  "engine_model": "12V4000M53",
  "source_file": "PDF path",
  "Source Page": "page number",
  
  // Main fields
  "POS": "position",
  "PART NO.": "A123456",
  "DESIGNATION": "Cylinder head",
  "MEASUREMENT / STANDARD": "A 200 X 50",
  "WEIGHT": "5.5",
  "NORMA": "DIN 123",
  
  // Final fields (calculated/merged)
  "pos_final": "normalized position",
  "pn_final": "A123456",
  "designation_final": "picked from multiple sources",
  "measure_final": "merged measurement",
  "weight_final": "merged weight",
  
  // PDF extracted fields
  "pos_pdf": "from PDF",
  "pn_pdf": "from PDF",
  "designation_pdf": "from PDF",
  
  // GESA fields
  "designation_gesa": "from GESA",
  "dimensions_gesa": "from GESA",
  "weight_gesa": "from GESA",
  
  // QA flags
  "pos_error": 0 or 1,
  "pn_error": 0 or 1,
  "designation_error": 0 or 1,
  "weight_error": 0 or 1,
  "measurement_error": 0 or 1,
  "total_error": number,
  "has_error": true or false,
  
  // Revision fields
  "qa_revision_estado": "aprobado" / "pendiente_revision" / "rechazado",
  "qa_revision_accion": "Sin_accion" / "Import" / "Supersede" / ...,
  
  // Substitution fields
  "sust_status": "status",
  "sust_hierarchie": "hierarchy",
  "sust_new_part_number": "replacement PN",
  "sust_superseded_list": "list of superseded PNs"
}
```

### Revision Sync Format

```javascript
// qa_revision_server_data.json
{
  "revision_key_1": {
    "estado": "aprobado",
    "accion": "Import",
    "timestamp": 1714900000000
  },
  ...
}
```

**Revision Key Format**: `engine_name:position:pn`
- Ej: `engine_12V4000M53:5:A123456`

### Audit Log

```javascript
// qa_audit_log.json
[
  {
    "timestamp": 1714900000000,
    "action": "save_json",
    "field": "DESIGNATION",
    "rowKey": "engine_12V4000M53:5:A123456",
    "engineFile": "engine_12V4000M53.json",
    "oldValue": "Old Designation",
    "newValue": "New Designation",
    "success": true
  },
  ...
]
```

**Límite**: Max 10,000 entries (rotación automática)

## Utility Functions

### Text Normalization

```javascript
normalizeText(value)        // trim + null handling
lowerKey(value)            // normalize + toLowerCase
collapseSpaces(value)      // collapse multiple spaces to one
splitCsvUnique(value)      // split CSV, trim, deduplicate
pnKey(value)               // normalize PN for comparison
```

### Data Extraction

```javascript
getRowPn(row)              // Extract PN from multiple sources
getRowDesignation(row)     // Pick best designation
getRowMeasure(row)         // Pick best measurement
getRowWeight(row)          // Pick best weight
pickMostFrequent(values)   // Vote-based value selection
```

### Validation

```javascript
buildPnValidation(sku, rows)      // Check PN completeness
buildMergedFields(rows)            // Consolidate fields by PN
rowHasAnySust(row)                 // Check for substitution data
```

## Data Flow

### Edit Cell

```
Frontend: POST /save-json
  {field, value, rowKey, engineFile}
  ↓
server.js: validateEdit()
  ↓
readJsonSafe(engineFile)
  ↓
findRecordByRowKey()
  ↓
updateField(record, field, value)
  ↓
recomputeEngineErrors(record)  // Recalc error flags
  ↓
fs.writeFileSync(engineFile)
  ↓
appendAuditLog()
  ↓
Response: {success, updatedField}
```

### Publish Revision

```
Frontend: POST /qa_revision_sync.php
  {updates: { revision_key: {estado, accion} }}
  ↓
server.js: handleRevisionSync()
  ↓
readJsonSafe(REVISION_SYNC_FILE)
  ↓
Merge updates into revision data
  ↓
fs.writeFileSync(qa_revision_server_data.json)
  ↓
Response: {success}
```

### Export WordPress

```
User: npm run export:wordpress
  ↓
scripts/export_wordpress_milu.js starts
  ↓
loadEngineData() - Read all 9 engine_*.json
  ↓
groupByPn() - Aggregate records per PN
  ↓
For each PN group:
  - decideByQa() → Decide action (Export/Discard/Pending)
  - buildMergedFields() → Consolidate data
  - buildPnValidation() → Check completeness
  ↓
Write outputs:
  - data/output/wordpress/milu_wp_import.csv
  - data/output/wordpress/milu_wp_discarded.csv
  - data/output/wordpress/milu_wp_pending_review.csv
  - data/output/wordpress/milu_wp_import.json
  - data/output/wordpress/milu_wp_export_summary.md
```

## Recent Changes (May 2026)

### Backend Enhancements

1. **PDF Compare Improvements**
   - Better PDF data extraction
   - Timestamp-based results tracking
   - Mapping of PDF fields to standardized names

2. **WordPress Export Refactor**
   - QA-first decision logic (`qa_revision_estado` + `qa_revision_accion`)
   - Conflict detection (designation/weight/measure conflicts)
   - Source row mapping for traceability
   - CSV + JSON outputs

3. **PN Review Embedded**
   - New endpoint: `GET /qa_pn_review/:filename/:pn`
   - Caching with fingerprinting (file mtime + size)
   - Payload structure for QA decisions

4. **Audit Log**
   - All changes logged with timestamp
   - Rotation at 10,000 entries
   - Searchable format

## Error Handling

### File Operations

```javascript
readJsonFileSafe(filePath, fallback)
  - Try-catch wraps fs.readFileSync + JSON.parse
  - Returns fallback if error

writeJsonSafe(filePath, data)
  - Ensures directory exists
  - Writes with formatting
  - Logs errors without throwing
```

### Validation

```javascript
// Row key format: "engine_name:position:pn"
isValidRowKey(rowKey)
  - Check format
  - Verify engine file exists
  - Validate position is numeric

// Check field editability
isEditableField(fieldName)
  - Whitelist of editable fields
  - Prevent system field changes
```

## Configuration

### Engine Files

Defined in [engine_files.js](engine_files.js):
```javascript
const ENGINE_JSON_FILES = [
  'engine_12V4000M40A.json',
  'engine_12V4000M53.json',
  'engine_12V4000M70.json',
  'engine_16V4000M61.json',
  'engine_16V4000M73.json',
  'engine_16V4000M73L.json',
  'engine_16V4000M90.json',
  'engine_20V4000M93.json',
  'engine_20V4000M93L.json'
];
```

### Paths

```javascript
REPO_ROOT = path.resolve(__dirname)
WORDPRESS_OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'output', 'wordpress')
AUDIT_LOG_FILE = path.join(REPO_ROOT, 'qa_audit_log.json')
REVISION_SYNC_FILE = path.join(REPO_ROOT, 'qa_revision_server_data.json')
```

## Performance

### File I/O

- Synchronous writes: `fs.writeFileSync()` for safety/ordering
- Reads are buffered by Node.js filesystem
- No database: All operations are file-based

### Memory

- Engine data loaded once on server start (if needed)
- Revision sync keeps minimal in-memory cache
- PDF compare processes one PDF at a time

### Scaling Considerations

- Current design: ~9 engine files × 500-1000 records each
- Audit log rotation at 10,000 entries
- For larger datasets, consider:
  - Database migration (SQLite/PostgreSQL)
  - Caching layer for frequently accessed data
  - Async writes for non-critical operations

## Development

### Adding a New Endpoint

1. Create route handler in `server.js`:
   ```javascript
   app.post('/my-endpoint', (req, res) => {
       // Validate input
       // Read data
       // Process
       // Write if needed
       // Return JSON response
   });
   ```

2. Follow error handling pattern:
   ```javascript
   try {
       // logic
       res.json({ success: true });
   } catch (error) {
       console.error(error);
       res.status(500).json({ success: false, error: error.message });
   }
   ```

### Adding a New Script

1. Create file in `scripts/` directory
2. Use CommonJS for Node.js compatibility
3. Export main function and utilities
4. Add npm script to `package.json`:
   ```json
   "my-script": "node scripts/my_script.js"
   ```

### Testing Changes

```bash
# Start server
node server.js

# Test endpoint
curl -X POST http://localhost:3000/health

# Check audit log
cat qa_audit_log.json

# Verify engine data
jq '.[:1]' engine_12V4000M53.json
```

---

**Última actualización**: Mayo 5, 2026
**Stack**: Node.js + Express + Filesystem
**Mantenedor**: Equipo MILU
