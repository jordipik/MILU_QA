# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# MILU Frontend Documentation

## Overview

El frontend de MILU es una aplicaciÃ³n web moderna basada en mÃ³dulos ES6+ sin framework, con arquitectura modular y estado global centralizado. Proporciona una interfaz completa para:

- **RevisiÃ³n QA**: ValidaciÃ³n y revisiÃ³n de datos tÃ©cnicos de motores en tablas interactivas
- **VisualizaciÃ³n PDF**: Visor de PDFs integrado con zoom, bÃºsqueda y selecciÃ³n de contenido
- **GestiÃ³n de revisiones**: Sistema de revisiÃ³n con estados (`revision_estado`, `revision_accion`)
- **Export WordPress**: Pipeline QA para exportaciÃ³n de datos
- **PN Review**: Sistema de revisiÃ³n de nÃºmeros de parte (Part Numbers)
- **EdiciÃ³n de celdas**: EdiciÃ³n inline con cambios persistidos al servidor

## Architecture

### Punto de Entrada

- **[qa_milu.html](qa_milu.html)**: HTML principal que carga todos los mÃ³dulos JS
- Implementa acceso modular con `import { ... } from './js/module.js'`
- CSS integrado + referencias a archivos de estilos externos

### Flujo de InicializaciÃ³n

1. HTML carga mÃ³dulos principales: `state.js`, `data-loader.js`, `qa-checks.js`
2. Se carga `qa-milu.js` como mÃ³dulo de entrada
3. Se inicializa estado global y carga datos de `engine_*.json`
4. Se renderizan tablas, PDF y controles de UI
5. Se suscriben listeners a cambios globales

## State Management

### Estado Global ([state.js](js/state.js))

Objeto singleton importado por todos los mÃ³dulos. Contiene:

```javascript
{
    allData: [],              // Todos los registros cargados
    filteredData: [],         // Registros tras filtros
    tableMode: 'qa',          // Modo actual: 'qa', 'grouped', etc.
    currentPage: 1,           // PÃ¡gina actual tabla
    pageSize: 50,             // Registros por pÃ¡gina
    sortKey: 'book_page_pos', // Campo de ordenamiento
    sortAsc: true,            // DirecciÃ³n ordenamiento
    filters: {},              // Filtros activos
    columnView: 'pdf',        // Vista columnas: 'pdf', 'pos'
    selectedRevisionRowKey: '',// Fila seleccionada en revisiones
    currentPdfZoom: 100,      // Zoom actual PDF
    currentPdfPage: 1,        // PÃ¡gina actual PDF
    // ... y muchos mÃ¡s campos
}
```

**Principio**: Todos los mÃ³dulos leen y modifican este objeto directamente. Cambios en `state` no disparan re-renders automÃ¡ticos; se usan funciones explÃ­citas para actualizar UI cuando es necesario.

## Core Modules

### Data Loading ([data-loader.js](js/data-loader.js))

Responsabilidades:
- Cargar datos de los 9 archivos `engine_*.json` del backend
- Normalizar y validar estructura de datos
- Implementar persistencia con endpoints:
  - `POST /save-json`: Guardar cambio puntual en un campo
  - `POST /apply-revision-to-engines`: Aplicar revisiones masivas
  - `GET /health`: Validar conexiÃ³n backend
- GestiÃ³n de catÃ¡logos secundarios (MILU_New, MILU_Superseded, etc.)

**Funciones clave**:
- `loadPartitionedEngineData()`: Carga todos los datos engines en `state.allData`
- `saveCellToServer(field, value, rowKey)`: Persiste un cambio
- `fetchJsonSafe(url)`: Fetch robusto con fallback

### QA Checks ([qa-checks.js](js/qa-checks.js))

Sistema de validaciÃ³n modular. Define reglas QA para campos:
- Por-campo: Validaciones individuales (ej: POS requerido)
- Por-fila: Validaciones cross-field (ej: consistency POS/PART NO.)
- Estados de resultado: `OK`, `WARNING`, `ERROR`

**Funciones clave**:
- `evaluateRowQaChecks(row)`: EvalÃºa todas las reglas para una fila
- `evaluateQaChecksForField(row, fieldName)`: ValidaciÃ³n por campo especÃ­fico
- `getQaCheckDefinitions()`: Retorna definiciones de todas las reglas

