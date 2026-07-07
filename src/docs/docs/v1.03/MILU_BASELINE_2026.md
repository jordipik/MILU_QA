# MILU_BASELINE_2026 — Congelación V1.03

> **FASE 0** del Plan Maestro V1.03. Estado del repositorio en el momento de iniciar la auditoría / consolidación.

## Versión y entorno

| Item | Valor |
|---|---|
| `version.json` | `1.03.001` |
| `package.json` `version` | `1.1.1` |
| `package.json` `appVersion` | `1.01.003` ⚠️ desincronizado con `version.json` |
| Runtime backend | Node + Express 5 (CommonJS) servido por [server.js](../../server.js) |
| Runtime frontend | HTML + ES modules en [js/](../../js/) |
| Persistencia | Archivos JSON en raíz (`engine_*.json`, `qa_revision_server_data.json`, etc.) — sin DB relacional |
| Espejo opcional | SQLite vía `scripts/db/import_engines_to_sqlite.js` (solo lectura, expuesto en `/db/*`) |
| Python | `.venv/` del repo (preferir `MILU_PYTHON` cuando se invoca desde Node) |
| Arranque | [Ejecutar localhost.bat](../../Ejecutar%20localhost.bat) → `node server.js` en `http://localhost:3000` |

## Tamaño del sistema (snapshot)

| Capa | Cantidad |
|---|---|
| Endpoints HTTP totales | **99** (52 escriben, 47 read-only) |
| Endpoints riesgo ALTO | 12 |
| Endpoints riesgo MEDIO | 25 |
| Líneas en `server.js` | ~4707 |
| HTMLs en raíz | ~22 |
| Scripts ejecutables totales (`*.py` + `*.js` raíz + `scripts/` + `tools/`) | ~118 |
| Scripts oficiales activos (server + npm) | ~28 |
| Scripts huérfanos / TMP / DEBUG candidatos a cuarentena | ~18 |
| `engine_*.json` activos | 9 |
| Backups `.bak.*` y `.backup-*` en raíz | múltiples por engine (sin política de retención) |

## Reglas de congelación (vigentes durante V1.03)

Mientras esta congelación esté activa **NO** se acepta:

- Añadir nuevos endpoints HTTP.
- Añadir nuevos botones que disparen escrituras a `engine_*.json` o a `qa_revision_server_data.json`.
- Crear nuevos scripts Python o Node que escriban en `engine_*.json`.
- Refactorizaciones que cambien comportamiento observable.

**SÍ** se acepta:

- Documentación (este directorio `docs/v1.03/`).
- Auditoría (lectura, generación de reportes).
- Limpieza (mover scripts a `legacy_quarantine/`, no borrar).
- Refactorización segura: extraer funciones sin cambiar firma observable, normalizar nombres de variables, eliminar código tras confirmar que es huérfano.
- Fixes funcionales puntuales **solo si bloquean** la operativa habitual y se documentan en este archivo en la sección "Excepciones".

## Hallazgos previos relevantes (memoria del repo)

Tomados de `/memories/repo/` y memoria de usuario, sin re-validar:

- Tras cambios en `server.js` (endpoints/lógica), reiniciar Node antes de validar runtime.
- Whitelist de campos escribibles vive en [server/validation/allowed-fields.js](../../server/validation/allowed-fields.js) — antes de tocar frontend si `/save-json` no persiste.
- Endpoints destructivos sin `dryRun` por defecto (ej. `enrich-assets` con engine `ALL`) ya escriben los 9 `engine_*.json`.
- `5-ESTADOS recompute_simple` puede devolver HTTP 207 parcial por `ENOSPC` al crear backups.
- Matching POS estricto por valor numérico normalizado (`060==60`, `60≠160`).

## Riesgos conocidos al iniciar V1.03

