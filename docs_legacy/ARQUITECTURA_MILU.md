# DOCUMENTO CANÓNICO MILU — ARQUITECTURA

> **Estado**: CANÓNICO · Fuente única de verdad para la arquitectura.
> **Última actualización**: 2026-05-12.
> **Fuentes consolidadas**: [00_overview.md](00_overview.md), [01_structure.md](01_structure.md), [BACKEND.md](BACKEND.md), [FRONTEND.md](FRONTEND.md), [MILU_FRONTEND_BACKEND.md](MILU_FRONTEND_BACKEND.md), [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md), [09_auditoria_2026.md](09_auditoria_2026.md).
>
> Este documento resume la arquitectura actual. Para detalle exhaustivo, ir al canónico correspondiente.

---

## 1. Propósito

MILU es una **aplicación web local** para QA de catálogos de piezas de motores MTU. Permite navegar, filtrar, validar y revisar registros provenientes de **9 datasets `engine_*.json`**, y persistir las decisiones directamente en esos JSON.

No hay base de datos relacional. La fuente de verdad runtime son los `engine_*.json`.

---

## 2. Topología

```
┌───────────────────────────────────────────────────────────┐
│  Navegador (localhost:3000)                                │
│  qa_milu.html, analista_02.html, pn_review.html,           │
│  qa_imagenes.html, exportacion.html, export_wordpress.html │
│  ES modules en /js                                         │
└──────────────────────────┬─────────────────────────────────┘
                           │ HTTP
┌──────────────────────────▼─────────────────────────────────┐
│  Express server (server.js, CommonJS)                      │
│  /health, /save-json, /qa_revision_sync.php,               │
│  /apply-revision-to-engines, /recompute-pdf-auto,          │
│  /pn-review/*, /export/*, /engines                         │
└──────────────────────────┬─────────────────────────────────┘
                           │ FS
┌──────────────────────────▼─────────────────────────────────┐
│  engine_*.json (9 ficheros)                                │
│  qa_revision_server_data.json                              │
│  data/output/wordpress/*.json|csv                          │
└────────────────────────────────────────────────────────────┘
```

Lanzamiento:
- `node server.js` o [Ejecutar localhost.bat](../Ejecutar%20localhost.bat).
- URL: `http://localhost:3000/qa_milu.html`.

---

## 3. Frontend

- SPA basada en módulos ES nativos en [js/](../js/).
- Estado global mutable en [js/state.js](../js/state.js).
- Orquestador principal: [js/qa-milu.js](../js/qa-milu.js).
- Tabla y filtros: [js/qa-table.js](../js/qa-table.js).
- Revisión por fila: [js/revision.js](../js/revision.js).
- Carga de datos y comprobación backend: [js/data-loader.js](../js/data-loader.js).
- Imágenes / esquemas / PDF: módulos dedicados en `js/`.

Vistas principales:
- `qa_milu.html` — QA principal (tabla + detalle + PDF).
- `analista_02.html` — Analista avanzado con pestañas **PDF** y **PN Review** (`js/pn-review-embedded.js`).
- `pn_review.html` — Vista autónoma de PN Review con `<dialog>` nativo y toasts.
- `qa_imagenes.html` — Auditoría multimedia (solo lectura).
- `exportacion.html` / `export_wordpress.html` — Lanzadores de export.

Detalle: [FRONTEND.md](FRONTEND.md), [01_structure.md](01_structure.md).

---

## 4. Backend

`server.js` es un monolito Express (CommonJS) sin BD. Endpoints actualmente expuestos:

- `GET /health` — vida del servicio.
- `POST /save-json` — actualiza un campo de un `engine_*.json` por `ID`.
- `GET|POST /qa_revision_sync.php` — sincronización de revisiones (sirve JSON desde Express, **no** desde el `.php` físico).
- `POST /apply-revision-to-engines` — aplicación masiva de revisión.
- `POST /recompute-pdf-auto` — recomputo PDF.
- `GET /engines` — catálogo de motores (carga incremental, AR-1).
- `GET /pn-review/list`, `GET /pn-review/:sku`, `GET /pn-review/:sku/sources`, `POST /pn-review/:sku/apply-decision` — decisión global por PN.
- `GET /export/files`, `GET /export/file`, `GET /export/download`, `GET /export/status`, `POST /export/run-wordpress` — pipeline export.

