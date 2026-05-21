# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# DOCUMENTO CANÃ“NICO MILU â€” ARQUITECTURA

> **Estado**: CANÃ“NICO Â· Fuente Ãºnica de verdad para la arquitectura.
> **Ãšltima actualizaciÃ³n**: 2026-05-12.
> **Fuentes consolidadas**: [00_overview.md](00_overview.md), [01_structure.md](01_structure.md), [BACKEND.md](BACKEND.md), [FRONTEND.md](FRONTEND.md), [MILU_FRONTEND_BACKEND.md](MILU_FRONTEND_BACKEND.md), [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md), [09_auditoria_2026.md](09_auditoria_2026.md).
>
> Este documento resume la arquitectura actual. Para detalle exhaustivo, ir al canÃ³nico correspondiente.

---

## 1. PropÃ³sito

MILU es una **aplicaciÃ³n web local** para QA de catÃ¡logos de piezas de motores MTU. Permite navegar, filtrar, validar y revisar registros provenientes de **9 datasets `engine_*.json`**, y persistir las decisiones directamente en esos JSON.

No hay base de datos relacional. La fuente de verdad runtime son los `engine_*.json`.

---

## 2. TopologÃ­a

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Navegador (localhost:3000)                                â”‚
â”‚  qa_milu.html, analista_02.html, pn_review.html,           â”‚
â”‚  qa_imagenes.html, exportacion.html, export_wordpress.html â”‚
â”‚  ES modules en /js                                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚ HTTP
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Express server (server.js, CommonJS)                      â”‚
â”‚  /health, /save-json, /qa_revision_sync.php,               â”‚
â”‚  /apply-revision-to-engines, /recompute-pdf-auto,          â”‚
â”‚  /pn-review/*, /export/*, /engines                         â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                           â”‚ FS
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â–¼â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  engine_*.json (9 ficheros)                                â”‚
â”‚  qa_revision_server_data.json                              â”‚
â”‚  data/output/wordpress/*.json|csv                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

Lanzamiento:
- `node server.js` o [Ejecutar localhost.bat](../Ejecutar%20localhost.bat).
- URL: `http://localhost:3000/qa_milu.html`.

---

## 3. Frontend

- SPA basada en mÃ³dulos ES nativos en [js/](../js/).
- Estado global mutable en [js/state.js](../js/state.js).
- Orquestador principal: [js/qa-milu.js](../js/qa-milu.js).
- Tabla y filtros: [js/qa-table.js](../js/qa-table.js).
- RevisiÃ³n por fila: [js/revision.js](../js/revision.js).
- Carga de datos y comprobaciÃ³n backend: [js/data-loader.js](../js/data-loader.js).
- ImÃ¡genes / esquemas / PDF: mÃ³dulos dedicados en `js/`.

Vistas principales:
- `qa_milu.html` â€” QA principal (tabla + detalle + PDF).
- `analista_02.html` â€” Analista avanzado con pestaÃ±as **PDF** y **PN Review** (`js/pn-review-embedded.js`).
- `pn_review.html` â€” Vista autÃ³noma de PN Review con `<dialog>` nativo y toasts.
- `qa_imagenes.html` â€” AuditorÃ­a multimedia (solo lectura).
- `exportacion.html` / `export_wordpress.html` â€” Lanzadores de export.

Detalle: [FRONTEND.md](FRONTEND.md), [01_structure.md](01_structure.md).

---

## 4. Backend

`server.js` es un monolito Express (CommonJS) sin BD. Endpoints actualmente expuestos:

- `GET /health` â€” vida del servicio.
- `POST /save-json` â€” actualiza un campo de un `engine_*.json` por `ID`.
- `GET|POST /qa_revision_sync.php` â€” sincronizaciÃ³n de revisiones (sirve JSON desde Express, **no** desde el `.php` fÃ­sico).
- `POST /apply-revision-to-engines` â€” aplicaciÃ³n masiva de revisiÃ³n.
- `POST /recompute-pdf-auto` â€” recomputo PDF.
- `GET /engines` â€” catÃ¡logo de motores (carga incremental, AR-1).
- `GET /pn-review/list`, `GET /pn-review/:sku`, `GET /pn-review/:sku/sources`, `POST /pn-review/:sku/apply-decision` â€” decisiÃ³n global por PN.
- `GET /export/files`, `GET /export/file`, `GET /export/download`, `GET /export/status`, `POST /export/run-wordpress` â€” pipeline export.

Detalle: [BACKEND.md](BACKEND.md), [docs/modules/server.md](modules/server.md).

> Deuda tÃ©cnica identificada en [09_auditoria_2026.md](09_auditoria_2026.md): `server.js` mezcla persistencia, export, PN Review y auditorÃ­a. Plan de modularizaciÃ³n â†’ [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md) (AR-2).

---

## 5. Persistencia

- **No hay base de datos.** Todo es FS sobre JSON.
- `engine_*.json` (9 ficheros) â€” datos de fila runtime.
- `qa_revision_server_data.json` â€” persistencia de revisiones agregadas.
- `data/output/wordpress/` â€” outputs del pipeline de exportaciÃ³n.

Regla operativa (ver [.github/copilot-instructions.md](../.github/copilot-instructions.md)):
- Los `engine_*.json` solo deben modificarse vÃ­a `/save-json`, `/apply-revision-to-engines` o el pipeline oficial (`depuracion_json.py`).

---

## 6. Carga incremental (AR-1)

- Endpoint: `GET /engines`.
- Helpers: `fetchEngineCatalog`, `loadEnginesByFileNames`.
- Feature flag de activaciÃ³n: `?lazy=1` en la URL.
- UI: badge + selector + botones de carga manual.
- Spec completa: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md).

---

## 7. Estructura del repositorio (resumen)

- **RaÃ­z**: HTMLs, `server.js`, scripts Python/Node, `engine_*.json`.
- [js/](../js/) â€” mÃ³dulos frontend ES.
- [css/](../css/), [styles/](../styles/), `styles.css` â€” estilos.
- [docs/](.) â€” documentaciÃ³n.
- [data/](../data/) â€” entradas/salidas del pipeline (incluye `data/output/wordpress/`).
- [scripts/](../scripts/) â€” scripts de orquestaciÃ³n.
- [legacy/](../legacy/) â€” cÃ³digo archivado (p. ej. export con IA).
- [dist/](../dist/) â€” artefactos de publicaciÃ³n.
- [esquemas/](../esquemas/), [esquemas_pos_circulos/](../esquemas_pos_circulos/), [fotos_articulos/](../fotos_articulos/), [fotos_motores/](../fotos_motores/) â€” recursos multimedia (no editar salvo tarea explÃ­cita).
- `zz_old/`, `json_originales/` â€” histÃ³ricos.

Detalle: [01_structure.md](01_structure.md).

---

## 8. TecnologÃ­as

- Node.js + Express (backend, CommonJS).
- ES modules en navegador (frontend).
- PDF.js (viewer), pako (gzip JSON).
- Python (pandas, json, glob) para utilidades offline (`depuracion_json.py`, `add_final_fields.py`, etc.).

---

## 9. Asunciones

- EjecuciÃ³n local en red de confianza.
- No hay autenticaciÃ³n ni capa de identidad en backend.
- Grandes JSON se editan directamente en el workspace de git.

---

## 10. Estado y deuda tÃ©cnica

Resumen no exhaustivo (detalle completo en [09_auditoria_2026.md](09_auditoria_2026.md) y plan en [PLAN_TRABAJO_MILU.md](PLAN_TRABAJO_MILU.md)):

- Backend monolÃ­tico en `server.js`.
- Tabla principal con 54 columnas â†’ propuesta: vista compacta por defecto (UX-1) + virtualizaciÃ³n (UX-2).
- 152 ocurrencias de `alert()` en frontend â†’ sustituir por toasts (UX-3).
- Sin validaciÃ³n estricta de payloads en `/save-json` (BK-1).
- Sin esquema JSON formal para `engine_*.json` (DT-2). Propuesta de refactor: [proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md](proposals/MILU_JSON_SCHEMA_REFACTOR_PROPOSAL.md) (**PENDIENTE DE VALIDAR**).

---

## Referencias

- CanÃ³nico: [00_overview.md](00_overview.md)
- Estructura: [01_structure.md](01_structure.md)
- Backend: [BACKEND.md](BACKEND.md), [docs/modules/server.md](modules/server.md)
- Frontend: [FRONTEND.md](FRONTEND.md)
- IntegraciÃ³n FE+BE: [MILU_FRONTEND_BACKEND.md](MILU_FRONTEND_BACKEND.md)
- AR-1: [12_ar1_carga_incremental.md](12_ar1_carga_incremental.md)
- AuditorÃ­a: [09_auditoria_2026.md](09_auditoria_2026.md)

