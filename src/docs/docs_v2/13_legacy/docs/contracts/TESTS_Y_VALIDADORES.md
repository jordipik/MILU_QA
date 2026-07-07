# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Tests y validadores â€” Fase D

> Estado: v1 (fase actual). Objetivo: **blindar el comportamiento actual sin refactorizar**.

Esta capa protege MILU de regresiones a travÃ©s de dos artefactos independientes y de solo lectura:

1. **Smoke tests HTTP** (`npm run test:smoke`) â€” verifican que los endpoints crÃ­ticos del backend Express responden con el contrato esperado.
2. **Validador de contratos de datos** (`npm run validate:engines`) â€” recorre los 9 `engine_*.json` y emite un informe sobre cumplimiento de los contratos formales.
3. **Tests de seguridad de escritura** (`tests/security/write-validation.test.js`) â€” validan que los payloads peligrosos se bloquean antes de escribir.

Ninguno modifica datos ni cÃ³digo. Solo leen y generan informes.

---

## 1. Smoke tests HTTP

- **Archivo**: [tests/smoke/http-smoke.test.js](../../tests/smoke/http-smoke.test.js)
- **Runner**: `node:test` builtin de Node (sin frameworks de terceros).
- **Asserts**: `node:assert/strict`.
- **HTTP client**: `fetch` nativo (Node 18+).

### CÃ³mo ejecutarlos

1. Levantar el servidor en otra terminal:

   ```powershell
   node server.js
   # o bien
   .\Ejecutar localhost.bat
   ```

2. En otra terminal, ejecutar:

   ```powershell
   npm run test:smoke
   ```

3. Para apuntar a otra URL base:

   ```powershell
   $env:MILU_BASE_URL = "http://localhost:3000"
   npm run test:smoke
   ```

### QuÃ© se valida

| # | Endpoint | VerificaciÃ³n |
|---|---|---|
| 1 | `GET /health` | 200, JSON, `ok=true` o `service` definido |
| 2 | `GET /version` | 200, JSON, `version` o `appVersion` string |
| 3 | `GET /engines` | 200, JSON, `ok=true`, `engines.length === 9`, `totals.rowCount > 0` |
| 4 | `GET /qa_revision_sync.php` | 200, JSON, **no PHP fuente, no HTML**, contiene `meta` o `revisions` |
| 5 | `GET /pn-review/list` | 200, JSON, `ok=true`, `rows[]` o `total` |
| 6 | `GET /export/status` | 200, JSON, `ok=true` |
| 7 | `GET /export/files` | 200, JSON, `ok=true` |
| 8 | Legacy â†’ `410` | `GET /pn/list`, `POST /export/run-synthetic`, `POST /export/run-ai-conflicts`, `POST /export/run-all` |

### QuÃ© NO se valida (intencionado)

- Endpoints destructivos: `POST /save-json`, `POST /apply-revision-to-engines`, `POST /pn-review/:sku/apply-decision`, `POST /export/run-wordpress`. No deben ejecutarse en una suite smoke.
- Contenido funcional fino de cada respuesta (por ejemplo: orden de filas, valores concretos).
- UI / frontend.
- Persistencia: no se comprueba que un POST haya escrito en `qa_revision_server_data.json` (ese tipo de test pertenece a una fase posterior con datos sintÃ©ticos y rollback).

### Variables de entorno

| Variable | Default | Uso |
|---|---|---|
| `MILU_BASE_URL` | `http://localhost:3000` | URL base del servidor a probar. |
| `MILU_SMOKE_TIMEOUT_MS` | `10000` | Timeout por peticiÃ³n (ms). |

---

## 2. Validador de contratos sobre `engine_*.json`

- **Archivo**: [scripts/validate_engine_contracts.js](../../scripts/validate_engine_contracts.js)
- **Contratos de referencia**:
  - [CONTRATO_JSON_ENGINE.md](CONTRATO_JSON_ENGINE.md)
  - [CONTRATO_REVISION_QA.md](CONTRATO_REVISION_QA.md)
  - [CONTRATOS_VALIDACION_CODIGO.md](CONTRATOS_VALIDACION_CODIGO.md)

### CÃ³mo ejecutarlo

```powershell
npm run validate:engines
```

No requiere servidor levantado. Solo lee los 9 `engine_*.json` del root del repo.

### QuÃ© genera

- [data/output/validation/engine_contract_validation.json](../../data/output/validation/engine_contract_validation.json) â€” informe completo (resumen + muestras de issues).
- [data/output/validation/engine_contract_validation.md](../../data/output/validation/engine_contract_validation.md) â€” versiÃ³n legible para humanos.

> Los conteos en `top_issues` / `issues_by_severity` son **reales** (no muestreados).  
> El array `issues` contiene **hasta 50 ejemplos por cÃ³digo** para mantener el informe manejable.

### QuÃ© se valida

