# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Progreso de RemediaciÃ³n â€” `feat/milu-auditoria-remediacion`

BitÃ¡cora de cambios efectivos en la rama de remediaciÃ³n. Cada entrada referencia commit, archivos y verificaciÃ³n.

> AuditorÃ­a base: [09_auditoria_2026.md](09_auditoria_2026.md)
> Plan completo: [10_plan_remediacion.md](10_plan_remediacion.md)

---

## âœ… D3 â€” `/save-json` con escritura atÃ³mica (2026-05-13)

### Objetivo aplicado
Eliminar la escritura directa vulnerable en `handleSaveJson` sin alterar contrato HTTP, payload, formato JSON ni ruta de persistencia.

### ImplementaciÃ³n
- Archivo modificado: `server.js`
- Cambio puntual:
   - antes: `fs.promises.writeFile(filePath, JSON.stringify(...))`
   - ahora: `writeJsonAtomic(filePath, json)`
- Alcance deliberadamente mÃ­nimo: solo el punto de escritura final dentro de `handleSaveJson`.

### Contrato preservado
- misma ruta: `POST /save-json` y alias `POST /save-json.php`
- mismo JSON persistido con pretty-print y salto final
- mismos cÃ³digos HTTP y envelopes de error/Ã©xito

### ValidaciÃ³n ejecutada
- `node --test tests/security/write-validation.test.js` âœ…
- `npm test` âœ…
- `npm run test:all-smoke` âœ…
- `npm run test:security` âœ…

### Resultado
- `/save-json` queda alineado con el patrÃ³n atÃ³mico ya usado en otros endpoints de escritura.

### Rollback
- Revertir el cambio puntual en `handleSaveJson` dentro de `server.js`.

---

## âœ… D4 â€” Locks de escritura en `apply-decision` (2026-05-13)

### Objetivo aplicado
Reducir el riesgo de carrera entre escrituras concurrentes sobre los mismos `engine_*.json` al aplicar decisiones de PN review por SKU y por ID.

### Endpoints protegidos
- `POST /pn-review/:sku/apply-decision`
- `POST /pn-review/by-id/:id/apply-decision`

### PatrÃ³n aplicado
- lock por fichero con `withSaveJsonFileLock(file, async () => { ... })`
- alcance del lock limitado a la secciÃ³n crÃ­tica read-modify-write
- sin locks en endpoints de solo lectura
- sin locks anidados aÃ±adidos

### Cobertura aÃ±adida
- `tests/security/write-validation.test.js`
- Nuevo test: roundtrip HTTP de `POST /pn-review/by-id/:id/apply-decision`
   - localiza un registro reversible desde `GET /pn-review/list` + `GET /pn-review/:sku/sources`
   - aplica una decisiÃ³n distinta
   - restaura el estado original con el mismo endpoint
   - no deja mutaciones persistentes

### ValidaciÃ³n ejecutada
- `node -c server.js` âœ…
- `node --test tests/security/write-validation.test.js` âœ…
- `npm test` âœ…
- `npm run test:all-smoke` âœ…
- `npm run test:security` âœ…

### Resultado
- `apply-decision` por SKU y por ID quedan serializados por fichero.
- La suite de seguridad pasa de 16 a 17 tests.

### Rollback
- Revertir los bloques `withSaveJsonFileLock(...)` aÃ±adidos en `server.js`.
- Revertir el test de roundtrip en `tests/security/write-validation.test.js`.

### Deuda residual relacionada
- No hay prueba especÃ­fica de concurrencia real multi-request; el lock queda validado funcionalmente, no bajo estrÃ©s paralelo.

---

## âœ… D7 â€” Cobertura smoke para `/pn-review/:sku/sources` (2026-05-13)

### Objetivo aplicado
Blindar con smoke test el endpoint `GET /pn-review/:sku/sources`, que habÃ­a fallado previamente por un `ReferenceError` tras la extracciÃ³n a servicios en AR-2.

### ImplementaciÃ³n
- Archivo modificado: `tests/smoke/http-smoke.test.js`
- Estrategia:
   - obtener un SKU real y estable desde `GET /pn-review/list?limit=1`
   - consultar despuÃ©s `GET /pn-review/:sku/sources`
   - validar `200`, `Content-Type` JSON, ausencia de `ReferenceError` en el body y estructura mÃ­nima (`ok`, `sku`, `count`, `rows`)
- DecisiÃ³n deliberada: sin fixtures artificiales ni dependencia de estado de escritura; solo lectura sobre datos ya indexados por el backend.

### Bug previo cubierto
- Endpoint protegido: `GET /pn-review/:sku/sources`
- RegresiÃ³n cubierta: uso de funciÃ³n eliminada (`ensurePnReviewQaDataLoaded`) que provocaba `ReferenceError` en runtime.

### ValidaciÃ³n ejecutada
- `node --test tests/smoke/http-smoke.test.js` âœ…
- `npm test` âœ…
- `npm run test:all-smoke` âœ…
- `npm run test:security` âœ…

### Resultado
- Smoke HTTP pasa de 12 a 13 tests.
- El endpoint queda cubierto dentro de la suite oficial sin cambiar contratos HTTP.

### Rollback
- Revertir el test aÃ±adido en `tests/smoke/http-smoke.test.js`.

---

## âœ… UX-3 â€” Cierre fase 2 (migraciÃ³n de 8 alertas directas) (2026-05-13)

### Objetivo aplicado
Completar UX-3 en el runtime frontend migrando las alertas directas pendientes fuera del lote inicial, sin tocar confirmaciones UX-4, prompts funcionales ni lÃ³gica de negocio.

### Inventario antes/despuÃ©s
- Antes de fase 2:
   - `alert(` runtime aprox: 109
   - deuda residual directa: 8 (`bulk-revision-helper.js`: 4, `cell-editor.js`: 3, `revision.js`: 1)
- DespuÃ©s de fase 2:
   - `alert(` runtime aprox: 101
   - alertas directas fuera de adaptadores/fallback: 0
   - `confirm(` runtime: 2 (sin cambios)
   - `prompt(` runtime: 2 (sin cambios)

### ClasificaciÃ³n aplicada (8/8)
- `js/bulk-revision-helper.js`
   - 2 avisos de precondiciÃ³n -> `warning`
   - 1 resultado de operaciÃ³n -> `success` si `result.success`, `error` en caso contrario
   - 1 excepciÃ³n capturada -> `error`
- `js/cell-editor.js`
   - 2 fallos operativos recuperables -> `error`
   - 1 modo solo lectura -> `info`
- `js/revision.js`
   - 1 fallo de persistencia asÃ­ncrona -> `error`

### Cambios de implementaciÃ³n
- Imports explÃ­citos de `showToast` aÃ±adidos para evitar dependencias implÃ­citas por pÃ¡gina:
   - `js/bulk-revision-helper.js`
   - `js/cell-editor.js`
   - `js/revision.js`
- SustituciÃ³n completa de `alert(...)` por `showToast(...)` en los tres mÃ³dulos.

### Compatibilidad
- No se requiriÃ³ tocar HTML: los mÃ³dulos consumen `toast.js` por import ES directo.
- Resultado: sin riesgo de `ReferenceError` por `showToast` al cargar estos scripts.

### ValidaciÃ³n ejecutada
- `npm test` âœ…
- `npm run test:all-smoke` âœ…
- `npm run test:security` âœ…
- `get_errors` en archivos tocados: sin errores âœ…
- BÃºsqueda en alcance UX-3 fase 2:
   - `alert(` en `bulk-revision-helper.js`/`cell-editor.js`/`revision.js`: 0 âœ…

### Resultado de UX-3
âœ… UX-3 queda **COMPLETADO** (fase 1 + fase 2).

### Rollback UX-3 fase 2
- Revertir cambios en:
   - `js/bulk-revision-helper.js`
   - `js/cell-editor.js`
   - `js/revision.js`
- Si se requiere rollback total UX-3: ademÃ¡s revertir adaptadores de fase 1 y eliminar `js/toast.js`.

### Deuda residual UX-3
- No quedan alertas directas pendientes fuera de adaptadores/fallback.
- Deuda menor: consolidar en lote futuro los adaptadores locales `alert(...)` de fase 1 en una API de notificaciÃ³n comÃºn para reducir duplicaciÃ³n heurÃ­stica.

---

## ðŸŸ¡ UX-3 â€” Sistema de toasts central (fase inicial) (2026-05-13)

### Objetivo aplicado
Introducir notificaciones no bloqueantes para alertas informativas, de Ã©xito y errores no destructivos, manteniendo UX-4 intacto para acciones crÃ­ticas.

### Inventario frontend (aprox.)
- Conteo runtime (sin `docs/`, `tests/`, `dist/`, `node_modules/`):
   - `alert(`: ~109
   - `confirm(`: ~2
   - `prompt(`: ~2
- Alcance inicial priorizado:
   - `js/qa-milu.js`
   - `js/analista-02.js`
   - `js/qa-analista-registro.js`

