# MILU

Proyecto web local para revision y mantenimiento de datos tecnicos de motores.

## Resumen rapido

- Backend local con Express en [server.js](server.js).
- Frontend principal en [qa_milu.html](qa_milu.html).
- Persistencia en archivos JSON del repo (no hay base de datos relacional).
- Datos runtime cargados desde 9 archivos `engine_*.json` (ver [js/data-loader.js](js/data-loader.js)).

## Puesta en marcha

1. Instalar dependencias:
   - `npm install`
2. Arrancar servidor:
   - `node server.js`
   - o usar [Ejecutar localhost.bat](Ejecutar%20localhost.bat)
3. Abrir la app:
   - `http://localhost:3000/qa_milu.html`

## Frontend Documentation

La documentación completa del frontend, incluyendo arquitectura modular, state management, módulos JS y patrones de desarrollo, está en [FRONTEND.md](FRONTEND.md).

Puntos clave:
- **Arquitectura modular**: ~25 módulos ES6+ sin framework
- **Estado global**: Todos los módulos usan `state.js`
- **Data-driven UI**: Cambios en estado disparan re-renders explícitos
- **Visor PDF**: Integrado con PDF.js, zoom ajustable, búsqueda
- **Sistema QA**: Validaciones modular por-campo y por-fila
- **Revisiones**: Sistema de estado + acción, sincronización con servidor

## Ediciones Recientes (Mayo 2026)

### Frontend
- **PDF zoom improvements**: Modo "Ajustar vertical" mejorado + opción 50% zoom
- **Modal de edición**: Flujo mejorado, mejor feedback visual
- **QA validaciones**: Correcciones y mejoras en reglas de validación
- **PN Review embedded**: Integración en panel Analista 02, botones siempre visibles

### Backend & Pipeline
- **Export WordPress**: Nueva lógica basada en estado QA + acción
- **Decisiones globales**: Decisiones por PN dependentes de `qa_revision_estado` + `qa_revision_accion`
- **PDF compare**: Herramienta de comparación PDF mejorada

## Publicacion automatica (GitHub Pages)

El repo ya incluye workflow de despliegue automatico en:
- `.github/workflows/deploy-pages.yml`

Comportamiento:
- Publica el contenido de `dist/milu_publish/` en GitHub Pages.
- Se ejecuta en `push` a las ramas `main` y `pasar-a-javascript` cuando hay cambios en `dist/milu_publish/**`.
- Tambien permite ejecucion manual desde la pestaña Actions (`workflow_dispatch`).

Configuracion unica en GitHub (solo la primera vez):
1. Ir a `Settings > Pages` del repositorio.
2. En `Source`, seleccionar `GitHub Actions`.

Dominio personalizado:
- El archivo `CNAME` se publica desde `dist/milu_publish/CNAME` (actualmente `milu.alentio.es`).
- Si cambias de dominio, actualiza ese archivo y haz push.

Preparar `dist/milu_publish` en local (recomendado antes de push):
1. Revisar sin copiar (dry-run):
   - `npm run pages:prepare:incremental:dry`
2. Generar carpeta publicable (incremental, recomendado):
   - `npm run pages:prepare:incremental`
3. Generar carpeta publicable completa (full reset + copia total):
   - `npm run pages:prepare`
4. Commit + push de los cambios en `dist/milu_publish/**`.

El script copia a `dist/milu_publish/`:
- HTML y estilos de entrada
- carpetas `js/`, `styles/`, `esquemas/`, `esquemas_pos_circulos/`
- `CNAME`
- todos los `engine_*.json`

Publicar con un comando (prepare + stage + commit + push):
- `npm run pages:publish`

Por defecto `pages:publish` usa prepare incremental para reducir tiempo.

Variantes utiles:
- Solo hasta commit (sin push): `npm run pages:publish:nopush`
- Solo preparar y dejar stage listo (sin commit ni push): `npm run pages:publish:stage-only`
- Publicacion con prepare completo: `npm run pages:publish:full`
- Publicacion con prepare completo sin push: `npm run pages:publish:full:nopush`

Notas del script de publicacion:
- Hace `npm run pages:prepare` automaticamente.
- Hace `git add dist/milu_publish CNAME`.
- Si no hay cambios, termina sin error.
- Hace commit con mensaje por defecto: `chore: publish pages`.
- Hace push a la rama actual (`origin/<rama_actual>`), salvo que uses `nopush`.

## Endpoints clave

- `GET /health` - Validar conexión backend
- `GET /qa_revision_sync.php` - Obtener revisiones remotas
- `POST /qa_revision_sync.php` - Actualizar revisiones
- `POST /save-json` - Guardar cambio puntual en campo `engine_*.json`
- `POST /apply-revision-to-engines` - Aplicar revisiones masivas
- `GET /qa_milu.html` - Frontend principal

## Sistema de Revisiones (QA Pipeline)

El flujo QA se basa en dos campos por registro:

1. **qa_revision_estado**: Estado de aprobación
   - `aprobado` / `1`: Listo para exportar
   - `pendiente_revision` / `2`: Requiere revisión
   - `rechazado` / `3`: Rechazado
   - Valores legacy: strings; valores nuevos: números

2. **qa_revision_accion**: Acción a tomar
   - `Sin_accion`: Sin cambios
   - `Import`: Importar a WordPress
   - `Supersede`: Marcar como supersedido
   - Otros estados según pipeline