### Revision System ([revision.js](js/revision.js))

GestiÃ³n del ciclo de vida de revisiones:
- NormalizaciÃ³n de estados: `revision_estado` (string) â†” `revision_estado_new` (int)
- NormalizaciÃ³n de acciones: `revision_accion` (string) â†” `revision_accion_new` (int)
- AsignaciÃ³n de claves de revisiÃ³n (`getRevisionKey()`) para identificar registros Ãºnicos

**Estados principales**:
- `aprobado` / `1`: Ready for export
- `pendiente_revision` / `2`: Awaiting QA
- `rechazado` / `3`: Rejected
- Acciones: `Sin_accion`, `Import`, `Supersede`, etc.

**Funciones clave**:
- `getRevisionKey(row)`: ID Ãºnico para registro (PN + other attrs)
- `normalizeEstadoToNew(estadoString)`: string â†’ int
- `normalizeAccionToNew(accionString)`: string â†’ int

### Revision Sync ([revision-sync.js](js/revision-sync.js))

Sistema de sincronizaciÃ³n de revisiones con servidor:
- Polling periÃ³dico a `/qa_revision_sync.php`
- ActualizaciÃ³n de UI cuando hay cambios remotos
- Manejo de conflictos

**Funciones clave**:
- `subscribeRevisionSync()`: Inicia polling
- `publishRevisionSync()`: EnvÃ­a cambios locales

### PDF Viewer ([pdf-viewer.js](js/pdf-viewer.js))

