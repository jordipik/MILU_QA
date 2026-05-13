# Testing MILU (Smoke)

Este directorio centraliza la base oficial de pruebas smoke del proyecto MILU.

## Objetivo

Validar de forma rapida que el backend local sigue operativo en las capas criticas sin tocar datos vivos ni logica de negocio.

## Suites disponibles

- `npm test`
- `npm run test:all-smoke`
- `npm run test:smoke` (HTTP runtime)
- `npm run test:db-read` (lectura SQLite mirror)
- `npm run test:db-analytics` (analytics SQLite mirror)
- `node --test tests/smoke/python-lib.test.js` (helpers Python reutilizables)
- `node --test tests/smoke/python-exporters-smoke.test.js` (smoke de exportadores Python con ficheros temporales)

`npm test` es el entrypoint oficial y ejecuta `test:all-smoke`.
Dentro de ese circuito oficial se incluyen tambien los smoke tests Python de `python_lib` y de exportadores Python.

## Requisitos previos

1. Instalar dependencias:
   - `npm install`
2. Tener el servidor levantado:
   - `node server.js`
3. Para suites DB (`test:db-read` y `test:db-analytics`), disponer de mirror SQLite generado:
   - `npm run db:import`

## Variables de entorno

- `MILU_BASE_URL` (opcional): base URL del servidor.
  - Default: `http://localhost:3000`
- `MILU_SMOKE_TIMEOUT_MS` (opcional): timeout por request en ms.
  - Default: 10000 ms para HTTP y DB read, 15000 ms para analytics.

Ejemplo:

```powershell
$env:MILU_BASE_URL='http://localhost:3000'
$env:MILU_SMOKE_TIMEOUT_MS='20000'
npm test
```

## Cobertura actual

Consultar matriz oficial: `docs/testing/SMOKE_TEST_MATRIX.md`.

Resumen por capa:

- `runtime`: salud, version, catalogo engines, sincronizacion QA, export status/files, legacy 410.
- `db-read`: estado DB, resumenes, busqueda, detalle por PN y contratos read-only.
- `analytics`: overview, rankings, conflictos, drilldowns, cache y export CSV de vistas permitidas.
- `python-lib`: importabilidad y helpers comunes de `python_lib`.
- `python-exporters`: smoke no destructivo sobre exportadores Python concretos.

## Lo que SI cubren los smoke tests

- Disponibilidad de endpoints criticos.
- Contratos basicos de respuesta (status code, envelope JSON, campos minimos).
- Invariantes ligeras de datos (`ok=true`, contadores no negativos, limites de listas).
- Endpoints legacy bloqueados (`410`) y endpoints read-only con `405`.

## Lo que NO cubren todavia

- Flujos completos de UI en navegador.
- Escrituras destructivas de negocio (`/save-json`, `/apply-revision-to-engines`).
- Reglas funcionales finas de QA por fila/PN.
- Rendimiento con umbrales formales de SLA por endpoint.
- E2E con interaccion real (DOM, filtros, tablas, export UX).

## Tipos de pruebas en MILU

- Smoke:
  - Rapidas, bajo riesgo, enfocadas en disponibilidad/contrato.
- Functional (pendiente de ampliar):
  - Validan reglas de negocio especificas y resultados esperados.
- Integration (pendiente):
  - Verifican interaccion entre capas (UI-backend-JSON/DB).
- Future E2E (pendiente):
  - Escenarios completos de usuario desde interfaz hasta resultado final.

## Criterio de uso recomendado

1. Antes de cambios: `npm test`.
2. Durante cambios de DB/analytics: ejecutar suite especifica + `npm test`.
3. Antes de merge: `npm run test:all-smoke`.
