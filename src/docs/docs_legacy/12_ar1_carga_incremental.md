# AR-1 · Carga incremental de motores

Implementa la mejora **AR-1** definida en [10_plan_remediacion.md](10_plan_remediacion.md).

> Estado: infraestructura + UI mínima completadas para uso real en `?lazy=1`.

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
- UI mínima para modo lazy:
  - panel `#lazyEnginePanel` visible solo cuando `state.incrementalLoadingEnabled === true`.
  - badge `#lazyEngineBadge` con formato `Motores cargados: n / 9`.
  - selector `#lazyEngineSelect` con motores pendientes y deshabilitado para motores ya cargados.
  - botón `#lazyLoadEngineBtn` para añadir un motor con `append: true`.
  - botón `#lazyLoadAllEnginesBtn` para cargar los pendientes.
- Refresco no disruptivo tras carga incremental:
  - re-asigna revision keys,
  - recompone filtro libro/página,
  - re-renderiza tabla/paginación,
  - mantiene compatibilidad de guardado `/save-json`.

### Frontend — `qa_milu.html` + `styles/qa_milu.css`
- Se añade bloque visual compacto de carga incremental en la cabecera de control.
- El panel permanece oculto en modo clásico.

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
- Modo clásico (`/qa_milu.html`): panel lazy oculto y carga completa sin regresión.
- Modo lazy (`/qa_milu.html?lazy=1`):
  - arranque en **1 / 9**,
  - tras `Cargar motor` pasa a **2 / 9**,
  - tras `Cargar todos` pasa a **9 / 9**.
- En modo lazy, el selector de libros crece conforme se cargan motores (`12V4000M40A` → `12V4000M40A + 12V4000M53` → 9 libros).
- Persistencia `/save-json`: prueba de escritura real sobre `qa_revision_accion` y restauración del valor original en `engine_12V4000M40A.json` con respuesta `{\"ok\":true}` en ambos POST.

## Pendiente (siguiente iteración)

1. Métrica real de TTFR (time-to-first-render) con `performance.mark` y comparación automática clásico vs lazy.
2. Conmutador visual en UI (sin depender de URL param), con persistencia en localStorage.
3. Mantener selección activa al cargar motores adicionales sin forzar `currentPage = 1`.
4. Integrar resumen de carga incremental dentro de la tarjeta de estadísticas para evitar doble bloque visual.

## Archivos modificados

- [server.js](../server.js) — endpoint `/engines` + cache.
- [js/data-loader.js](../js/data-loader.js) — `fetchEngineCatalog`, `loadEnginesByFileNames`.
- [js/state.js](../js/state.js) — `engineCatalog`, `loadedEngineFiles`, `incrementalLoadingEnabled`.
- [js/qa-milu.js](../js/qa-milu.js) — `loadInitialEngineData()` + wiring UI lazy.
- [qa_milu.html](../qa_milu.html) — panel lazy (`lazyEnginePanel`, badge, selector y botones).
- [styles/qa_milu.css](../styles/qa_milu.css) — estilos del panel lazy.

## Cómo probar manualmente

```powershell
node server.js
# en otra terminal o navegador
start http://localhost:3000/qa_milu.html?lazy=1
```

Verificar en DevTools que sólo se descarga `engine_12V4000M40A.json` (primer motor del catálogo) en la carga inicial; luego cargar motores desde el panel lazy y comprobar actualización del badge.