### Helper creado
- `js/toast.js`
- API: `showToast(message, type, options)`
- Tipos soportados: `success`, `error`, `warning`, `info`.
- Capacidades incluidas:
   - contenedor Ãºnico en esquina superior derecha
   - cierre automÃ¡tico configurable (`duration`)
   - botÃ³n de cierre manual
   - deduplicaciÃ³n temporal (`dedupeWindowMs`)
   - `aria-live` y `role=alert/status`
   - no bloquea interacciÃ³n

### MigraciÃ³n incremental aplicada
- En los 3 archivos objetivo se adaptaron las `alert()` legacy hacia `showToast(...)` mediante adaptador local (sin alterar lÃ³gica de negocio ni flujo de control).
- Cobertura migrada en este lote: ~98 llamadas `alert()` de los tres mÃ³dulos.

### Casos no migrados en esta fase y motivo
- Confirmaciones crÃ­ticas (`confirm`) protegidas por UX-4: se mantienen.
- Prompts funcionales: se mantienen.
- Alertas fuera del alcance inicial (`bulk-revision-helper.js`, `cell-editor.js`, `revision.js`, etc.): diferidas al siguiente lote UX-3.

### ValidaciÃ³n ejecutada
- `npm test` âœ…
- `npm run test:all-smoke` âœ…
- `npm run test:security` âœ…
- ValidaciÃ³n de errores/sintaxis en archivos tocados âœ…

### Checklist manual recomendado (UX-3)
- aparece toast `success`
- aparece toast `error`
- aparece toast `warning/info`
- botÃ³n cerrar funciona
- autocierre funciona
- no tapa controles crÃ­ticos
- no se duplican toasts de forma absurda
- confirmaciones UX-4 siguen funcionando
- acciones peligrosas siguen exigiendo palabra tipada

### Riesgos y deuda residual
- Persisten `alert()` en mÃ³dulos fuera del alcance de este lote.
- El conteo bruto de `alert(` puede variar por adaptadores locales, aunque la UX ya es no bloqueante en los 3 archivos migrados.

### Rollback UX-3 (fase inicial)
- Revertir import/adaptador en:
   - `js/qa-milu.js`
   - `js/analista-02.js`
   - `js/qa-analista-registro.js`
- Eliminar `js/toast.js` si se revierte completamente UX-3.

---

## âœ… UX-4 â€” ConfirmaciÃ³n tipada para acciones crÃ­ticas (2026-05-13)

### Objetivo aplicado
Reducir errores de operaciÃ³n en acciones irreversibles o de impacto masivo, sin cambiar lÃ³gica de negocio ni contratos HTTP.

### Inventario de acciones peligrosas (frontend)
- Barrido ejecutado sobre HTML/JS runtime: `confirm(`, `alert(`, `prompt(`, `fetch POST/DELETE` y acciones `bulk/apply/reset/discard/save/sync`.
- Resultado bruto: 788 coincidencias en 84 ficheros (incluye informativas/debug/no crÃ­ticas).
- Ficheros con mayor concentraciÃ³n operativa: `js/qa-milu.js`, `js/analista-02.js`, `js/qa-auditoria.js`, `js/pn-review.js`, `js/pn-review-embedded.js`.

### Criterio UX-4 aplicado
- ConfirmaciÃ³n tipada solo para acciones crÃ­ticas:
   - multi-registro / multi-motor
   - borrar/descartar/resetear/recalcular/aplicar en bloque
- Se mantienen fuera de UX-4:
   - `alert()` informativos y de error no destructivo (migraciÃ³n diferida a UX-3)
   - acciones unitarias reversibles

### Helper creado
- `js/confirm-typed-action.js`
- API: `confirmTypedAction({ title, message, expectedText, confirmLabel, cancelLabel, dangerLevel })`
- Propiedades:
   - modal ligero sin librerÃ­as externas
   - cancelaciÃ³n sin efectos secundarios
   - ejecuciÃ³n bloqueada hasta coincidencia exacta del texto
   - accesibilidad mÃ­nima: foco inicial, Escape cierra, Enter solo confirma con texto vÃ¡lido
   - fallback seguro si hay mÃ¡s de una confirmaciÃ³n activa (no confirma)

### Acciones protegidas con confirmaciÃ³n tipada
- `js/qa-milu.js`
   - `applyBulkQuickMode(...)` (cambios masivos en filtrados/visibles)
   - palabras: `APLICAR`, `RESET`, `DESCARTAR` segÃºn acciÃ³n
- `js/analista-02.js`
   - `runQuickRecomputeForFullBook()`
   - `applyPnCopyPropagationForCurrentBook()`
   - palabra: `APLICAR`
- `js/qa-auditoria.js`
   - borrado total de auditorÃ­a (`DELETE /audit-log`)
   - palabra: `BORRAR`
- `js/pn-review.js`
   - aplicaciÃ³n de decisiÃ³n por PN (`/pn-review/:sku/apply-decision`)
   - palabras: `APLICAR` o `DESCARTAR`
- `js/pn-review-embedded.js`
   - aplicaciÃ³n de decisiÃ³n por PN/ID (`/pn-review/:sku/apply-decision`, `/pn-review/by-id/:id/apply-decision`)
   - palabras: `APLICAR` o `DESCARTAR`

### Acciones no protegidas en esta fase y motivo
- `alert()` de feedback y navegaciÃ³n en `qa_milu`, `analista-02`, `qa-analista-registro`.
- Motivo: pertenecen a UX-3 (toasts), no son confirmaciones destructivas.

### ValidaciÃ³n ejecutada
- `npm test` âœ…
- `npm run test:all-smoke` âœ…
- `npm run test:security` âœ…
- VerificaciÃ³n de sintaxis/errores en ficheros tocados âœ…

### Riesgos residuales
- Quedan `alert()`/`confirm()` no crÃ­ticos pendientes de UX-3 (experiencia de uso, no integridad de datos).
- Los diÃ¡logos tipados en `pn-review.js` y `pn-review-embedded.js` usan fallback a `prompt` si el `<dialog>` no existe en la vista.

### Rollback UX-4
- Revertir import y llamadas a helper en:
   - `js/qa-milu.js`
   - `js/analista-02.js`
   - `js/qa-auditoria.js`
   - `js/pn-review.js`
   - `js/pn-review-embedded.js`
- Eliminar `js/confirm-typed-action.js` si se revierte completamente UX-4.

---

## âœ… BK-2 â€” PHP fÃ­sicos movidos a legacy (2026-05-13)

### Objetivo aplicado
Reducir exposiciÃ³n de ficheros PHP fÃ­sicos en raÃ­z, manteniendo contratos HTTP y compatibilidad con publicaciÃ³n legacy.

### Inventario `.php` detectado
- `qa_revision_sync.php` (raÃ­z)
- `save-json.php` (raÃ­z)
- `Copia_seguridad_v1.01/qa_revision_sync.php`
- `Copia_seguridad_v1.01/save-json.php`
- `dist/milu_publish/qa_revision_sync.php`
- `dist/milu_publish/save-json.php`

### ClasificaciÃ³n
- Activos (rutas HTTP): `GET|POST /qa_revision_sync.php`, `GET|POST /save-json.php` (servidos por Express).
- Legacy necesarios para hosting sin Node: `qa_revision_sync.php`, `save-json.php` (ahora en `legacy/php/` como fuente de publicaciÃ³n).
- Obsoletos: copias en `Copia_seguridad_v1.01/*`.
- Generados/salida: `dist/milu_publish/*.php`.
- Dudosos: ninguno bloqueante tras validaciÃ³n de rutas y tests.

### Cambios realizados
- `qa_revision_sync.php` -> `legacy/php/qa_revision_sync.php`
- `save-json.php` -> `legacy/php/save-json.php`
- `scripts/prepare-pages-dist.js` actualizado con fallback de origen para ambos `.php` desde `legacy/php/`, manteniendo el destino en raÃ­z de `dist/milu_publish/`.

### Referencias revisadas
- CÃ³digo activo mantiene referencias de compatibilidad `.php` en:
   - `server.js` (handlers explÃ­citos y alias)
   - `js/data-loader.js` (candidatos remotos/locales)
   - `scripts/prepare-pages-dist.js` (listado de publicaciÃ³n)
- No se detectaron llamadas activas inesperadas a otros `.php` fuera de esos flujos.

### ValidaciÃ³n ejecutada
- `npm test` âœ…
- `npm run test:all-smoke` âœ…
- `npm run pages:prepare:dry` âœ… (sigue incluyendo `qa_revision_sync.php` y `save-json.php` en salida)
- VerificaciÃ³n HTTP manual:
   - `GET /qa_revision_sync.php` -> `200 application/json`
   - `GET /save-json.php` -> `200 application/json`

### Resultado
BK-2 queda cerrado sin cambios de contrato HTTP ni regresiÃ³n en smoke tests.