**Persistencia de revisiones**: Los datos de revisión se guardan en [qa_revision_server_data.json](qa_revision_server_data.json) y se sincronizan con la tabla principal vía endpoint `/qa_revision_sync.php`.

## Validación de Datos (QA Checks)

Sistema modular de validaciones definidas en [js/qa-checks.js](js/qa-checks.js):

- **Por-campo**: Validaciones individuales (ej: POS requerido, PART NO. formato)
- **Por-fila**: Validaciones cross-field (ej: consistencia POS/Part No.)
- **Estados**: `OK`, `WARNING`, `ERROR`
- **Persistencia**: Errores se registran como flags en los registros (ej: `pos_error`, `pn_error`)

Funciones principales:
- `evaluateRowQaChecks(row)`: Valida toda la fila
- `evaluateQaChecksForField(row, fieldName)`: Valida campo específico

## Backend (Express)

El servidor Node.js en [server.js](server.js) proporciona:

### Middleware Principal
- Express estático para servir HTML, JS, CSS
- Body-parser para JSON POST
- CORS habilitado
- Routes especiales `/qa_revision_sync.php` antes del middleware estático (importante: retorna JSON, no el archivo .php)

### Responsabilidades
- Servir frontend en `/qa_milu.html`
- Atender endpoints `/save-json`, `/apply-revision-to-engines`, `/qa_revision_sync.php`
- No usa base de datos relacional; toda persistencia es en archivos JSON
- Health check: `GET /health`

## Persistence Layer

### Data Storage
- **Main data**: 9 archivos `engine_*.json` (uno por modelo motor)
  - Cargados en runtime a `state.allData`
  - Editables vía `/save-json` (cambio puntual por celda)
  - Procesables vía `/apply-revision-to-engines` (cambios masivos)
  
- **Revision data**: [qa_revision_server_data.json](qa_revision_server_data.json)
  - Almacena estados y acciones de revisión
  - Sincronizado vía `/qa_revision_sync.php`

- **Catalogs**: Archivos JSON adicionales para lookup
  - `MILU_New_v506.json`, `MILU_Superseded_v506.json`
  - `product-export-*.json`

### Write Path
```
Frontend POST /save-json
  ↓
server.js body-parser
  ↓
File write (engine_*.json)
  ↓
Return success/error JSON
  ↓
Frontend updates state + UI
```

## Export WordPress (flujo oficial QA-only)

Script oficial:
- `npm run export:wordpress`

Regla de decision:
- Se agrupa globalmente por PN en los 9 `engine_*.json`.
- La decision final depende solo de `qa_revision_estado` + `qa_revision_accion`.

Outputs oficiales:
- `data/output/wordpress/milu_wp_import.csv`
- `data/output/wordpress/milu_wp_discarded.csv`
- `data/output/wordpress/milu_wp_pending_review.csv`
- `data/output/wordpress/milu_wp_import.json`
- `data/output/wordpress/milu_wp_export_summary.md`
- Opcional: `data/output/wordpress/milu_wp_trace.json`

Legacy archivado:
- `npm run legacy:ai:conflicts`
- `npm run legacy:export:review`
- `npm run legacy:generate:synthetic`
- `legacy/export_complex_ai/`

Guia detallada:
- [docs/14_wordpress_export_simplified.md](docs/14_wordpress_export_simplified.md)

## Proceso oficial: pasar de JSON originales a JSON definitivos

Este proceso recalcula campos finales y normaliza formato sobre los 9 archivos `engine_*.json` del root.

### Script

- [depuracion_json.py](depuracion_json.py)

### Ejecucion

```bash
python depuracion_json.py
```

En este repo, si usas el venv local en Windows:

```powershell
c:/Users/jordi/source/repos/milu/.venv/Scripts/python.exe depuracion_json.py
```

### Reglas aplicadas

1. `designation_final`
   - Si existe `designation_gesa`, se usa ese valor.
   - Si no, se usa `DESIGNATION`.

2. `measure_final`
   - Si existe `dimensions_gesa`, se usa `dimensions_gesa`.
   - Si no, se usa `MEASUREMENT / STANDARD`.

3. Normalizacion de medidas
   - En `dimensions_gesa` y en el fallback `MEASUREMENT / STANDARD` se colapsan espacios multiples a uno.
   - Ejemplo: `A  55   X  5` -> `A 55 X 5`.

4. `weight_final`
   - Corrige typo legado `wheight_final` -> `weight_final`.
   - Si no hay `weight_final`, intenta reutilizar el legado, luego `WEIGHT`, y por ultimo `weight_gesa + units`.

5. Errores QA persistidos por registro
   - Se generan flags numericos por campo: `pos_error`, `pn_error`, `designation_error`, `weight_error`, `measurement_error`, `norma_error`, `bom_error`.
   - Se calcula `total_error` como suma de esos flags.
   - Se actualiza `has_error` como booleano derivado (`total_error > 0`).

## Notas de mantenimiento

- Evitar editar carpetas de salida salvo que la tarea lo requiera: `dist/`, `esquemas/`, `esquemas_pos_circulos/`, `json_originales/`, `zz_old/`, `fotos_articulos/`, `fotos_motores/`.
- No hay suite formal de tests en `package.json`; la validacion habitual es funcional contra la UI y endpoints.
- Para incidencias de persistencia, diagnosticar por capas: backend (`/health`), endpoint, payload frontend y escritura real en disco.
