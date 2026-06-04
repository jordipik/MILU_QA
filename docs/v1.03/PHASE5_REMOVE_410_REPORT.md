# PHASE5_REMOVE_410_REPORT

Decision aplicada: D-26

Fecha: 2026-06-04

## Endpoints retirados de server.js

Se eliminaron fisicamente estas rutas legacy que devolvian 410:

- POST /recompute-pdf-auto
- POST /export/run-synthetic
- POST /export/run-ai-conflicts
- POST /export/run-all
- POST /apply-qa-checks-filter
- GET /pn/list
- GET /pn/:sku
- GET /pn/:sku/sources

## Validacion previa de dependencias activas

### HTML

Busqueda en archivos HTML: sin coincidencias para las rutas anteriores.

### Fetch/JS de frontend

Busqueda en js/**/*.js: sin coincidencias para esas rutas.

### Imports

No existen imports asociados (eran handlers inline de Express, no modulos importados).

### Observacion

Persisten referencias en pruebas smoke legacy:

- tests/smoke/http-smoke.test.js

Esto no afecta runtime productivo, pero puede requerir ajuste de pruebas en una fase posterior.

## Resultado

- Rutas 410 legacy retiradas del routing.
- No se detectaron llamadas activas desde UI oficial.
- No se modificaron endpoints oficiales V1.03.