### Riesgos residuales
- Si un despliegue legacy dependÃ­a de PHP fÃ­sicos en raÃ­z del repo (sin pasar por `pages:prepare`), debe actualizar su proceso para usar `legacy/php/` como fuente.
- Copias en `Copia_seguridad_v1.01/` se mantienen por ahora como histÃ³rico y pueden confundir inventarios futuros.

### Rollback
- `git mv legacy/php/qa_revision_sync.php qa_revision_sync.php`
- `git mv legacy/php/save-json.php save-json.php`
- Revertir el fallback aÃ±adido en `scripts/prepare-pages-dist.js`.

---

## âœ… CIERRE FORMAL AR-2 â€” Separar capas backend (2026-05-13)

### Resumen tÃ©cnico
AR-2 se da por cerrado tras completar 4 fases incrementales sobre el backend Express, mÃ¡s una auditorÃ­a final exhaustiva con correcciÃ³n de bug crÃ­tico detectado.

### Alcance conseguido
- `server/services/revision-sync.js` â€” lÃ³gica de normalizaciÃ³n/persistencia de `qa_revision_server_data.json` completamente extraÃ­da.
- `server/services/revision-apply.js` â€” orquestaciÃ³n de `applyRevisionPayload` separada como servicio con callback `onApplied`.
- `server/services/pn-review-qa-cache.js` â€” factory de cache/Ã­ndice de PN review con todas las helper functions internas encapsuladas.
- `server.js` queda como capa HTTP pura: wiring de rutas, validaciÃ³n de entrada/salida y helpers de utilidad genÃ©rica (serializaciÃ³n, locks de archivo, fingerprinting).

### Bug crÃ­tico corregido en cierre (Fase 4)
- **Endpoint:** `GET /pn-review/:sku/sources`
- **Causa:** llamada a `ensurePnReviewQaDataLoaded()` (funciÃ³n eliminada en Fase 3, no reemplazada).
- **Efecto:** ReferenceError en runtime al consultar fuentes de un PN; no detectado por suite de smoke tests porque el endpoint no estaba cubierto.
- **Fix:** reemplazado por `pnReviewQaCacheService.load()` (lÃ­nea 886 de `server.js`).
- **LecciÃ³n:** la cobertura se aÃ±adiÃ³ en el cierre del bloque con el nuevo smoke test de `GET /pn-review/:sku/sources`.

### AuditorÃ­a de deuda residual (no bloqueante)
Los siguientes hallazgos se documentan como deuda tÃ©cnica futura; **ninguno es un bug activo ni bloquea operaciones**:

| # | Hallazgo | Riesgo | AcciÃ³n recomendada |
|---|----------|--------|-------------------|
| D1 | `decisionMap`/`explicitMap` duplicados literalmente en `/pn-review/:sku/apply-decision` y `/pn-review/by-id/:id/apply-decision` | Bajo | Extraer constante de mÃ³dulo en AR-2 follow-up o AR-5 |
| D2 | Helpers `normalizeText`, `lowerKey`, `collapseSpaces`, `pnKey`, `uniq`, `pickMostFrequent` duplicados en `server.js` y `pn-review-qa-cache.js` | Bajo | Extraer a `server/utils/text-helpers.js` |
| D3 | Resuelto | Cerrado | `handleSaveJson` ya usa `writeJsonAtomic` |
| D4 | Resuelto | Cerrado | `apply-decision` por SKU e ID ya usa `withSaveJsonFileLock` |
| D5 | `_esquemasPosIndexCache` no tiene mecanismo de invalidaciÃ³n; si se aÃ±aden archivos a `esquemas_pos_circulos/` en runtime, el Ã­ndice queda obsoleto hasta reinicio | Bajo | AÃ±adir TTL o endpoint de invalidaciÃ³n explÃ­cita |
| D6 | `exportRunState.running` puede quedar `true` ante excepciÃ³n no capturada fuera del bloque try/catch de `withExportLock` | Bajo | El `finally` del lock lo resetea correctamente; riesgo real solo ante `process.exit` o SIGKILL |
| D7 | Resuelto | Cerrado | `tests/smoke/http-smoke.test.js` ya cubre `GET /pn-review/:sku/sources` con SKU derivado de `GET /pn-review/list` |

### Riesgos residuales
- El resto (D1, D2, D5, D6) son calidad de cÃ³digo o casos extremos.

### ValidaciÃ³n final AR-2
- `npm test` â†’ 69/69 âœ… (13 smoke + 10 db-read + 20 db-analytics + 8 schema + 16 python-lib + 2 python-exporters)
- `node --test tests/security/write-validation.test.js` â†’ 17/17 âœ…
- `node -c server.js` âœ…
- `node -c server/services/*.js` âœ…

### Por quÃ© se considera cerrado con deuda residual
AR-2 tenÃ­a como objetivo desacoplar lÃ³gica de negocio QA del handler HTTP en `server.js`. Ese objetivo se ha cumplido para los tres dominios principales (revisiÃ³n-sync, revisiÃ³n-apply, pn-review-cache). La deuda residual real tras el cierre queda acotada a D1, D2, D5 y D6; D3, D4 y D7 quedaron resueltos y validados en verde dentro del mismo bloque.

### Estado AR-2
âœ… CERRADO â€” 2026-05-13

---

## Propuesta siguiente bloque: BLOQUE-UX (UX-3 + UX-4 + BK-2)

### EvaluaciÃ³n de candidatos

| Tarea | Impacto op. | Riesgo regresiÃ³n | Dificultad | Dependencia |
|-------|------------|-----------------|------------|-------------|
| **UX-3** Toasts (sustituir `alert()`) | Alto â€” flujo QA sin interrupciones modales | Medio (152 ocurrencias, cambio transversal) | M | Ninguna |
| **UX-4** ConfirmaciÃ³n tipada acciÃ³n irreversible | Medio â€” previene errores destructivos | Bajo (solo aÃ±ade UI, no modifica lÃ³gica) | S | Ninguna; natural secuela de UX-3 |
| **BK-2** Mover `.php` a `legacy/` | Bajo â€” archivos inactivos, riesgo estÃ©tico | Muy bajo (files no ejecutados) | S | BK-1 ya OK |
| **BK-3** Compression + Cache-Control | Bajo en localhost | Bajo | S | Ninguna |
| **QW-6** (= UX-3) | Ã­dem UX-3 | Ã­dem | Ã­dem | Ã­dem |

### Bloque Ã³ptimo recomendado: BLOQUE-UX-3/4 + BK-2

**RazÃ³n:** UX-3 y UX-4 son el mayor Quick Win de UX pendiente: eliminan las interrupciones modales del flujo de revisiÃ³n QA y aÃ±aden seguridad en operaciones destructivas. BK-2 es S/baja y limpia el repo sin riesgo.

### Plan tÃ©cnico incremental

**Quick wins (S â€” 1 sesiÃ³n):**
1. **BK-2**: `mv qa_revision_sync.php legacy/php/ ; mv save-json.php legacy/php/`. Verificar que Express sigue respondiendo `/qa_revision_sync.php` y `/save-json.php`. AÃ±adir comentario en `server.js` aclarando que los `.php` de la raÃ­z son legacy inactivos.
2. **UX-4**: modal/dialog nativo con input de confirmaciÃ³n tipada. Implementar en nuevo mÃ³dulo `js/confirm-dialog.js`. Integrar en los flujos: "Aplicar revisiÃ³n masiva", "Recalcular PDFs (todos)", "Borrar revisiÃ³n completa". Test manual smoke.

**Trabajo medio (M â€” 2-3 sesiones):**
3. **UX-3**: crear `js/notify.js` con `notify(level, msg, [durationMs])` usando un toast container inyectado una sola vez. Sustituir `alert()` progresivamente por archivo: primero `qa_milu.html`, luego `analista_02.html`, luego el resto. El nÃºmero de 152 ocurrencias incluye JS inline en HTML; hacer script de bÃºsqueda para inventariar antes de reemplazar.

### Estrategia de validaciÃ³n
- Cada sustituciÃ³n de `alert()` debe ir acompaÃ±ada de una revisiÃ³n manual del flujo afectado.
- No hay smoke test automatizado para toasts; documentar en `docs/testing/UX3_TOASTS_MANUAL_SMOKE.md`.
- Tras UX-3, `npm test` debe seguir en verde (cambio puramente de UI, sin tocar backend).
- Para UX-4, verificar que el modal no bloquea operaciones no destructivas.

### Estrategia de rollback
- BK-2: reversible con `git mv` de vuelta si aparece alguna ruta inesperada que sirva el PHP fÃ­sico.
- UX-3: rollback por commit; cada archivo HTML/JS se modifica de forma atÃ³mica.
- UX-4: mÃ³dulo nuevo, sin cambios en lÃ³gica; rollback = eliminar la llamada al modal.

