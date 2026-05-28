# MILU

Aplicación web local para QA y exportación de catálogos de motores (datos source-of-truth en archivos JSON, sin base de datos relacional).

- Backend: Express ([server.js](server.js)) escuchando en `http://localhost:3000`.
- Frontend: módulos ES en `js/`, entrada principal [qa_milu.html](qa_milu.html).
- Datos runtime: 9 archivos `engine_*.json` cargados por [js/data-loader.js](js/data-loader.js).

## Arranque rápido

```powershell
npm install
node server.js
```

Después abre `http://localhost:3000/qa_milu.html` (o ejecuta [Ejecutar localhost.bat](Ejecutar%20localhost.bat)).

Comprobación de salud: `GET /health`.

## Calidad mínima (QW-4)

- `npm run lint`: validación ligera de sintaxis JS (`node --check`) sobre backend crítico (`server.js`), frontend principal de QA y tests JS.
- `npm test`: smoke tests oficiales.
- `npm run check`: ejecuta `lint` + `test`.

Este lint es intencionalmente no intrusivo: no fuerza estilo ni formato, solo detecta errores de sintaxis en archivos críticos.

## CI mínima (AR-4)

- Workflow: `.github/workflows/ci.yml`
- Se ejecuta en:
	- `push` a `main`
	- `pull_request`
- Usa Node.js 20 y corre `npm run check`.

## Estructura del repositorio

```
server.js                Backend Express
qa_milu.html             Entrada principal del frontend
js/                      Módulos ES del frontend
engine_*.json            9 archivos JSON con los datos de motores (source of truth)
qa_revision_server_data.json   Persistencia de revisiones QA
data/                    Datos auxiliares
fotos_articulos/, fotos_motores/, esquemas/   Multimedia (no editar)
docs/                    Documentación (ver más abajo)
scripts Python (root)    Utilidades offline (depuración, importación, estadísticas)
dist/, json_originales/, zz_old/   Generados / históricos (no editar)
```

## Documentación

La documentación oficial de pipeline MILU V1 vive en `docs_v2/` (canónica para flujo operativo actual). El contenido en `docs/` se mantiene como soporte histórico/complementario.

Documento principal canónico:

- Rebuild MILU V1 - DOC V2 consolidada: [docs_v2/00_overview/MILU_V1_REBUILD_DOC_V2.md](docs_v2/00_overview/MILU_V1_REBUILD_DOC_V2.md)
- Master pipeline: [docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md](docs_v2/00_overview/MILU_V1_MASTER_PIPELINE.md)
- Pipeline global: [docs_v2/01_pipeline/pipeline_global.md](docs_v2/01_pipeline/pipeline_global.md)
- Script map: [docs_v2/00_overview/SCRIPT_MAP.md](docs_v2/00_overview/SCRIPT_MAP.md)
- Assets visuales: [docs_v2/05_assets/imagenes_esquemas_pipeline.md](docs_v2/05_assets/imagenes_esquemas_pipeline.md)
- Official vs legacy: [docs_v2/13_legacy/official_vs_legacy.md](docs_v2/13_legacy/official_vs_legacy.md)

Documentación de soporte en `docs/`:

- Arquitectura: [docs/ARQUITECTURA_MILU.md](docs/ARQUITECTURA_MILU.md)
- Flujo de datos: [docs/FLUJO_DATOS_MILU.md](docs/FLUJO_DATOS_MILU.md)
- QA / reglas y comprobaciones: [docs/QA_MILU.md](docs/QA_MILU.md)
- Analista_02 - boton COPIAR (lectura PDF a campos _pdf): [docs/analista_02_boton_copiar.md](docs/analista_02_boton_copiar.md)
- Export WordPress (QA-only): [docs/WORDPRESS_EXPORT_MILU.md](docs/WORDPRESS_EXPORT_MILU.md)
- Imágenes y esquemas: [docs/IMAGENES_ESQUEMAS_MILU.md](docs/IMAGENES_ESQUEMAS_MILU.md)
- Plan de trabajo: [docs/PLAN_TRABAJO_MILU.md](docs/PLAN_TRABAJO_MILU.md)

**Contratos técnicos (v1, fase actual)**: [docs/contracts/](docs/contracts/README.md) — modelo JSON, revisión QA, export, imágenes, endpoints + validación contra código.

**Tests y validadores (Fase D)**: [docs/contracts/TESTS_Y_VALIDADORES.md](docs/contracts/TESTS_Y_VALIDADORES.md) — `npm run test:smoke` (HTTP) y `npm run validate:engines` (datos).