1. **Coexistencia de pipelines PDF**: JS (`scripts/qa_pdf_visual_copy.js`, `rebuild_engine_from_book_preview.js`) y Python (`apply_book_preview_to_engine.py`, `apply_all_book_previews.py`).
2. **Coexistencia de "hermanos"**: `POST /pn-review/apply-siblings-bulk` vs `POST /api/recompute-simple/recompute-hermanos` — ambos llaman a `applySiblingBulkUpdates` inline pero por rutas distintas y con políticas de backup/dryRun distintas.
3. **Generación de esquemas POS**: 4 endpoints distintos invocan a `rebuild_schemes_circles_from_esquemas.py` con parámetros similares.
4. **Aplicación masiva de revisiones**: 3 caminos (`/apply-revision-to-engines`, `/recompute-hermanos`, `/pn-review/apply-siblings-bulk`).
5. **Backups silenciosos** (`*.bak.*`, `*.backup-schemes-*`) creados por scripts y endpoints sin política de limpieza ni TTL.
6. **Scripts históricos en raíz** (`tmp_*.py`, `debug_*.js`, `pretty_print_all_json.py`, `importar_json.py`) que **siguen siendo capaces** de escribir `engine_*.json` si se ejecutan.
7. `package.json` declara `legacy:ai:conflicts`, `legacy:export:review` y `legacy:generate:synthetic` apuntando a `legacy/` o a la raíz, sin gating: ejecutables por error.
8. Endpoints `/calculate-final-fields`, `/recompute-pdf-auto`, `/export/run-synthetic`, `/export/run-ai-conflicts`, `/export/run-all`, `/pn/list`, `/pn/:sku`, `/pn/:sku/sources`, `/apply-qa-checks-filter` ya devuelven 410 inline pero **no han sido eliminados del frontend ni del routing**.

## Excepciones a la congelación

_Ninguna registrada al iniciar V1.03._

> Cualquier excepción debe añadirse aquí con: fecha, motivo, endpoint/script tocado, autor.

## Entregables del Plan V1.03

| Fase | Entregable | Estado |
|---|---|---|
| 0 | [MILU_BASELINE_2026.md](MILU_BASELINE_2026.md) | ✅ este documento |
| 1 | [MILU_RUNTIME_MAP.md](MILU_RUNTIME_MAP.md) | ✅ generado |
| 2 | [MILU_WRITE_OPERATIONS.md](MILU_WRITE_OPERATIONS.md) | ✅ generado |
| 3 | [MILU_ORPHAN_COMPONENTS.md](MILU_ORPHAN_COMPONENTS.md) | ✅ generado |
| 4 | [MILU_OFFICIAL_COMPONENTS.md](MILU_OFFICIAL_COMPONENTS.md) | ✅ generado |
| 4.5 | [MILU_DUPLICATED_DOMAINS.md](MILU_DUPLICATED_DOMAINS.md) + [MILU_SIMPLIFICATION_PLAN.md](MILU_SIMPLIFICATION_PLAN.md) + [MILU_V103_DECISIONS.md](MILU_V103_DECISIONS.md) | ✅ generado |
| 5 | `legacy_quarantine/` + README | pendiente (semana 2) |
| 6 | `SERVER_ENABLE_DANGEROUS_WRITE` flag | pendiente (semana 2) |
| 7 | Unificación PDF | pendiente (semana 3) |
| 8 | Unificación hermanos | pendiente (semana 3) |
| 9 | Unificación esquemas | pendiente (semana 3) |
| 10 | `MILU_SYSTEM_AUDIT.md` | pendiente (semana 4) |

## Criterio de cierre de V1.03

V1.03 se considera completado cuando:

- Existe un único pipeline oficial documentado en `MILU_OFFICIAL_COMPONENTS.md`.
- Todo script huérfano o duplicado vive bajo `legacy_quarantine/`.
- Endpoints destructivos están detrás de `SERVER_ENABLE_DANGEROUS_WRITE`.
- Todo botón en cualquier HTML mapea a un endpoint que existe en `MILU_OFFICIAL_COMPONENTS.md`.
- `version.json` y `package.json.appVersion` se igualan a `1.03.000` o superior.