### Smoke tests necesarios post-bloque
- `npm test` completo (68 tests) en verde.
- Smoke manual: flujo de revisiÃ³n QA sin `alert()` bloqueante.
- Smoke manual: intento de acciÃ³n destructiva â†’ aparece confirmaciÃ³n tipada.
- Verificar `GET /qa_revision_sync.php` y `POST /save-json` siguen OK tras BK-2.

### Deuda tÃ©cnica a resolver en bloque posterior (no UX)
- D1/D2: consolidaciÃ³n de constantes y helpers duplicados en backend.
- D5: invalidaciÃ³n explÃ­cita o TTL para `_esquemasPosIndexCache`.
- D6: reforzar manejo de `exportRunState` ante terminaciÃ³n abrupta de proceso.

---

## Cambio actual - AR-2 fase 1-2 (servicios de revision QA)

### Objetivo aplicado
- Continuar AR-2 con dos cortes pequenos sobre backend QA: separar de `server.js` la logica de sincronizacion de revisiones y la orquestacion de aplicacion de revisiones, manteniendo los contratos HTTP intactos.

### Cambios principales
- Nuevo modulo: `server/services/revision-sync.js`.
   - Extrae `normalizeRevisionSyncPayload`, `ensureRevisionSyncFile`, `readRevisionSyncPayload` y `writeRevisionSyncPayload`.
- Nuevo modulo: `server/services/revision-apply.js`.
   - Centraliza la orquestacion de `applyRevisionPayload(...)` para el endpoint `POST /apply-revision-to-engines`.
- `server.js` conserva validacion, respuesta HTTP y wiring, pero deja de contener inline esa logica de revision QA.

### Alcance y no-cambios
- Sin cambios en UI.
- Sin cambios en estructura JSON.
- Sin cambios en contratos de `GET/POST /qa_revision_sync.php`.
- Sin cambios en contrato de `POST /apply-revision-to-engines`.
- Sin cambios en backend no relacionado con revision QA.

### Verificacion ejecutada
- `npm run test:smoke` OK.
- `node --test tests/security/write-validation.test.js` OK.
   - `/apply-revision-to-engines payload vacio -> 400 VALIDATION_ERROR`.
   - `/apply-revision-to-engines revisiones vacias -> 200 ok no-op`.
- `node --check server.js` OK.
- `node --check server/services/revision-sync.js` OK.
- `node --check server/services/revision-apply.js` OK.

### Estado AR-2
- ðŸŸ¡ INICIADO â€” fase 1 y fase 2 completadas.

## Cambio actual - Cierre AR-3 (capa comÃºn Python incremental)

## Cambio aplicado - AR-2 fase 3 (cache service de PN review QA)

### Objetivo aplicado
- Completar tercera iteraciÃ³n AR-2: encapsular el estado/cache de PN review QA (`pnReviewQaCache`) junto con toda la lÃ³gica de construcciÃ³n de Ã­ndice (helper functions) en un servicio factory reutilizable.

### Cambios principales
- Nuevo mÃ³dulo: `server/services/pn-review-qa-cache.js`.
   - Factory `createPnReviewQaCacheService(options)` que exporta `load()`, `invalidate()`, `getLoadedAt()`.
   - Encapsula estado interno: `loadedAt`, `engineFingerprints`, `payload` con lÃ³gica de fingerprinting/detecciÃ³n de cambios.
   - Contiene helper functions internas: normalizaciÃ³n de texto, construcciÃ³n de merged_fields, validaciÃ³n de PN, mapeo de filas, etc.
   - Recibe como dependencias: `repoRoot`, `buildQaSummaryFromExport`, `decideByQa`, `engineJsonFiles`.
- `server.js` refactorizado:
   - Instancia `pnReviewQaCacheService` con opciones.
   - Reemplaza `ensurePnReviewQaDataLoaded()` con `pnReviewQaCacheService.load()`.
   - Reemplaza `invalidatePnReviewQaCache()` con `pnReviewQaCacheService.invalidate()`.
   - Reemplaza `pnReviewQaCache.loadedAt` con `pnReviewQaCacheService.getLoadedAt()`.
   - Elimina ~95 lÃ­neas de lÃ³gica de cache y helpers (movidas al servicio).

### Alcance y no-cambios
- Sin cambios en UI.
- Sin cambios en estructura JSON.
- Sin cambios en contratos HTTP de `/pn-review/*`.
- Sin cambios en backend no relacionado con PN review cache.

### VerificaciÃ³n ejecutada
- `npm run test:smoke` 12/12 âœ… OK (incluyendo `GET /pn-review/list`).
- `node --test tests/security/write-validation.test.js` 16/16 âœ… OK (incluyendo cache invalidation en endpoints de escritura).
- `node -c server.js` âœ… OK (sintaxis vÃ¡lida).
- `node -c server/services/pn-review-qa-cache.js` âœ… OK.

### Estado AR-2
- ðŸŸ¡ INICIADO â€” fases 1, 2, 3 completadas.
- Commit: 92ab4071 (fases 1-2) + 48468220 (fase 3).

## Cambio actual - Cierre AR-3 (capa comÃºn Python incremental)

### Objetivo aplicado
- Cerrar formalmente AR-3 sin refactor masivo: dar por consolidado el conjunto crÃ­tico ya migrado y validado, dejando fuera de alcance el legacy auditado no bloqueante.

### MÃ³dulos creados (`python_lib/`)
- `python_lib/repo_paths.py`: wrapper comÃºn para resoluciÃ³n portable de raÃ­z del repo (`resolve_repo_dir`, `should_log_repo_resolution`).
- `python_lib/json_io.py`: carga/escritura JSON estandarizada (`utf-8-sig` lectura, `ensure_ascii=False`, `indent=2` escritura).
- `python_lib/engine_helpers.py`: normalizaciÃ³n, comparaciÃ³n QA, split medida/norma, cÃ¡lculo de flags de error por registro.
- `python_lib/engine_constants.py`: constantes canÃ³nicas compartidas (`ENGINE_FILES`, patrones, tokens, etc.).
- `python_lib/logging_utils.py`: helper ligero de logging con prefijo de script.
- `python_lib/schema_validation.py`: wrapper Python para validar esquema formal vÃ­a `scripts/validate-engine-schema.js`.
- `python_lib/snapshot_utils.py`: helper de lectura de snapshots (`latest_snapshot_name`, ruta estÃ¡ndar `data/snapshots`).