**Base de datos espejo SQLite (Fase E)**: [docs/database/README.md](docs/database/README.md) — `npm run db:import` / `db:validate` / `db:queries`. **Espejo regenerable; no reemplaza los JSON.**

**Capa de lectura HTTP `/db/*` (Fase F)**: [docs/database/DB_READ_LAYER.md](docs/database/DB_READ_LAYER.md) — endpoints read-only sobre el espejo SQLite. Smoke: `npm run test:db-read` (o `npm run test:all-smoke`).

**Capa analytics + dashboards diagnóstico (Fase G)**: [docs/database/DB_ANALYTICS_LAYER.md](docs/database/DB_ANALYTICS_LAYER.md) — endpoints `/db/analytics/*` y páginas `analytics_*.html`, todo read-only y aislado de `qa_milu.html`. Smoke: `npm run test:db-analytics`.

**Fase H — performance + drilldown**: índices SQLite auxiliares (`npm run db:index`), cache TTL en memoria (30 s), drilldowns por motor/PN/QA/imágenes/export, búsqueda global `/db/analytics/search`, export CSV dinámico (`/db/analytics/export-csv/:view`) y 3 páginas nuevas (`analytics_search.html`, `analytics_pn_detail.html`, `analytics_engine_detail.html`). Informe: [data/output/validation/db_analytics_phase_h_report.md](data/output/validation/db_analytics_phase_h_report.md).

Subcarpetas en `docs/`:

- `archived/` — superseded / históricos (con banner ARCHIVADO).
- `auditoria/` — auditorías históricas.
- `proposals/` — propuestas no implementadas (PENDIENTE DE VALIDAR).
- `modules/` — referencia técnica módulo a módulo.
- `images/`, `legacy/`, `canonical/` — auxiliares.

Estado actual de la consolidación documental: [docs/ESTADO_FINAL_DOCUMENTACION.md](docs/ESTADO_FINAL_DOCUMENTACION.md).
Proceso y auditoría de la limpieza: [docs/MILU_LIMPIEZA_DOCUMENTACION.md](docs/MILU_LIMPIEZA_DOCUMENTACION.md).

## Diagnóstico (orden recomendado)

Ante un fallo, validar en este orden antes de tocar UI:

1. `GET /health`
2. `GET/POST /qa_revision_sync.php` (debe responder JSON, no servir el archivo PHP)
3. `/save-json` o `/apply-revision-to-engines` según el flujo afectado
4. Frontend

Para persistencia: servidor levantado → respuesta HTTP → payload del frontend → escritura en `qa_revision_server_data.json` o `engine_*.json`.

## Assets incremental (estado actual)

- `rebuild_assets_for_record.py` es OFFICIAL / ACTIVE para rebuild incremental de `esquemas` y `esquemas_pos`.
- Inferencia automatica de pagina de esquema por metadatos `FG/FGS` + `BOM-No.` (sin offset manual).
- Deteccion OCR robusta para POS concatenados (ejemplo validado: `170155` contiene `155`).
- Persistencia incremental/idempotente:
	- si archivo existe y JSON coincide: no regenerar
	- si archivo existe y JSON esta desincronizado: reparar JSON
	- si POS no detecta match nuevo pero hay assets validos: reutilizar assets

## Convenciones

- Backend: CommonJS. Frontend: módulos ES.
- Los PHP legacy (`qa_revision_sync.php`, `save-json.php`) viven en `legacy/php/`; en local, sus rutas `.php` las atiende Express.
- UX-4 activo: acciones críticas de borrado/descartado/aplicación masiva requieren confirmación tipada (`BORRAR`, `DESCARTAR`, `RESET`, `APLICAR`).
- UX-3 completado (fase 1 + fase 2): `showToast(...)` activo en módulos QA; sin alertas directas pendientes fuera de adaptadores/fallback documentados.
- Backend write-safety: `/save-json` usa escritura atómica; `pn-review` `apply-decision` usa lock por fichero durante read-modify-write.
- No editar carpetas generadas/datos: `dist/`, `esquemas/`, `esquemas_pos_circulos/`, `json_originales/`, `zz_old/`, `fotos_articulos/`, `fotos_motores/`.
- Paso a JSON definitivos: ejecutar [depuracion_json.py](depuracion_json.py) sobre los 9 `engine_*.json`.
- `measurement_final`: prioriza `dimensions_gesa`; fallback `MEASUREMENT / STANDARD`. Espacios múltiples se colapsan.
