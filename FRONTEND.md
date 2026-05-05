# MILU Frontend Documentation

## Overview

El frontend de MILU es una aplicación web moderna basada en módulos ES6+ sin framework, con arquitectura modular y estado global centralizado. Proporciona una interfaz completa para:

- **Revisión QA**: Validación y revisión de datos técnicos de motores en tablas interactivas
- **Visualización PDF**: Visor de PDFs integrado con zoom, búsqueda y selección de contenido
- **Gestión de revisiones**: Sistema de revisión con estados (`revision_estado`, `revision_accion`)
- **Export WordPress**: Pipeline QA para exportación de datos
- **PN Review**: Sistema de revisión de números de parte (Part Numbers)
- **Edición de celdas**: Edición inline con cambios persistidos al servidor

## Architecture

### Punto de Entrada

- **[qa_milu.html](qa_milu.html)**: HTML principal que carga todos los módulos JS
- Implementa acceso modular con `import { ... } from './js/module.js'`
- CSS integrado + referencias a archivos de estilos externos

### Flujo de Inicialización

1. HTML carga módulos principales: `state.js`, `data-loader.js`, `qa-checks.js`
2. Se carga `qa-milu.js` como módulo de entrada
3. Se inicializa estado global y carga datos de `engine_*.json`
4. Se renderizan tablas, PDF y controles de UI
5. Se suscriben listeners a cambios globales

## State Management

### Estado Global ([state.js](js/state.js))

Objeto singleton importado por todos los módulos. Contiene:

```javascript
{
    allData: [],              // Todos los registros cargados
    filteredData: [],         // Registros tras filtros
    tableMode: 'qa',          // Modo actual: 'qa', 'grouped', etc.
    currentPage: 1,           // Página actual tabla
    pageSize: 50,             // Registros por página
    sortKey: 'book_page_pos', // Campo de ordenamiento
    sortAsc: true,            // Dirección ordenamiento
    filters: {},              // Filtros activos
    columnView: 'pdf',        // Vista columnas: 'pdf', 'pos'
    selectedRevisionRowKey: '',// Fila seleccionada en revisiones
    currentPdfZoom: 100,      // Zoom actual PDF
    currentPdfPage: 1,        // Página actual PDF
    // ... y muchos más campos
}
```

**Principio**: Todos los módulos leen y modifican este objeto directamente. Cambios en `state` no disparan re-renders automáticos; se usan funciones explícitas para actualizar UI cuando es necesario.

## Core Modules

### Data Loading ([data-loader.js](js/data-loader.js))

Responsabilidades:
- Cargar datos de los 9 archivos `engine_*.json` del backend
- Normalizar y validar estructura de datos
- Implementar persistencia con endpoints:
  - `POST /save-json`: Guardar cambio puntual en un campo
  - `POST /apply-revision-to-engines`: Aplicar revisiones masivas
  - `GET /health`: Validar conexión backend
- Gestión de catálogos secundarios (MILU_New, MILU_Superseded, etc.)

**Funciones clave**:
- `loadPartitionedEngineData()`: Carga todos los datos engines en `state.allData`
- `saveCellToServer(field, value, rowKey)`: Persiste un cambio
- `fetchJsonSafe(url)`: Fetch robusto con fallback

### QA Checks ([qa-checks.js](js/qa-checks.js))

Sistema de validación modular. Define reglas QA para campos:
- Por-campo: Validaciones individuales (ej: POS requerido)
- Por-fila: Validaciones cross-field (ej: consistency POS/PART NO.)
- Estados de resultado: `OK`, `WARNING`, `ERROR`

**Funciones clave**:
- `evaluateRowQaChecks(row)`: Evalúa todas las reglas para una fila
- `evaluateQaChecksForField(row, fieldName)`: Validación por campo específico
- `getQaCheckDefinitions()`: Retorna definiciones de todas las reglas

### Revision System ([revision.js](js/revision.js))

Gestión del ciclo de vida de revisiones:
- Normalización de estados: `revision_estado` (string) ↔ `revision_estado_new` (int)
- Normalización de acciones: `revision_accion` (string) ↔ `revision_accion_new` (int)
- Asignación de claves de revisión (`getRevisionKey()`) para identificar registros únicos

**Estados principales**:
- `aprobado` / `1`: Ready for export
- `pendiente_revision` / `2`: Awaiting QA
- `rechazado` / `3`: Rejected
- Acciones: `Sin_accion`, `Import`, `Supersede`, etc.