### Scripts migrados (sin cambio funcional)
- `depuracion_json.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y `python_lib.engine_helpers`.
- `add_final_fields.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y `python_lib.engine_helpers`.
- `importar_json.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y `python_lib.engine_constants`.
- `estadisticas_articulos.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y constantes compartidas.
- `informe_estadisticas.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y constantes compartidas.
- `convert_engine_to_excel.py`: usa `python_lib.repo_paths` y `python_lib.json_io` para cargar `engine_*.json` sin rutas frÃ¡giles.
- `convert_engines.py`: usa `python_lib.repo_paths`, `python_lib.json_io` y la lista canÃ³nica `ENGINE_FILES`.
- `convert_excel_to_json.py`: usa `python_lib.repo_paths` y `python_lib.json_io` para persistencia JSON uniforme.

### AuditorÃ­a de exportadores/auxiliares restantes
- `extraccion_de_pdf_a_excel/milu_export_paginas_v1.py`: exportador de pÃ¡ginas PDF a PNG; no comparte IO JSON ni lista de engines.
- `extraccion_de_pdf_a_excel/milu_export_esquemas_v6_2.py`: exportador/cropper de esquemas PDF; especializado en CSV/imagen, fuera de la capa comÃºn actual.
- `extraccion_de_pdf_a_excel/milu_export_datos_v6_2.py`: extractor batch PDFâ†’Excel/CSV; depende de librerÃ­as y reglas propias, no candidato a refactor incremental de bajo riesgo en esta fase.
- `compare_measurements.py`: utilidad de diagnÃ³stico; sigue con IO legacy y ademÃ¡s presenta codificaciÃ³n/normalizaciÃ³n pendiente.
- `validate_engine_jsons.py`: validador legacy redundante frente a `scripts/validate-engine-schema.js` y `python_lib.schema_validation`.
- `pretty_print_all_json.py`: utilidad de formateo masivo no crÃ­tica para export.
- `marcar_articulos_en_web.py`: utilidad puntual de escritura masiva sobre engines, no incluida en el flujo crÃ­tico AR-3.

### Pendientes no bloqueantes
- Mantener fuera del cierre AR-3 los exportadores PDF legacy de `extraccion_de_pdf_a_excel/` salvo que pasen a formar parte del flujo oficial.
- Decidir si `compare_measurements.py`, `validate_engine_jsons.py` y `pretty_print_all_json.py` se migran, se archivan o se reemplazan por wrappers de `python_lib` en una fase posterior.
- Definir en fase posterior si conviene entrypoint Ãºnico (`pipelines/run_full.py`) sin romper flujos actuales.

### Deuda tÃ©cnica restante
- No existe aÃºn un entrypoint Python Ãºnico para orquestar el pipeline oficial.
- Quedan utilidades legacy dispersas en raÃ­z con responsabilidades mixtas (diagnÃ³stico, formateo, extracciÃ³n PDF).
- La carpeta `extraccion_de_pdf_a_excel/` mantiene dependencias y contratos propios fuera de `python_lib`.

### Tests y validaciÃ³n
- Nuevo test: `tests/smoke/python-lib.test.js` (16 pruebas, 16/16 OK).
- Nuevo test: `tests/smoke/python-exporters-smoke.test.js` (2 pruebas, 2/2 OK) para `convert_engine_to_excel.py` y `convert_excel_to_json.py` sobre ficheros temporales.
- `python -m py_compile` OK para mÃ³dulos `python_lib/` y scripts migrados, incluyendo exportadores crÃ­ticos.
- `npm run validate:schema` OK (9 engines, 67.883 registros, 0 errores).
- `npm run data:snapshot:compare` OK (9/9 UNCHANGED, Î” registros = 0).
- `npm run check` OK tras integrar test AR-3 en `test:all-smoke`.
- No hubo cambios en backend, UI ni estructura JSON durante este cierre; el alcance quedÃ³ limitado a scripts Python crÃ­ticos, smoke tests y documentaciÃ³n.

### Criterio formal de cierre AR-3
- Scripts crÃ­ticos migrados a `python_lib` para IO/path/helpers comunes: `depuracion_json.py`, `add_final_fields.py`, `importar_json.py`, `estadisticas_articulos.py`, `informe_estadisticas.py`, `convert_engine_to_excel.py`, `convert_engines.py`, `convert_excel_to_json.py`.
- `python -m py_compile` OK sobre `python_lib/` y scripts crÃ­ticos migrados.
- `npm run validate:schema` OK (0 errores).
- `npm run data:snapshot:compare` OK (sin cambios).
- `npm run check` OK.

### Estado AR-3
âœ… CERRADO â€” 2026-05-13

### ConclusiÃ³n operativa
- AR-3 se cierra sobre el conjunto crÃ­tico migrado y validado.
- `extraccion_de_pdf_a_excel/*` y utilidades legacy auditadas quedan explÃ­citamente fuera de alcance en esta fase y pasan a deuda tÃ©cnica futura no bloqueante.
- La deuda de orquestaciÃ³n/entrypoint Ãºnico sigue documentada, pero no impide el cierre formal del objetivo incremental definido para AR-3.

---

## Cambio actual - Cierre DT-3 (snapshots versionados engine_*.json)

### Objetivo aplicado
- Proteger los datos crÃ­ticos engine_*.json con un sistema ligero de snapshots locales, reproducible y auditable, sin dependencias externas ni base de datos.

### Cambios principales
- **`scripts/create-data-snapshot.js`** (nuevo): copia los 9 engines + genera `manifest.json` con SHA-256, nÂº registros, size_bytes, schema_version, label, host, node_version. Valida esquema antes de crear snapshot (salvo `--no-validate`). Modos: `--dry-run`, `--label=<texto>`.
- **`scripts/compare-data-snapshot.js`** (nuevo): compara snapshot vs estado actual. Detecta UNCHANGED / MODIFIED / ADDED / DELETED. Muestra Î”registros y Î”sha256. Modos: `--list`, `--json`, por nombre de snapshot o Ãºltimo (`latest.json`). Exit 0 = sin cambios, Exit 2 = diferencias.
- **`.gitignore`**: aÃ±adido `data/snapshots/*/` para excluir contenido de snapshots del repo.
- **`data/snapshots/README.md`** (nuevo): instrucciones de uso.
- **`data/snapshots/.gitkeep`** (nuevo): mantiene el directorio en el repo.
- **`package.json`**: aÃ±adidos `"data:snapshot"` y `"data:snapshot:compare"`.

### VerificaciÃ³n
- `npm run data:snapshot --label="DT-3-initial"`: snapshot creado, 9 engines, 67.883 registros, schema 1.0, esquema validado OK.
- `npm run data:snapshot:compare`: 9/9 UNCHANGED, Î” registros = 0.
- `npm run data:snapshot:compare -- --list`: lista 1 snapshot correctamente.
- `npm run data:snapshot -- --dry-run`: muestra manifest sin escribir.

### Estado DT-3
âœ… CERRADO â€” 2026-05-13

---

### Objetivo aplicado
- Crear la fuente formal de verdad del dato para engine_*.json, con esquema versionado, validador sin dependencias externas, tests formales y documentaciÃ³n.

### Cambios principales
- **`schemas/engine-record.schema.json`** (nuevo): JSON Schema draft-07 con 67 campos mapeados, enums para `qa_revision_estado` / `qa_revision_accion` / `criterio_pn` / `engine_model` / etc., compatibilidad legacy documentada.
- **`scripts/validate-engine-schema.js`** (nuevo): validador Node.js puro sin dependencias. Modos `--summary` / por fichero. Exit 0/1 para CI.
- **`tests/smoke/engine-schema.test.js`** (nuevo): 8 tests con `node:test`. Integrado en `npm test` vÃ­a `test:all-smoke`.
- **`package.json`**: aÃ±adido `"validate:schema"` y el test integrado en `test:all-smoke`.
- **`docs/modules/engine_schema.md`** (nuevo): documentaciÃ³n completa â€” campos required, opcionales, legacy, aliases, editables, notas de compatibilidad.

### VerificaciÃ³n
- `npm run validate:schema`: 67.883 registros, 0 errores schema en los 9 engines.
- `node --test tests/smoke/engine-schema.test.js`: 8/8 OK.

### Estado DT-2
âœ… CERRADO â€” 2026-05-13

---

## Cambio actual - Cierre UX-2 (virtualizaciÃ³n de tabla)

### Objetivo aplicado
- Reducir coste de render en tablas grandes sin incorporar frameworks adicionales y sin cambiar contratos backend.

### Cambios principales
- Frontend:
   - `js/qa-table.js`
      - Se aÃ±ade windowing/virtualizaciÃ³n con overscan para `main` y `errors`.
      - ActivaciÃ³n automÃ¡tica cuando la paginaciÃ³n estÃ¡ desactivada y el nÃºmero de filas supera umbral.
      - Scroll listeners pasivos + `requestAnimationFrame` para re-render de ventana visible.
      - Compatibilidad con selecciÃ³n por teclado y `focusRevisionRowInMainTable` asegurando visibilidad de fila seleccionada.
      - MÃ©trica opcional de depuraciÃ³n en barra de stats con `?virtualDebug=1` o `localStorage.miluVirtualDebug='1'`.
   - `styles/qa_milu.css`
      - Se aÃ±aden estilos mÃ­nimos para filas espaciadoras virtuales (`tr.virtual-spacer`).

### VerificaciÃ³n
- `npm run check` âœ…
- `npm run test:security` âœ…
- ValidaciÃ³n de sintaxis/diagnÃ³stico en archivos modificados: sin errores (`js/qa-table.js`, `styles/qa_milu.css`).

### Alcance
- El comportamiento clÃ¡sico con paginaciÃ³n activa se mantiene sin cambios funcionales.
- La virtualizaciÃ³n entra en juego en escenarios de alto volumen (sin paginaciÃ³n), que es donde aporta mayor mejora de UX.

---

## Cambio actual - Validacion funcional UX-2 (virtualizacion)

### Objetivo aplicado
- Validar en UI real que la virtualizacion de tabla (windowing + overscan) funciona con dataset visible y conserva interacciones clave.

### Evidencia manual (UI + DOM)
- Entorno: `qa_milu.html?virtualDebug=1`, `Paginacion: OFF`, `Vista errores`.
- Dataset visible confirmado: total filtrado **3746** filas.
- DOM virtualizado confirmado:
  - filas renderizadas: **21**
  - espaciadores virtuales: **1-2** segun posicion de scroll
  - ejemplo de alturas de espaciador: `1890px` / `109860px`.
- Cambio de ventana al scroll confirmado:
  - `first` antes: `id=1100001`
  - `first` tras scroll medio: `id=1201440`
  - `first` tras scroll mas profundo: `id=1206099`.
- Navegacion por teclado confirmada (`ArrowDown`/`ArrowUp`):
  - la seleccion pasa de `null` a una fila valida (`id=1206237`) y se mantiene visible
  - el `scrollTop` acompana el movimiento (ejemplo: `49 -> 6750`).

### Compatibilidad funcional verificada
- Filtros y ordenacion en vista errores: operativos sin romper render incremental.
- Cambio de vistas (`pdf`/`qa`/`errors`): operativo (sin crash ni bloqueo de render).
- Controles de revision por fila en vista errores: presentes (selects por fila).
- `lazy=1`: panel incremental visible y operativo (`Motores cargados: 1/9 -> 9/9`).

### Smoke frontend
- Se documenta smoke manual reproducible en: `docs/testing/UX2_VIRTUALIZACION_MANUAL_SMOKE.md`.
- No se anade Playwright en esta fase para evitar friccion de dependencias/runtime en la cadena minima actual.

### Estado UX-2
- **Cerrado parcial**:
  - Implementacion + validacion funcional manual: **cerradas**.
  - Smoke automatizado en repo: **pendiente** (incidencia controlada por decision de no anadir dependencia pesada en esta fase).

---

## Commit `742ca003` â€” Bootstrap backend

**Mensaje:** `fix: bootstrap backend remediation endpoints in audit branch`

### Cambios en [server.js](../server.js)
1. Eliminadas dos de las tres definiciones duplicadas de `app.post('/recompute-pdf-auto', ...)`. Queda una Ãºnica ruta activa.
2. AÃ±adidos helpers de sincronizaciÃ³n de revisiones:
   - `normalizeRevisionRecord`
   - `normalizeRevisionSyncPayload`
   - `ensureRevisionSyncFile`
   - `readRevisionSyncPayload`
   - `writeRevisionSyncPayload`
3. Implementados endpoints en Express (antes los servÃ­a el static middleware o devolvÃ­an 404):
   - `GET /qa_revision_sync.php` â†’ devuelve el JSON normalizado.
   - `POST /qa_revision_sync.php` â†’ mergea payload entrante en [qa_revision_server_data.json](../qa_revision_server_data.json).
   - `POST /apply-revision-to-engines` â†’ aplica revisiones masivas usando `applyRevisionPayload` de [apply_revision_to_engines.js](../apply_revision_to_engines.js).
4. El archivo PHP fÃ­sico ya no se expone como estÃ¡tico: la ruta explÃ­cita gana.

### Cambios en [README.md](../README.md)
- "8 archivos `engine_*.json`" â†’ "9 archivos `engine_*.json`".
- AÃ±adidos `qa_revision_sync.php` y `apply-revision-to-engines` a la secciÃ³n "Endpoints clave".

### VerificaciÃ³n realizada
- `node --check server.js` â†’ OK.
- `GET /health` â†’ 200.
- `GET /qa_revision_sync.php` â†’ JSON vÃ¡lido.
- `POST /apply-revision-to-engines` con payload vacÃ­o â†’ `{ ok: true, result: { appliedByFile: { ...9 motores: 0 cambios } } }`.
- `POST /save-json.php` (ruta antigua errÃ³nea) â†’ 404 (esperado).

---

## SincronizaciÃ³n de documentaciÃ³n (este PR)

### Archivos creados
- [docs/09_auditoria_2026.md](09_auditoria_2026.md): auditorÃ­a completa por Ã¡reas.
- [docs/10_plan_remediacion.md](10_plan_remediacion.md): plan accionable por bloques.
- [docs/11_progreso_remediacion.md](11_progreso_remediacion.md): este documento.

### Archivos actualizados (correcciones de incoherencias)
- [docs/00_overview.md](00_overview.md): 8 â†’ 9 motores; aÃ±adidos `/qa_revision_sync.php` y `/apply-revision-to-engines` a la lista de endpoints.
- [docs/02_data_flow.md](02_data_flow.md): "8 engine_*.json" â†’ "9 engine_*.json".
- [docs/03_data_models.md](03_data_models.md): `measurement_final` â†’ `measure_final`; nota explÃ­cita de que el campo antiguo ya no se persiste.
- [docs/AI_QUICK_CONTEXT_COMPACT.md](AI_QUICK_CONTEXT_COMPACT.md): 8 â†’ 9 motores; endpoints actualizados.
- [docs/README.md](README.md): aÃ±adidas entradas a los nuevos documentos.

---

## Commit `020eee85` â€” AR-1 infraestructura de carga incremental

**Resumen:** primera fase de la mejora AR-1 del plan, sin cambios en flujos por defecto.

### Backend
- [server.js](../server.js): nuevo `GET /engines` con cache invalidado por `mtimeMs + size`.

### Frontend
- [js/data-loader.js](../js/data-loader.js): `fetchEngineCatalog()` y `loadEnginesByFileNames(files, { append })`.
- [js/state.js](../js/state.js): `engineCatalog`, `loadedEngineFiles`, `incrementalLoadingEnabled`.
- [js/qa-milu.js](../js/qa-milu.js): `loadInitialEngineData()` con feature flag (`?lazy=1` o `localStorage.miluLazyEngines='1'`).

### VerificaciÃ³n
- `GET /engines` (frÃ­o): 9 motores, totals `{ rowCount: 67_882, fileSize: 225_841_891 }`.
- `GET /engines` (caliente): **19 ms**.
- `POST /save-json` archivo no permitido: 400 (sin regresiÃ³n).
- Sin la flag, `loadData()` usa `loadPartitionedEngineData` exactamente como antes.

Documento detallado: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md).

---

## Commit `bc1fcf45` â€” AR-1 UI mÃ­nima para carga incremental

**Resumen:** se completa la interfaz mÃ­nima de usuario para aprovechar AR-1 en `?lazy=1` sin afectar el modo clÃ¡sico.

### Frontend UI
- [qa_milu.html](../qa_milu.html): nuevo bloque `lazyEnginePanel` con:
   - badge `lazyEngineBadge` (`n / 9`),
   - selector `lazyEngineSelect`,
   - botones `lazyLoadEngineBtn` y `lazyLoadAllEnginesBtn`.
- [styles/qa_milu.css](../styles/qa_milu.css): estilos especÃ­ficos del panel lazy.

### Frontend lÃ³gica
- [js/qa-milu.js](../js/qa-milu.js):
   - muestra/oculta panel lazy segÃºn `state.incrementalLoadingEnabled`,
   - carga incremental por botÃ³n con `loadEnginesByFileNames(..., { append: true })`,
   - refresca badge/selector,
   - recompone catÃ¡logo libro/pÃ¡gina tras aÃ±adir motores,
   - re-renderiza tabla/paginaciÃ³n y mantiene compatibilidad con revisiÃ³n/guardado.

### VerificaciÃ³n
- Modo clÃ¡sico: panel oculto y carga completa como antes.
- Modo lazy:
   - inicio en `1 / 9`,
   - tras cargar un motor: `2 / 9`,
   - tras "Cargar todos": `9 / 9`.
- Selector de libros actualizado segÃºn motores ya cargados.
- Persistencia: `/save-json` escribe y restaura correctamente `qa_revision_accion` en `engine_12V4000M40A.json`.

---

## Pendiente (prÃ³ximos commits)

Ver [10_plan_remediacion.md](10_plan_remediacion.md), tareas marcadas como "Pendiente". Prioridades inmediatas:

- QW-5 â€” smoke tests HTTP con `node --test`.
- BK-1 â€” validaciÃ³n de payloads en endpoints de escritura.
- DT-1 â€” path configurable en `depuracion_json.py`.
- UX-1 â€” vista compacta por defecto en la tabla.

Cuando se cierre cada una, aÃ±adir aquÃ­ un bloque "Commit `<sha>` â€” `<resumen>`" siguiendo el formato del primero.

---

## Trabajo local (sin commit) â€” Pipeline WordPress + IA

**Resumen:** se implementÃ³ una primera fase operativa para exportaciÃ³n WordPress/WooCommerce y clasificaciÃ³n offline de conflictos con trazabilidad.

### Scripts aÃ±adidos
- [scripts/export_wordpress_milu.js](../scripts/export_wordpress_milu.js)
- [legacy/export_complex_ai/scripts/ai_conflict_rules.js](../legacy/export_complex_ai/scripts/ai_conflict_rules.js)

### Comandos npm aÃ±adidos
- `export:wordpress`
- `legacy:ai:conflicts` (antes `ai:conflicts`)

### DocumentaciÃ³n aÃ±adida
- [archived/13_wordpress_export_ai_pipeline.md](archived/13_wordpress_export_ai_pipeline.md)

### Outputs generados
- WordPress: `data/output/wordpress/` (CSV/JSON/reportes para NEW, SUPERSEDED, PENDING, DISCARDED)
- IA: `data/output/ai_review/` (conflictos completos, resumen, pendientes humanos y reporte de decisiÃ³n)

### Resultado de ejecuciÃ³n inicial
- `new_exportable`: 1020
- `superseded_exportable`: 657
- `pending_review`: 4016
- `discarded`: 1445
- `duplicated_pn_keys`: 5130

### VerificaciÃ³n
- No se modificaron los 9 `engine_*.json` activos.
- CSV en UTF-8 con BOM y delimitador `;`.
- Pendientes y descartados con motivo trazable (`import_reason`).

---

## Cambio actual - Simplificacion WordPress QA-only

### Objetivo aplicado
- El flujo oficial de exportacion WordPress queda reducido a decision QA humana por PN global.
- La logica compleja de IA/scoring se archiva como legacy.

### Cambios principales
- Backend:
  - `POST /export/run-wordpress` ejecuta solo el export oficial simplificado.
  - `POST /export/run-synthetic`, `POST /export/run-ai-conflicts`, `POST /export/run-all` devuelven `410 legacy`.
  - `/pn/*` se marca legacy (`410`).
  - `/export/files` solo lista carpeta oficial `wordpress`.
- Frontend:
  - `exportacion.html` y `js/exportacion.js` simplificados (boton principal run-wordpress + refresco + tabla/preview/resumen).
  - Eliminados controles visibles de IA/Synthetic/scoring.
- Scripts:
  - `scripts/export_wordpress_milu.js` reescrito para leer 9 `engine_*.json` y decidir por reglas QA oficiales.
  - Scripts complejos movidos a `legacy/export_complex_ai/scripts/`.
- npm:
  - Se mantiene `export:wordpress`.
  - `ai:conflicts` y `export:review` pasan a `legacy:*`.

### Documentacion
- Nuevo: `docs/14_wordpress_export_simplified.md`.
- Actualizados: `docs/13_wordpress_export_ai_pipeline.md`, `docs/README.md`.
- Nuevo archivo de archivo: `legacy/export_complex_ai/README.md`.

---

## Cambio actual - PN Review QA-only por PN global

### Objetivo aplicado
- Se crea la pantalla operativa PN Review para revisar productos por PN unico global.
- La decision oficial se mantiene QA-only (sin scoring, sin IA de decision).

### Backend
- Nuevos endpoints oficiales:
   - `GET /pn-review/list`
   - `GET /pn-review/:sku`
   - `GET /pn-review/:sku/sources`
   - `POST /pn-review/:sku/apply-decision`
- Agrupacion global por PN usando los mismos criterios base del export oficial (`buildQaSummary` + `decideByQa`).
- Accion masiva por PN con validacion fuerte de payload (`estado=ok` y `accion` en `importar|eliminar|revisar`).
- Escritura atomica por archivo y refresco de cache de PN Review tras cambios.

### Frontend
- Nueva UX completa en `pn_review.html` + `js/pn-review.js` + `styles/pn-review.css`.
- Tabla de PN unicos, panel de detalle, validaciones auxiliares, badges de issues y modal de apariciones.
- Acciones masivas desde el panel de detalle con confirmacion explicita.

### Navegacion
- Enlace a PN Review aÃ±adido desde:
   - `qa_milu.html`
   - `exportacion.html`

---

## Cambio actual - Cierre formal QW-5 (smoke tests oficiales)

### Objetivo aplicado
- Consolidar un entrypoint oficial de tests smoke con documentacion de cobertura y criterios de uso.

### Cambios principales
- `package.json`
   - Se aÃ±ade `npm test` apuntando a `npm run test:all-smoke`.
- Estructura de tests
   - Se mantiene `tests/smoke/` con suites:
      - `http-smoke.test.js`
      - `db-read-smoke.test.js`
      - `db-analytics-smoke.test.js`
   - Se crea `tests/helpers/` para reducir duplicacion minima:
      - `smoke-config.js`
      - `fetch-json.js`
      - `assert-json-response.js`
- Documentacion oficial
   - `docs/testing/README.md`
   - `docs/testing/SMOKE_TEST_MATRIX.md`
   - `docs/testing/QW5_CIERRE.md`
   - Actualizacion de `docs/10_plan_remediacion.md` y `docs/README.md`.

### Verificacion
- `npm test` -> OK
- `npm run test:all-smoke` -> OK
- Resultado: 41/41 tests en verde (11 runtime + 10 db-read + 20 analytics).

### Alcance y restricciones cumplidas
- Sin cambios de runtime.
- Sin cambios en `engine_*.json`.
- Sin cambios en logica QA.
- Sin cambios en export WordPress.
- Sin endpoints nuevos.

---

## Cambio actual - Fase I payload validation + write safety

### Objetivo aplicado
- Endurecer validaciones de payload en endpoints de escritura manteniendo compatibilidad legacy y sin cambiar flujo operativo.

### Cambios principales
- Nueva capa reusable: `server/validation/`
   - `validators.js`
   - `qa-validation.js`
   - `payload-errors.js`
   - `allowed-fields.js`
- Endpoints con validacion explicita:
   - `/save-json` y `/save-json.php`
   - `/apply-revision-to-engines`
   - `/pn-review/:sku/apply-decision`
   - `/pn-review/:sku/apply-values`
   - `/pn-review/apply-siblings-bulk`
   - `/pn-review/by-id/:id/apply-decision`
   - `/recompute-qa-errors`
   - `/recompute-pdf-auto`
   - `/qa_revision_sync.php`
   - `/audit-log`
- Error shape de validacion estandarizado:
   - `{ ok:false, error:'VALIDATION_ERROR', code, field, message }`
- Compatibilidad legacy conservada:
   - `descartar -> eliminar`
   - `measurement_final -> measure_final`

### Verificacion
- `npm run test:security` -> 9/9 OK
- `npm test` -> 41/41 smoke OK

### Entregables documentales
- `docs/security/WRITE_ENDPOINTS_AUDIT.md`
- `docs/security/PAYLOAD_VALIDATION.md`
- `data/output/validation/payload_validation_report.md`

---

## Cambio actual - Cierre BK-1 (validacion funcional Fase I)

### Objetivo aplicado
- Validar end-to-end que la Fase I de payload validation + write safety queda funcionalmente cerrada en los endpoints criticos `/save-json` y `/apply-revision-to-engines`.
- No refactor, no cambios de contrato, no tocar UX-1 ni DT-1.

### Cobertura ampliada en `tests/security/write-validation.test.js`
Se aÃ±aden 7 tests nuevos sobre el server real:

- `/save-json roundtrip HTTP`: escribe `designation_final` en `engine_12V4000M40A.json` y restaura el valor original (verifica write efectivo en disco + lock + JSON response).
- `/save-json field=col alias`: confirma que el frontend actual (`{file,id,col,value}`) sigue siendo aceptado (no rompe `qa_milu.html`).
- `/save-json siempre responde JSON`: confirma `content-type: application/json` incluso en errores (no se filtra HTML/PHP).
- `/apply-revision-to-engines payload vacio -> 400 EMPTY_PAYLOAD`.
- `/apply-revision-to-engines payload no-objeto (array) -> 400 VALIDATION_ERROR`.
- `/apply-revision-to-engines revisions:{} -> 200 ok`, `changed=0` por archivo (no-op no destructivo).
- `/apply-revision-to-engines payload demasiado grande -> 400 PAYLOAD_TOO_LARGE`.

### Resultado de pruebas
- `npm run test:security` -> 16/16 OK (antes 9, ahora 16).
- `npm test` (smoke completo) -> 41/41 OK (11 runtime + 10 db-read + 20 analytics).
- Roundtrip real en `engine_12V4000M40A.json` confirmado: write -> read -> restore sin residuos.

### Verificacion funcional contra la UI real
- `qa_milu.html` envia `{file,id,col,value}` via `js/data-loader.js::saveCellToServer`; el backend acepta `col` como alias de `field` (`payload.field ?? payload.col`) y normaliza `qa_revision_estado` / `qa_revision_accion` (incluye legacy `descartar -> eliminar`).
- Endpoints de escritura siempre devuelven JSON: validacion (`{ok:false,error:'VALIDATION_ERROR',code,field,message}`), error logico (`{error:'...'}`) o `{ok:true}`. No se devuelve nunca HTML ni el PHP legacy.
- Flujos comprobados sin regresion:
  - guardado de cambios desde `qa_milu.html` -> `/save-json` (alias `col`, alias `/save-json.php`).
  - aplicar revision masiva -> `/apply-revision-to-engines` (rechaza vacio, acepta `{revisions:{}}` como no-op).
  - actualizar `qa_revision_estado` / `qa_revision_accion` -> whitelist + normalizacion canonica.

### Cambio de comportamiento conocido (intencional, documentado)
- `POST /apply-revision-to-engines` con `{}` ahora responde 400 `EMPTY_PAYLOAD`. Antes (commit `742ca003`) devolvia `{ok:true}` con 0 cambios. Esta semantica esta alineada con `docs/security/PAYLOAD_VALIDATION.md` ("Payloads vacios bloqueados") y no rompe ningun flujo de UI: el frontend nunca envia `{}`, siempre `revisions` o el formato v2. Para el caso de "aplicar sin cambios" se debe usar `{revisions:{}}`.

### Estado BK-1
- **Cerrado.**
- Fase I queda funcionalmente validada con cobertura HTTP real (no solo unit-level).
- No quedan incidencias pendientes en el alcance BK-1. Siguiente bloque segun plan: UX-1 / DT-1.

### Archivos tocados
- `tests/security/write-validation.test.js` (7 tests nuevos, sin cambios de contrato).
- `docs/11_progreso_remediacion.md` (este bloque).
- `docs/security/PAYLOAD_VALIDATION.md` (nota de cobertura).
- `docs/security/WRITE_ENDPOINTS_AUDIT.md` (nota de cobertura).

---

## Cambio actual - Cierre UX-1 (vista compacta por defecto en QA)

### Objetivo aplicado
- Reducir ruido visual inicial de `qa_milu.html` manteniendo operativa completa y compatibilidad con la UI actual (incluyendo `?lazy=1`).

### Cambios principales
- `js/column-view.js`
   - Se redefine la vista `pdf` como **vista compacta operativa** por defecto (~12 columnas visibles):
      - `engine_model` (Libro)
      - `Source Page` (Pagina)
      - `POS`
      - `PART NO.`
      - `designation_final`
      - `QTY`
      - `qa_revision_estado`
      - `qa_revision_accion`
      - `measure_final`
      - `sust_status`
      - `sust_hierarchie`
      - `has_img`
   - Fix de persistencia: `loadColumnViewPreference()` ahora respeta la preferencia guardada (`qa|focus|pdf`) en lugar de forzar siempre el default.
- `qa_milu.html`
   - Se mantiene `value="pdf"` por compatibilidad, pero la etiqueta visible pasa de "Vista PDF" a "Vista compacta".
- `tests/smoke/http-smoke.test.js`
   - Smoke minimo frontend: `GET /qa_milu.html` verifica presencia de `#columnViewSelect` y opcion compacta (`value="pdf"`, etiqueta "Vista compacta").

### Compatibilidad y no regresion
- No se eliminan columnas del dataset ni del JSON.
- La vista completa sigue disponible por selector (`Vista QA`).
- No se toca backend ni contratos de payload.
- Flujos preservados: filtros, ordenacion, edicion inline/modal, guardado, revision, `apply-revision-to-engines`.
- Compatible con modo lazy (`?lazy=1`), ya que solo cambia orden/visibilidad en render.

### Verificacion
- `npm test` en verde tras el ajuste.
- Comprobacion manual de carga de `qa_milu.html`:
   - abre en vista compacta por defecto,
   - permite cambiar a `Vista QA` (completa) desde el selector.

### Estado UX-1
- **Cerrado.**

---

## Cambio actual - Cierre DT-1 (ruta base configurable en pipeline Python)

### Objetivo aplicado
- Desacoplar scripts Python de rutas absolutas/locales para ejecucion portable y reproducible (preparacion AR-3/AR-4/DT-3).

### Implementacion
- Nuevo helper compartido: `python_repo_paths.py`
   - `resolve_repo_dir(current_file=None)` con prioridad:
      1. `MILU_REPO_DIR` (si apunta a repo valido)
      2. busqueda ascendente desde `Path(__file__).resolve()` por marcadores de repo (`package.json`, `server.js`, `qa_milu.html`)
      3. fallback seguro al directorio del script
   - `should_log_repo_resolution()` usando `MILU_REPO_DEBUG=1|true|yes|on|debug`

### Scripts actualizados
- `depuracion_json.py`
   - elimina ruta hardcodeada absoluta
   - usa `resolve_repo_dir(__file__)`
   - agrega logging opcional de repo dir
   - encapsula ejecucion en `main()` + guard `if __name__ == "__main__"`
- `add_final_fields.py`
   - elimina ruta hardcodeada absoluta
   - usa `resolve_repo_dir(__file__)`
   - agrega logging opcional de repo dir
   - encapsula ejecucion en `main()` + guard
- `importar_json.py`
   - usa `resolve_repo_dir(__file__)` en lugar de asumir `Path(__file__).parent`
   - agrega traza opcional cuando `MILU_REPO_DEBUG` esta activo
- `estadisticas_articulos.py`
   - deja de depender de `cwd`; busca `engine_*.json` y `product-export-*.json` desde repo resuelto
- `informe_estadisticas.py`
   - idem anterior y genera `informe_estadisticas.txt` en la raiz del repo resuelto

### Compatibilidad y alcance
- No se cambiaron nombres de salida ni contratos JSON.
- No se toco backend (`server.js`).
- Se mantiene estructura actual del repo y carga de `engine_*.json`.

### Verificacion ejecutada
- Resolucion sin env:
   - `python -c "from python_repo_paths import resolve_repo_dir; print(resolve_repo_dir())"` -> raiz de repo correcta.
- Resolucion con env:
   - `MILU_REPO_DIR=<repo>`, `MILU_REPO_DEBUG=1` -> repo correcto y debug activo.
- Portabilidad desde otro `cwd` (`C:\`):
   - `python ...\estadisticas_articulos.py` -> OK
   - `python ...\informe_estadisticas.py` -> OK, output en raiz del repo
- `depuracion_json.py` importable sin side effects y con repo resuelto correctamente.

### Nota de incidencia
- `qa_html/` no existe en el repo actual (validado por comprobacion de paths). DT-1 no crea ni mueve carpetas por restriccion; se deja como observacion para AR-3/DT-3 si ese directorio pasa a ser requerido.

### Estado DT-1
- **Cerrado.**

---

## Cambio actual - Cierre QW-4 (lint minimo + check agregado)

### Objetivo aplicado
- AÃ±adir validacion de calidad basica con **cero friccion** y sin introducir un framework pesado.

### Cambios principales
- `scripts/lint-critical.js` (nuevo)
   - Ejecuta `node --check` para sintaxis JS en:
      - `server.js`
      - frontend principal de QA (`js/qa-milu.js`, `js/qa-table.js`, `js/data-loader.js`, `js/revision.js`, `js/column-view.js`, `js/cell-editor.js`, `js/helpers.js`, `js/state.js`, `js/schemas.js`, `js/pdf-viewer.js`)
      - `tests/**/*.js`
   - No aplica reglas de estilo ni formateo; solo errores de sintaxis (alcance QW-4).
- `package.json`
   - Nuevo script: `npm run lint` -> `node scripts/lint-critical.js`
   - Nuevo script: `npm run check` -> `npm run lint && npm test`

### Verificacion
- `npm run lint` -> OK
- `npm test` -> OK
- `npm run check` -> OK

### Alcance y restricciones
- Sin cambios de logica funcional.
- Sin cambios de contratos JSON.
- Sin dependencias nuevas ni framework de lint pesado.
- Sin refactor masivo ni reglas estÃ©ticas agresivas.

### Estado QW-4
- **Cerrado.**

---

## Cambio actual - AR-4 CI minimo (GitHub Actions)

### Objetivo aplicado
- AÃ±adir una base de CI minima para protecciones futuras de rama, reutilizando `npm run check`.

### Cambios principales
- Nuevo workflow: `.github/workflows/ci.yml`
   - Triggers:
      - `push` a `main`
      - `pull_request`
   - Runtime:
      - `ubuntu-latest`
      - `actions/setup-node@v4` con Node.js `20`
   - Instalacion de dependencias:
      - `npm ci` si existe `package-lock.json`
      - `npm install` si no existe lockfile
   - Verificacion:
      - `npm run check`

### Alcance y restricciones
- Sin despliegue.
- Sin jobs complejos.
- Sin cambios de logica de aplicacion.
- Sin cambios de contratos JSON.

### Validacion local
- `npm run check` -> OK

### Estado AR-4
- **Implementado localmente.**
- **Pendiente validacion remota en GitHub** (primera ejecucion tras push/PR).

---

## Punto de reanudacion de la mejora (2026-05-13)

### Estado de corte
- El proyecto queda en **beta tecnica / beta interna parcial**.
- Backend, persistencia QA, schema, snapshots, pipeline Python y tests estan consolidados.
- La deuda que sigue bloqueando la salida operativa completa esta concentrada en el bloque multimedia y export WordPress.

### Lo que queda cerrado y estable
- `server.js` y servicios asociados de revision / PN review.
- Escritura atomica, locks y validacion de payloads en endpoints de escritura.
- `npm test` y la suite de seguridad en verde.
- Schema de `engine_*.json` validado sobre los 9 motores.
- `python_lib/` y scripts criticos migrados.
- UX de revision ya endurecida con toasts, confirmaciones tipadas y virtualizacion.

### Lo que queda pendiente de verdad
- Rutas de imagen rotas y referencias multimedia inconsistentes.
- `qa_index` ausente en la auditoria de imagenes.
- `image_url` ausente en el export WordPress.
- Completitud insuficiente de `measure_final` para salida final con calidad operativa.

### Bloque de retoma recomendado
1. Diagnosticar el origen de las 14.249 rutas rotas de imagen.
2. Hacer que `npm run audit:images` genere un indice utilizable para `qa_imagenes.html`.
3. Incorporar `image_url` al export WordPress o fijar una estrategia explicita y trazable.
4. Revisar los motores mas debiles por completitud antes de un import real.

### Criterio para volver al trabajo
- No tocar contratos JSON ni endpoints HTTP.
- No reabrir refactors grandes.
- No abrir un frente nuevo hasta cerrar el bloque multimedia.
- Retomar con foco en estabilidad, trazabilidad y validacion operativa.

### Indicador de avance hacia beta operativa
- Cuando el export WordPress tenga imagen real trazable y `qa_imagenes.html` pueda auditarse con datos consistentes, MILU puede pasar de beta tecnica a beta operativa.