Detalle: [BACKEND.md](BACKEND.md), [docs/modules/server.md](modules/server.md).

> Deuda técnica identificada en [09_auditoria_2026.md](09_auditoria_2026.md): `server.js` mezcla persistencia, export, PN Review y auditoría. Plan de modularización → [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md) (AR-2).

---

## 5. Persistencia

- **No hay base de datos.** Todo es FS sobre JSON.
- `engine_*.json` (9 ficheros) — datos de fila runtime.
- `qa_revision_server_data.json` — persistencia de revisiones agregadas.
- `data/output/wordpress/` — outputs del pipeline de exportación.

Regla operativa (ver [.github/copilot-instructions.md](../.github/copilot-instructions.md)):
- Los `engine_*.json` solo deben modificarse vía `/save-json`, `/apply-revision-to-engines` o el pipeline oficial (`depuracion_json.py`).

---

## 6. Carga incremental (AR-1)

- Endpoint: `GET /engines`.
- Helpers: `fetchEngineCatalog`, `loadEnginesByFileNames`.
- Feature flag de activación: `?lazy=1` en la URL.
- UI: badge + selector + botones de carga manual.
- Spec completa: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md).

---

## 7. Estructura del repositorio (resumen)

- **Raíz**: HTMLs, `server.js`, scripts Python/Node, `engine_*.json`.
- [js/](../js/) — módulos frontend ES.
- [css/](../css/), [styles/](../styles/), `styles.css` — estilos.
- [docs/](.) — documentación.
- [data/](../data/) — entradas/salidas del pipeline (incluye `data/output/wordpress/`).
- [scripts/](../scripts/) — scripts de orquestación.
- [legacy/](../legacy/) — código archivado (p. ej. export con IA).
- [dist/](../dist/) — artefactos de publicación.
- [esquemas/](../esquemas/), [esquemas_pos_circulos/](../esquemas_pos_circulos/), [fotos_articulos/](../fotos_articulos/), [fotos_motores/](../fotos_motores/) — recursos multimedia (no editar salvo tarea explícita).
- `zz_old/`, `json_originales/` — históricos.

Detalle: [01_structure.md](01_structure.md).

---

## 8. Tecnologías

- Node.js + Express (backend, CommonJS).
- ES modules en navegador (frontend).
- PDF.js (viewer), pako (gzip JSON).
- Python (pandas, json, glob) para utilidades offline (`depuracion_json.py`, `add_final_fields.py`, etc.).

---

## 9. Asunciones

- Ejecución local en red de confianza.
- No hay autenticación ni capa de identidad en backend.
- Grandes JSON se editan directamente en el workspace de git.

---

## 10. Estado y deuda técnica

Resumen no exhaustivo (detalle completo en [09_auditoria_2026.md](09_auditoria_2026.md) y plan en [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md)):

- Backend monolítico en `server.js`.
- Tabla principal con 54 columnas → propuesta: vista compacta por defecto (UX-1) + virtualización (UX-2).
- 152 ocurrencias de `alert()` en frontend → sustituir por toasts (UX-3).
- Sin validación estricta de payloads en `/save-json` (BK-1).
- Sin esquema JSON formal para `engine_*.json` (DT-2). Propuesta de refactor: [proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md](proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md) (**PENDIENTE DE VALIDAR**).

---

## Referencias

- Canónico: [00_overview.md](00_overview.md)
- Estructura: [01_structure.md](01_structure.md)
- Backend: [BACKEND.md](BACKEND.md), [docs/modules/server.md](modules/server.md)
- Frontend: [FRONTEND.md](FRONTEND.md)
- Integración FE+BE: [MILU_FRONTEND_BACKEND.md](MILU_FRONTEND_BACKEND.md)
- AR-1: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)
- Auditoría: [09_auditoria_2026.md](09_auditoria_2026.md)
