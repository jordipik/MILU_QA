# AR-1 · Carga incremental de motores

Implementa la primera fase de la mejora **AR-1** definida en [10_plan_remediacion.md](10_plan_remediacion.md).

> Estado: infraestructura completa, activación bajo *feature flag*. UI de selección queda como tarea posterior.

---

## Objetivo

Evitar que la SPA descargue y parsee los 9 `engine_*.json` (~215 MB, 67.882 filas) en la carga inicial.

## Diseño

### Backend — `GET /engines`
- Devuelve metadatos de los 9 motores: `file`, `engine_model`, `rowCount`, `fileSize`, `mtimeMs`.
- Cache en memoria (`engineMetaCache` en [server.js](../server.js)) invalidado por `mtimeMs + size` del archivo.
- Primera llamada hace parseo completo (≈ tiempo equivalente al parseo cliente actual).
- Llamadas siguientes: < 50 ms (medido: **19 ms**).
- Respuesta también incluye `totals` (suma de filas y tamaño).

### Frontend — `js/data-loader.js`
- `fetchEngineCatalog()`: GET `/engines`, persiste en `state.engineCatalog`.
- `loadEnginesByFileNames(files, { append })`:
  - `append: false` (default) → reemplaza `state.allData` con las filas de los motores indicados.
  - `append: true` → añade los motores no cargados aún, conservando los previos.
  - Marca cada fila con `__engine_file` (campo runtime, no persistido) para poder reemplazarlas selectivamente en cargas posteriores.
- `loadPartitionedEngineData()` se mantiene sin cambios para compatibilidad.

### Frontend — `js/state.js`
- `engineCatalog: []` — metadatos (de `/engines`).
- `loadedEngineFiles: Set<string>` — qué motores tiene cargados `state.allData`.
- `incrementalLoadingEnabled: boolean` — refleja si la sesión actual usa carga incremental.

### Frontend — `js/qa-milu.js`
- Nueva función `loadInitialEngineData()`:
  - Si la flag está activa: carga catálogo + primer motor. Caída a carga completa si `/engines` falla o el catálogo viene vacío.
  - Si la flag está inactiva: comportamiento idéntico al anterior (`loadPartitionedEngineData`).

### Activación
- URL: `http://localhost:3000/qa_milu.html?lazy=1`.
- LocalStorage: `localStorage.setItem('miluLazyEngines', '1')`.
- Forzar OFF aunque exista en localStorage: `?lazy=0`.

## Compatibilidad

| Endpoint / API | Estado | Comentario |
|----------------|--------|------------|
| `GET /health` | sin cambios | |
| `POST /save-json` | sin cambios | sigue validando contra `ENGINE_JSON_FILES`; un edit fuerza invalidación del cache de `/engines` por `mtime`. |
| `POST /apply-revision-to-engines` | sin cambios | itera todos los motores como antes; no depende del cliente. |
| `GET|POST /qa_revision_sync.php` | sin cambios | |
| `loadPartitionedEngineData()` | sin cambios | usado por `qa-analista-registro.js` y por el path por defecto. |
| `loadEngineDataByFileName(file)` | sin cambios | usado por `analista-02.js`. |
| Identidad de fila | sin cambios | `engine_file + ID`. |

## Riesgos identificados

| ID | Riesgo | Mitigación |
|----|--------|------------|
| R1 | Filtros y stats globales muestran "X filas" parciales en modo lazy. | `state.mainDataSourceLabel` indica `engine_*.json (n/9)`. |
| R2 | Catálogo desactualizado si alguien edita JSON fuera del backend. | Cache invalidado por `mtimeMs + size`. |
| R3 | Memoria: cargar 4-5 motores ≈ 120 MB en cliente. | Default cargando solo 1 motor. |
| R4 | `__engine_file` se podría serializar accidentalmente al persistir. | Persistencia es por campo (`/save-json` recibe `col` explícito), nunca el row entero. |

## Validación realizada

- `node --check server.js` y módulos JS modificados: OK.
- `GET /health` → `{ ok: true, service: 'milu-save-backend' }`.
- `GET /engines` (frío) → 9 motores, totals `{ rowCount: 67882, fileSize: 225_841_891 }`.
- `GET /engines` (caliente) → **19 ms**.
- `POST /save-json` con archivo no permitido → 400 (regresión OK).
- Flag inactiva: `loadData()` invoca `loadPartitionedEngineData` exactamente como antes.

## Pendiente (siguiente iteración)

1. UI minimalista en `qa_milu.html`: badge con `n/9 motores cargados` + dropdown multi-select para añadir motores.
2. Métrica real de TTFR (time-to-first-render) con `performance.mark`.
3. Conmutador en UI (sin URL param) y persistencia en localStorage.
4. Recargar selección tras `apply-revision-to-engines` para reflejar cambios sólo en motores cargados.

## Archivos modificados

- [server.js](../server.js) — endpoint `/engines` + cache.
- [js/data-loader.js](../js/data-loader.js) — `fetchEngineCatalog`, `loadEnginesByFileNames`.
- [js/state.js](../js/state.js) — `engineCatalog`, `loadedEngineFiles`, `incrementalLoadingEnabled`.
- [js/qa-milu.js](../js/qa-milu.js) — `loadInitialEngineData()` con feature flag.

## Cómo probar manualmente

```powershell
node server.js
# en otra terminal o navegador
start http://localhost:3000/qa_milu.html?lazy=1
```

Verificar en DevTools que sólo se descarga `engine_12V4000M40A.json` (primer motor del catálogo) en la carga inicial.