**Funciones clave**:
- `getRevisionKey(row)`: ID único para registro (PN + other attrs)
- `normalizeEstadoToNew(estadoString)`: string → int
- `normalizeAccionToNew(accionString)`: string → int

### Revision Sync ([revision-sync.js](js/revision-sync.js))

Sistema de sincronización de revisiones con servidor:
- Polling periódico a `/qa_revision_sync.php`
- Actualización de UI cuando hay cambios remotos
- Manejo de conflictos

**Funciones clave**:
- `subscribeRevisionSync()`: Inicia polling
- `publishRevisionSync()`: Envía cambios locales

### PDF Viewer ([pdf-viewer.js](js/pdf-viewer.js))

Visor PDF basado en [PDF.js](https://mozilla.github.io/pdf.js/):
- Carga PDFs desde URLs
- Zoom (50%, 75%, 100%, 125%, 150%, 200%, fit, height)
- Búsqueda y selección de texto en PDF
- Integración con tabla: resalta coincidencias de valores

**Zoom modes**:
- `fit`: Ajustar ancho a viewport
- `height`: Ajustar altura vertical dentro del contenedor
- Porcentajes: Zoom explícito

**Funciones clave**:
- `loadPdfWithPage(url, page)`: Carga PDF en página específica
- `renderPdfPage(pageNum)`: Renderiza una página
- `initPdfZoomControls()`: Inicializa controles zoom
- `setPdfSelection(tokens)`: Resalta tokens en PDF

### Table Management ([qa-table.js](js/qa-table.js))

Tabla principal de datos con:
- Paginación configurable
- Ordenamiento por columna
- Filtros por campo
- Selección de fila
- Edición inline

**Funciones clave**:
- `renderTable()`: Renderiza tabla completa
- `applyFilters()`: Aplica filtros y actualiza `filteredData`
- `changePage(n)`: Cambio de página
- `renderPagination()`: Renderiza controles de página

### Cell Editor ([cell-editor.js](js/cell-editor.js))

Edición inline de celdas:
- Click en celda activa modo edición
- Validación mientras se edita
- Persistencia al salir o Enter
- Cancelación con Escape

**Funciones clave**:
- `isInlineEditableTarget(element)`: Detecta si elemento es editable
- `cancelInlineEdit()`: Cancela edición actual
- Listeners en tabla para activar edición

### Column View ([column-view.js](js/column-view.js))

Gestión de vistas de columnas:
- Cambio entre vistas (ej: 'pdf', 'pos')
- Ajuste dinámico de ancho de columnas
- Persistencia de preferencias en localStorage

**Funciones clave**:
- `applyColumnView(viewName)`: Activa una vista
- `loadColumnViewPreference()`: Carga preferencias guardadas
- `saveColumnViewPreference()`: Guarda preferencias actuales

### PN Review ([pn-review-embedded.js](js/pn-review-embedded.js), [pn-review.js](js/pn-review.js))

Sistema de revisión de números de parte (Part Numbers):
- Revisión independiente por PN
- Decisiones globales (Import, Supersede, etc.)
- Integración con tabla principal

**Funciones clave**:
- `initPnReview()`: Inicializa vista PN Review
- `markDecision(pn, decision)`: Marca decisión para PN

### PDF Compare ([js/scripts/qa_pdf_compare.js](scripts/qa_pdf_compare.js))

Herramienta de comparación PDF:
- Extrae datos de PDFs
- Compara con datos en `engine_*.json`
- Genera reportes de discrepancias

### Export WordPress ([export-wordpress.js](js/export-wordpress.js))

Pipeline QA para exportación:
- Filtra registros por estado revisión
- Agrupa por PN
- Genera CSV/JSON para WordPress

### Bulk Revision Helper ([bulk-revision-helper.js](js/bulk-revision-helper.js))

Herramientas para operaciones masivas:
- Aplicar acciones a múltiples registros
- Validar cambios antes de aplicar
- Revert de cambios

### Change Control ([change-control.js](js/change-control.js))

Tracking de cambios y auditoría:
- Log de operaciones
- Timestamps
- Usuario responsable

## UI Layout

### qa_milu.html Structure

```
<body>
  <div class="content">
    <div class="topbar">
      <!-- Control bar: filtros, búsqueda, navegación -->
    </div>
    <div class="main">
      <div class="main-controls">
        <!-- Centro de control: bulk actions, filtros, paginación -->
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
- `analytics`: Estadísticas

## Recent Features (May 2026)

### 1. PDF Zoom Improvements
**Commit**: Fix PDF zoom vertical fit and add 50% zoom option

- Modo `height`: Ajusta verticalmente dentro del contenedor
- Nuevo paso 50% en zoom
- Cálculo mejorado de altura disponible

### 2. Modal Editing Enhancements
**Commit**: Cambios de modal de edición y usabilidad

- Modal mejorado para edición
- Mejor flujo de confirmación
- Mejor feedback visual

### 3. QA UI Improvements
**Commit**: Mejoras QA UI, correcciones engine JSON

- Correcciones en validaciones QA
- Mejor visualización de errores
- UI más limpia

### 4. PN Review Embedded
**Commit**: PN Review embedded en Analista 02

- Integración de PN Review en panel analista
- Sin requerimiento de PN para operaciones
- Botones siempre visibles

### 5. WordPress Export
**Commit**: Nueva logica de exportacion a wordpress

- Decisiones basadas en QA (estado + acción)
- Agrupación por PN
- Output: CSV + JSON

## Data Flow

### Load Data

```
HTML → state.js → data-loader.js
    ↓
loadPartitionedEngineData()
    ↓
state.allData = [rows...]
    ↓
qa-table.js renderTable()
```

### Edit Cell

```
User click cell
    ↓
cell-editor.js activates inline edit
    ↓
User enters value + Enter
    ↓
data-loader.js saveCellToServer()
    ↓
POST /save-json
    ↓
Backend: engine_*.json updated
    ↓
state updated + re-render cell visual
```

### Apply Revision

```
User selects revision state + action
    ↓
revision.js normalizeEstadoToNew(), normalizeAccionToNew()
    ↓
revision-sync.js publishRevisionSync()
    ↓
POST /qa_revision_sync.php
    ↓
Backend: qa_revision_server_data.json updated
    ↓
Next polling cycle: subscribeRevisionSync() fetches latest
    ↓
state.selectedRevisionRowKey updated + UI refresh
```

### Export

```
User triggers export:wordpress
    ↓
export-wordpress.js evaluates qa_revision_estado + qa_revision_accion
    ↓
Backend: Node.js export_wordpress_milu.js runs
    ↓
Grouping by PN
    ↓
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
renderTable(); // <- re-render explícito
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

1. **Tabla no renderiza**: Verificar `state.filteredData` está poblado
2. **PDF no carga**: Validar URL en `state.currentPdfUrl`
3. **Cambios no persisten**: Revisar `POST /save-json` en network tab
4. **UI no actualiza**: Asegurarse llamar `renderTable()` o `refreshSelectedRowVisual()` después cambios

### Browser DevTools

```javascript
// En console
state.allData.length          // Contar registros
state.filteredData.length     // Registros filtrados
state.currentPdfZoom          // Zoom actual
```

## Performance Considerations

1. **Paginación**: Evita renderizar >50 filas por página
2. **PDF rendering**: PDF.js usa Web Workers; no bloquea UI
3. **Filtros**: Se aplican in-memory; rápido para datasets <10k registros
4. **Re-renders**: Mantener explícitos y acotados; no hacer re-render completo si solo cambió selección

## File Organization

```
js/
├── qa-milu.js              # Punto entrada principal
├── state.js                # Estado global
├── data-loader.js          # Carga/persistencia datos
├── qa-checks.js            # Validaciones QA
├── revision.js             # Sistema revisiones
├── revision-sync.js        # Sync con servidor
├── pdf-viewer.js           # Visor PDF
├── qa-table.js             # Tabla datos
├── cell-editor.js          # Edición inline
├── column-view.js          # Gestión vistas columnas
├── pn-review.js            # PN Review
├── pn-review-embedded.js   # PN Review en analista
├── export-wordpress.js     # Export WordPress
├── bulk-revision-helper.js # Operaciones masivas
├── change-control.js       # Auditoría
├── pdf-compare.js          # Comparación PDF
├── schemas.js              # Paneles schemas/POS
├── topbar.js               # Barra superior
├── helpers.js              # Utilidades
└── ... (otros módulos)
```

## Contributing

### Adding a New Module

1. Crear archivo `js/my-module.js`
2. Importar dependencias necesarias (`state.js`, etc.)
3. Exportar funciones principales
4. Importar en `qa-milu.js` e inicializar
5. Documentar en esta guía

### Modifying State

- Siempre través del objeto `state` importado
- Cuidado con mutaciones: no hace deep-copy automático
- Disparar re-renders explícitos cuando sea necesario

---

**Última actualización**: Mayo 5, 2026
**Mantenedor**: Equipo MILU
