# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# AR-1 Â· Carga incremental de motores

Implementa la mejora **AR-1** definida en [10_plan_remediacion.md](10_plan_remediacion.md).

> Estado: infraestructura + UI mÃ­nima completadas para uso real en `?lazy=1`.

---

## Objetivo

Evitar que la SPA descargue y parsee los 9 `engine_*.json` (~215 MB, 67.882 filas) en la carga inicial.

## DiseÃ±o

### Backend â€” `GET /engines`
- Devuelve metadatos de los 9 motores: `file`, `engine_model`, `rowCount`, `fileSize`, `mtimeMs`.
- Cache en memoria (`engineMetaCache` en [server.js](../server.js)) invalidado por `mtimeMs + size` del archivo.
- Primera llamada hace parseo completo (â‰ˆ tiempo equivalente al parseo cliente actual).
- Llamadas siguientes: < 50 ms (medido: **19 ms**).
- Respuesta tambiÃ©n incluye `totals` (suma de filas y tamaÃ±o).

### Frontend â€” `js/data-loader.js`
- `fetchEngineCatalog()`: GET `/engines`, persiste en `state.engineCatalog`.
- `loadEnginesByFileNames(files, { append })`:
  - `append: false` (default) â†’ reemplaza `state.allData` con las filas de los motores indicados.
  - `append: true` â†’ aÃ±ade los motores no cargados aÃºn, conservando los previos.
  - Marca cada fila con `__engine_file` (campo runtime, no persistido) para poder reemplazarlas selectivamente en cargas posteriores.
- `loadPartitionedEngineData()` se mantiene sin cambios para compatibilidad.

### Frontend â€” `js/state.js`
- `engineCatalog: []` â€” metadatos (de `/engines`).
- `loadedEngineFiles: Set<string>` â€” quÃ© motores tiene cargados `state.allData`.
- `incrementalLoadingEnabled: boolean` â€” refleja si la sesiÃ³n actual usa carga incremental.

### Frontend â€” `js/qa-milu.js`
- Nueva funciÃ³n `loadInitialEngineData()`:
  - Si la flag estÃ¡ activa: carga catÃ¡logo + primer motor. CaÃ­da a carga completa si `/engines` falla o el catÃ¡logo viene vacÃ­o.
  - Si la flag estÃ¡ inactiva: comportamiento idÃ©ntico al anterior (`loadPartitionedEngineData`).
- UI mÃ­nima para modo lazy:
  - panel `#lazyEnginePanel` visible solo cuando `state.incrementalLoadingEnabled === true`.
  - badge `#lazyEngineBadge` con formato `Motores cargados: n / 9`.
  - selector `#lazyEngineSelect` con motores pendientes y deshabilitado para motores ya cargados.
  - botÃ³n `#lazyLoadEngineBtn` para aÃ±adir un motor con `append: true`.
  - botÃ³n `#lazyLoadAllEnginesBtn` para cargar los pendientes.
- Refresco no disruptivo tras carga incremental:
  - re-asigna revision keys,
  - recompone filtro libro/pÃ¡gina,
  - re-renderiza tabla/paginaciÃ³n,
  - mantiene compatibilidad de guardado `/save-json`.

### Frontend â€” `qa_milu.html` + `styles/qa_milu.css`
- Se aÃ±ade bloque visual compacto de carga incremental en la cabecera de control.
- El panel permanece oculto en modo clÃ¡sico.

### ActivaciÃ³n
- URL: `http://localhost:3000/qa_milu.html?lazy=1`.
- LocalStorage: `localStorage.setItem('miluLazyEngines', '1')`.
- Forzar OFF aunque exista en localStorage: `?lazy=0`.

## Compatibilidad

