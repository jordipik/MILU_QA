# Contratos técnicos MILU — v1

> Fase: **CONTRATOS + ESTABILIDAD**. Documentación formal sin cambios de código.

Esta carpeta contiene los contratos oficiales del proyecto. Cualquier refactor, test smoke o validador de payload debe construirse sobre estos documentos.

## Documentos

| # | Documento | Contenido |
|---|---|---|
| 1 | [CONTRATO_JSON_ENGINE.md](CONTRATO_JSON_ENGINE.md) | Modelo oficial de fila de `engine_*.json`: identidad, raw, GESA, SUST, finales, QA persistido, derivados, inconsistencias conocidas. |
| 2 | [CONTRATO_REVISION_QA.md](CONTRATO_REVISION_QA.md) | Estados, acciones, mapeos legacy, decisión por PN, endpoints autorizados. |
| 3 | [CONTRATO_EXPORT_WORDPRESS.md](CONTRATO_EXPORT_WORDPRESS.md) | Proceso QA-only, agrupación por PN, criterio New/Superseded, outputs. |
| 4 | [CONTRATO_IMAGENES_ESQUEMAS.md](CONTRATO_IMAGENES_ESQUEMAS.md) | Campos, prioridades, estados visuales derivados, consumidores. |
| 5 | [CONTRATO_ENDPOINTS_CRITICOS.md](CONTRATO_ENDPOINTS_CRITICOS.md) | Tabla de endpoints: método, payload, disco, riesgo, validación. |
| 6 | [CONTRATOS_VALIDACION_CODIGO.md](CONTRATOS_VALIDACION_CODIGO.md) | Informe de discrepancias contrato ↔ código actual. Lista priorizada de correcciones. |
| 7 | [TESTS_Y_VALIDADORES.md](TESTS_Y_VALIDADORES.md) | Fase D: smoke tests HTTP (`npm run test:smoke`) y validador de `engine_*.json` (`npm run validate:engines`). |

## Reglas globales de esta fase

- **NO** modificar `server.js`, `js/*`, `scripts/*`, `engine_*.json`, `data/output/*`, `package.json`.
- Solo se edita documentación.
- Las inconsistencias detectadas se documentan en [CONTRATOS_VALIDACION_CODIGO](CONTRATOS_VALIDACION_CODIGO.md); no se corrigen aquí.

## Próximos pasos sugeridos (fuera de esta fase)

1. ~~Tests smoke de los endpoints~~ → implementado en Fase D, ver [TESTS_Y_VALIDADORES](TESTS_Y_VALIDADORES.md).
2. Validador de payload en `/save-json` con whitelist (basado en [CONTRATO_JSON_ENGINE](CONTRATO_JSON_ENGINE.md)).
3. ~~Validador de filas sobre los 9 `engine_*.json` con reporte~~ → implementado en Fase D, ver [TESTS_Y_VALIDADORES](TESTS_Y_VALIDADORES.md).