Visor PDF basado en [PDF.js](https://mozilla.github.io/pdf.js/):
- Carga PDFs desde URLs
- Zoom (50%, 75%, 100%, 125%, 150%, 200%, fit, height)
- BÃºsqueda y selecciÃ³n de texto en PDF
- IntegraciÃ³n con tabla: resalta coincidencias de valores

**Zoom modes**:
- `fit`: Ajustar ancho a viewport
- `height`: Ajustar altura vertical dentro del contenedor
- Porcentajes: Zoom explÃ­cito

**Funciones clave**:
- `loadPdfWithPage(url, page)`: Carga PDF en pÃ¡gina especÃ­fica
- `renderPdfPage(pageNum)`: Renderiza una pÃ¡gina
- `initPdfZoomControls()`: Inicializa controles zoom
- `setPdfSelection(tokens)`: Resalta tokens en PDF

### Table Management ([qa-table.js](js/qa-table.js))

Tabla principal de datos con:
- PaginaciÃ³n configurable
- Ordenamiento por columna
- Filtros por campo
- SelecciÃ³n de fila
- EdiciÃ³n inline

**Funciones clave**:
- `renderTable()`: Renderiza tabla completa
- `applyFilters()`: Aplica filtros y actualiza `filteredData`
- `changePage(n)`: Cambio de pÃ¡gina
- `renderPagination()`: Renderiza controles de pÃ¡gina

### Cell Editor ([cell-editor.js](js/cell-editor.js))

EdiciÃ³n inline de celdas:
- Click en celda activa modo ediciÃ³n
- ValidaciÃ³n mientras se edita
- Persistencia al salir o Enter
- CancelaciÃ³n con Escape

**Funciones clave**:
- `isInlineEditableTarget(element)`: Detecta si elemento es editable
- `cancelInlineEdit()`: Cancela ediciÃ³n actual
- Listeners en tabla para activar ediciÃ³n

### Column View ([column-view.js](js/column-view.js))

GestiÃ³n de vistas de columnas:
- Cambio entre vistas (ej: 'pdf', 'pos')
- Ajuste dinÃ¡mico de ancho de columnas
- Persistencia de preferencias en localStorage

**Funciones clave**:
- `applyColumnView(viewName)`: Activa una vista
- `loadColumnViewPreference()`: Carga preferencias guardadas
- `saveColumnViewPreference()`: Guarda preferencias actuales

### PN Review ([pn-review-embedded.js](js/pn-review-embedded.js), [pn-review.js](js/pn-review.js))

Sistema de revisiÃ³n de nÃºmeros de parte (Part Numbers):
- RevisiÃ³n independiente por PN
- Decisiones globales (Import, Supersede, etc.)
- IntegraciÃ³n con tabla principal

**Funciones clave**:
- `initPnReview()`: Inicializa vista PN Review
- `markDecision(pn, decision)`: Marca decisiÃ³n para PN

### PDF Compare ([js/scripts/qa_pdf_compare.js](scripts/qa_pdf_compare.js))

Herramienta de comparaciÃ³n PDF:
- Extrae datos de PDFs
- Compara con datos en `engine_*.json`
- Genera reportes de discrepancias

### Export WordPress ([export-wordpress.js](js/export-wordpress.js))

Pipeline QA para exportaciÃ³n:
- Filtra registros por estado revisiÃ³n
- Agrupa por PN
- Genera CSV/JSON para WordPress

### Bulk Revision Helper ([bulk-revision-helper.js](js/bulk-revision-helper.js))

Herramientas para operaciones masivas:
- Aplicar acciones a mÃºltiples registros
- Validar cambios antes de aplicar
- Revert de cambios

### Change Control ([change-control.js](js/change-control.js))

Tracking de cambios y auditorÃ­a:
- Log de operaciones
- Timestamps
- Usuario responsable

## UI Layout

### qa_milu.html Structure

```
<body>
  <div class="content">
    <div class="topbar">
      <!-- Control bar: filtros, bÃºsqueda, navegaciÃ³n -->
    </div>
    <div class="main">
      <div class="main-controls">
        <!-- Centro de control: bulk actions, filtros, paginaciÃ³n -->
      </div>
      <div class="table-and-pdf">
        <div class="left">
          <!-- Tabla principal de QA -->
        </div>
        <div class="right">
          <!-- PDF viewer o panel schemas -->
        </div>
      </div>
    </div>
  </div>
</body>
```

### Right Panel Tabs

Control mediante `state.rightPanelTab`:
- `pdf`: Visor PDF
- `pos`: Panel de esquemas POS
- `analytics`: EstadÃ­sticas

## Recent Features (May 2026)

### 1. PDF Zoom Improvements
**Commit**: Fix PDF zoom vertical fit and add 50% zoom option

- Modo `height`: Ajusta verticalmente dentro del contenedor
- Nuevo paso 50% en zoom
- CÃ¡lculo mejorado de altura disponible

### 2. Modal Editing Enhancements
**Commit**: Cambios de modal de ediciÃ³n y usabilidad

- Modal mejorado para ediciÃ³n
- Mejor flujo de confirmaciÃ³n
- Mejor feedback visual

### 3. QA UI Improvements
**Commit**: Mejoras QA UI, correcciones engine JSON

- Correcciones en validaciones QA
- Mejor visualizaciÃ³n de errores
- UI mÃ¡s limpia

### 4. PN Review Embedded
**Commit**: PN Review embedded en Analista 02

- IntegraciÃ³n de PN Review en panel analista
- Sin requerimiento de PN para operaciones
- Botones siempre visibles

### 5. WordPress Export
**Commit**: Nueva logica de exportacion a wordpress

- Decisiones basadas en QA (estado + acciÃ³n)
- AgrupaciÃ³n por PN
- Output: CSV + JSON

## Data Flow

### Load Data

```
HTML â†’ state.js â†’ data-loader.js
    â†“
loadPartitionedEngineData()
    â†“
state.allData = [rows...]
    â†“
qa-table.js renderTable()
```

### Edit Cell

```
User click cell
    â†“
cell-editor.js activates inline edit
    â†“
User enters value + Enter
    â†“
data-loader.js saveCellToServer()
    â†“
POST /save-json
    â†“
Backend: engine_*.json updated
    â†“
state updated + re-render cell visual
```

### Apply Revision

```
User selects revision state + action
    â†“
revision.js normalizeEstadoToNew(), normalizeAccionToNew()
    â†“
revision-sync.js publishRevisionSync()
    â†“
POST /qa_revision_sync.php
    â†“
Backend: qa_revision_server_data.json updated
    â†“
Next polling cycle: subscribeRevisionSync() fetches latest
    â†“
state.selectedRevisionRowKey updated + UI refresh
```

### Export

```
User triggers export:wordpress
    â†“
export-wordpress.js evaluates qa_revision_estado + qa_revision_accion
    â†“
Backend: Node.js export_wordpress_milu.js runs
    â†“
Grouping by PN
    â†“
Output: milu_wp_import.csv + milu_wp_discarded.csv + summary
```

## Styling

### CSS Architecture

- Inline CSS en `<style>` dentro de `qa_milu.html`
- Clases utilitarias y componentes
- Responsive design con media queries
- Grid/Flexbox para layout

### Key CSS Classes

- `.table-and-pdf`: Container principal
- `.left`, `.right`: Paneles
- `.qa-table`: Tabla de datos
- `.pdfviewer`: Contenedor PDF
- `.modal`: Modales
- `.topbar`: Barra superior

## Common Patterns

### 1. State Mutation

```javascript
// Leer
const pageSize = state.pageSize;

// Modificar
state.currentPage = 2;

// Explicitud: cuando haya UI impact
state.filteredData = newData;
renderTable(); // <- re-render explÃ­cito
```

### 2. Async Data Loading

```javascript
const data = await fetchJsonSafe('/api/endpoint');
if (data) {
    state.allData = data;
    renderTable();
}
```

### 3. Event Listener Pattern

```javascript
document.addEventListener('click', (e) => {
    if (e.target.id === 'myButton') {
        // Handle click
    }
});
```

### 4. Module Initialization

```javascript
export function initMyModule() {
    // Setup
    subscribeStateChanges();
    setupEventListeners();
}

// En qa-milu.js
await initMyModule();
```

## Debugging

### Common Issues

1. **Tabla no renderiza**: Verificar `state.filteredData` estÃ¡ poblado
2. **PDF no carga**: Validar URL en `state.currentPdfUrl`
3. **Cambios no persisten**: Revisar `POST /save-json` en network tab
4. **UI no actualiza**: Asegurarse llamar `renderTable()` o `refreshSelectedRowVisual()` despuÃ©s cambios

### Browser DevTools

```javascript
// En console
state.allData.length          // Contar registros
state.filteredData.length     // Registros filtrados
state.currentPdfZoom          // Zoom actual
```

## Performance Considerations

1. **PaginaciÃ³n**: Evita renderizar >50 filas por pÃ¡gina
2. **PDF rendering**: PDF.js usa Web Workers; no bloquea UI
3. **Filtros**: Se aplican in-memory; rÃ¡pido para datasets <10k registros
4. **Re-renders**: Mantener explÃ­citos y acotados; no hacer re-render completo si solo cambiÃ³ selecciÃ³n

## File Organization

```
js/
â”œâ”€â”€ qa-milu.js              # Punto entrada principal
â”œâ”€â”€ state.js                # Estado global
â”œâ”€â”€ data-loader.js          # Carga/persistencia datos
â”œâ”€â”€ qa-checks.js            # Validaciones QA
â”œâ”€â”€ revision.js             # Sistema revisiones
â”œâ”€â”€ revision-sync.js        # Sync con servidor
â”œâ”€â”€ pdf-viewer.js           # Visor PDF
â”œâ”€â”€ qa-table.js             # Tabla datos
â”œâ”€â”€ cell-editor.js          # EdiciÃ³n inline
â”œâ”€â”€ column-view.js          # GestiÃ³n vistas columnas
â”œâ”€â”€ pn-review.js            # PN Review
â”œâ”€â”€ pn-review-embedded.js   # PN Review en analista
â”œâ”€â”€ export-wordpress.js     # Export WordPress
â”œâ”€â”€ bulk-revision-helper.js # Operaciones masivas
â”œâ”€â”€ change-control.js       # AuditorÃ­a
â”œâ”€â”€ pdf-compare.js          # ComparaciÃ³n PDF
â”œâ”€â”€ schemas.js              # Paneles schemas/POS
â”œâ”€â”€ topbar.js               # Barra superior
â”œâ”€â”€ helpers.js              # Utilidades
â””â”€â”€ ... (otros mÃ³dulos)
```

## Contributing

### Adding a New Module

1. Crear archivo `js/my-module.js`
2. Importar dependencias necesarias (`state.js`, etc.)
3. Exportar funciones principales
4. Importar en `qa-milu.js` e inicializar
5. Documentar en esta guÃ­a

### Modifying State

- Siempre travÃ©s del objeto `state` importado
- Cuidado con mutaciones: no hace deep-copy automÃ¡tico
- Disparar re-renders explÃ­citos cuando sea necesario

---

**Ãšltima actualizaciÃ³n**: Mayo 5, 2026
**Mantenedor**: Equipo MILU