| CategorÃ­a | Reglas |
|---|---|
| **Archivos** | Existen los 9 esperados; ningÃºn archivo `engine_*.json` inesperado. |
| **Identidad** | `ID` y al menos uno de `PART NO.` / `pn_final` / `pn_raw` por fila; `engine_model` inferible. |
| **QA estado** | `qa_revision_estado âˆˆ {ok, pendiente}`. VacÃ­o â†’ warning. Otros â†’ error. |
| **QA acciÃ³n** | `qa_revision_accion âˆˆ {importar, revisar, eliminar, copia}`. `descartar` â†’ **error** (legacy). Otros valores â†’ error. |
| **Campos legacy** | `measurement_final`, `wheight_final`, `qa_errors`, `qa_errors_active` â†’ warning si presentes. |
| **Campos derivados** | `*_error`, `has_error` â†’ solo contador agregado (decisiÃ³n pendiente, ver CONTRATOS_VALIDACION_CODIGO Â§C5). |
| **SUST** | `sust_hierarchie âˆˆ {New, Superseded, vacÃ­o}`. Otro valor â†’ error. `sust_status` solo se cuenta. |
| **ImÃ¡genes** | Contadores: filas sin `exp_imagenes`, con placeholder `sin_imagen`, con `ruta_foto`, con `ruta_esquemas_pos`. No se comprueba existencia fÃ­sica del archivo. |

### QuÃ© NO se valida (intencionado)

- **No se modifica ningÃºn dato** â€” solo lectura.
- No se comprueba que las imÃ¡genes referenciadas existan en `fotos_articulos/` ni en `esquemas/`.
- No se valida coherencia cruzada entre engines (mismo `PART NO.` en varios motores, etc.).
- No se compara con WordPress, Excel ni PDFs originales.
- No se ejecuta `depuracion_json.py`; el validador opera sobre el estado actual en disco.

### CÃ³digos de issue

| CÃ³digo | Severidad | Significado |
|---|---|---|
| `ENGINE_FILE_MISSING` | error | Falta un archivo `engine_*.json` esperado. |
| `ENGINE_FILE_UNEXPECTED` | warning | Existe un `engine_*.json` fuera del listado canÃ³nico. |
| `FILE_PARSE_ERROR` | error | El JSON no parsea. |
| `FILE_NOT_ARRAY` | error | El JSON raÃ­z no es array. |
| `FILE_EMPTY` | warning | Archivo con 0 filas. |
| `ROW_NOT_OBJECT` | error | Una fila no es objeto. |
| `ID_MISSING` | error | Fila sin `ID`. |
| `PN_MISSING` | error | Fila sin `PART NO.`/`pn_final`/`pn_raw`. |
| `ENGINE_MODEL_MISSING` | warning | Sin `engine_model` y no inferible del filename. |
| `QA_ESTADO_EMPTY` | warning | `qa_revision_estado` vacÃ­o. |
| `QA_ESTADO_INVALID` | error | `qa_revision_estado` fuera del contrato. |
| `QA_ACCION_EMPTY` | warning | `qa_revision_accion` vacÃ­o. |
| `QA_ACCION_DESCARTAR` | error | `qa_revision_accion="descartar"` (legacy â†’ migrar a `eliminar`). |
| `QA_ACCION_INVALID` | error | `qa_revision_accion` fuera del contrato. |
| `LEGACY_FIELD` | warning | Campo legacy persistido. |
| `SUST_HIERARCHIE_INVALID` | error | Valor fuera de `{New, Superseded, vacÃ­o}`. |

---

## 3. CÃ³mo interpretar los informes

- **`error`**: violaciÃ³n dura del contrato. Bloquea una migraciÃ³n limpia. Debe resolverse antes de refactorizar.
- **`warning`**: divergencia conocida o legacy tolerado hoy. Trazable.
- **`info`**: decisiÃ³n pendiente. No acciona por sÃ­ solo.

### Flujo recomendado

1. `npm run test:smoke` antes y despuÃ©s de cualquier cambio en `server.js` o endpoints.
2. `npm run validate:engines` antes y despuÃ©s de cualquier cambio que toque los `engine_*.json` (manual o vÃ­a `depuracion_json.py`).
3. Comparar el informe nuevo con el anterior: el nÃºmero total de issues por cÃ³digo no deberÃ­a aumentar.

---

## 4. PrÃ³ximos pasos (fuera del alcance de Fase D)

- Tests funcionales sobre POST en sandbox (con `MILU_BASE_URL` apuntando a una instancia con datos throwaway).
- Validador cruzado contra `qa_revision_server_data.json`.
- Validador de imÃ¡genes fÃ­sicas en `fotos_articulos/` y `esquemas/`.
- IntegraciÃ³n CI (GitHub Actions) ejecutando `validate:engines` en cada PR.
- Fase I: ampliar cobertura de `tests/security/write-validation.test.js` con matrices de compatibilidad legacy.

---

## Ver tambiÃ©n

- **Fase E â€” Base de datos espejo SQLite**: [../database/README.md](../database/README.md). AÃ±ade `npm run db:import`, `db:validate` y `db:queries`.
- **Fase F â€” Capa de lectura HTTP `/db/*`**: [../database/DB_READ_LAYER.md](../database/DB_READ_LAYER.md). AÃ±ade `npm run test:db-read` y `npm run test:all-smoke`.
- **Fase G â€” Capa analytics `/db/analytics/*`**: [../database/DB_ANALYTICS_LAYER.md](../database/DB_ANALYTICS_LAYER.md). AÃ±ade `npm run test:db-analytics`.