| Endpoint / API | Estado | Comentario |
|----------------|--------|------------|
| `GET /health` | sin cambios | |
| `POST /save-json` | sin cambios | sigue validando contra `ENGINE_JSON_FILES`; un edit fuerza invalidaciÃ³n del cache de `/engines` por `mtime`. |
| `POST /apply-revision-to-engines` | sin cambios | itera todos los motores como antes; no depende del cliente. |
| `GET|POST /qa_revision_sync.php` | sin cambios | |
| `loadPartitionedEngineData()` | sin cambios | usado por `qa-analista-registro.js` y por el path por defecto. |
| `loadEngineDataByFileName(file)` | sin cambios | usado por `analista-02.js`. |
| Identidad de fila | sin cambios | `engine_file + ID`. |

## Riesgos identificados

| ID | Riesgo | MitigaciÃ³n |
|----|--------|------------|
| R1 | Filtros y stats globales muestran "X filas" parciales en modo lazy. | `state.mainDataSourceLabel` indica `engine_*.json (n/9)`. |
| R2 | CatÃ¡logo desactualizado si alguien edita JSON fuera del backend. | Cache invalidado por `mtimeMs + size`. |
| R3 | Memoria: cargar 4-5 motores â‰ˆ 120 MB en cliente. | Default cargando solo 1 motor. |
| R4 | `__engine_file` se podrÃ­a serializar accidentalmente al persistir. | Persistencia es por campo (`/save-json` recibe `col` explÃ­cito), nunca el row entero. |

## ValidaciÃ³n realizada

- `node --check server.js` y mÃ³dulos JS modificados: OK.
- `GET /health` â†’ `{ ok: true, service: 'milu-save-backend' }`.
- `GET /engines` (frÃ­o) â†’ 9 motores, totals `{ rowCount: 67882, fileSize: 225_841_891 }`.
- `GET /engines` (caliente) â†’ **19 ms**.
- Modo clÃ¡sico (`/qa_milu.html`): panel lazy oculto y carga completa sin regresiÃ³n.
- Modo lazy (`/qa_milu.html?lazy=1`):
  - arranque en **1 / 9**,
  - tras `Cargar motor` pasa a **2 / 9**,
  - tras `Cargar todos` pasa a **9 / 9**.
- En modo lazy, el selector de libros crece conforme se cargan motores (`12V4000M40A` â†’ `12V4000M40A + 12V4000M53` â†’ 9 libros).
- Persistencia `/save-json`: prueba de escritura real sobre `qa_revision_accion` y restauraciÃ³n del valor original en `engine_12V4000M40A.json` con respuesta `{\"ok\":true}` en ambos POST.

## Pendiente (siguiente iteraciÃ³n)

1. MÃ©trica real de TTFR (time-to-first-render) con `performance.mark` y comparaciÃ³n automÃ¡tica clÃ¡sico vs lazy.
2. Conmutador visual en UI (sin depender de URL param), con persistencia en localStorage.
3. Mantener selecciÃ³n activa al cargar motores adicionales sin forzar `currentPage = 1`.
4. Integrar resumen de carga incremental dentro de la tarjeta de estadÃ­sticas para evitar doble bloque visual.

## Archivos modificados

- [server.js](../server.js) â€” endpoint `/engines` + cache.
- [js/data-loader.js](../js/data-loader.js) â€” `fetchEngineCatalog`, `loadEnginesByFileNames`.
- [js/state.js](../js/state.js) â€” `engineCatalog`, `loadedEngineFiles`, `incrementalLoadingEnabled`.
- [js/qa-milu.js](../js/qa-milu.js) â€” `loadInitialEngineData()` + wiring UI lazy.
- [qa_milu.html](../qa_milu.html) â€” panel lazy (`lazyEnginePanel`, badge, selector y botones).
- [styles/qa_milu.css](../styles/qa_milu.css) â€” estilos del panel lazy.

## CÃ³mo probar manualmente

```powershell
node server.js
# en otra terminal o navegador
start http://localhost:3000/qa_milu.html?lazy=1
```

Verificar en DevTools que sÃ³lo se descarga `engine_12V4000M40A.json` (primer motor del catÃ¡logo) en la carga inicial; luego cargar motores desde el panel lazy y comprobar actualizaciÃ³n del badge.

