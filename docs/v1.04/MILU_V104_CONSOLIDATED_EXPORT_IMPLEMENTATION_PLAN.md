# MILU_V104_CONSOLIDATED_EXPORT_IMPLEMENTATION_PLAN

Fecha: 2026-06-05

## Alcance

Plan de ejecucion sin escritura de datos en esta fase.

## 1) Scripts a tocar

Principal:

- scripts/export_wordpress_milu.js

Secundarios (tests/validacion):

- scripts/validate_wordpress_superseded_export.js
- tests/export-field-helper.test.js
- tests/smoke/python-exporters-smoke.test.js

## 2) Funciones nuevas a crear

En scripts/export_wordpress_milu.js:

1. normalizePnForConsolidation(row)
2. groupRowsByNormalizedPn(rows)
3. selectPrincipalByStableOrder(group)
4. mergeCanonicalByPn(group, principal)
5. mergeAccumulatedByPn(group)
6. buildConsolidatedExpImagenes(group, principal)
7. buildConsolidatedExpCategorias(group)
8. validatePnUniqueness(rows)
9. validateNoSiblingLoss(group, consolidated)
10. buildPnConsolidationAudit(reportContext)

## 3) Funciones actuales que se mantienen

- loadEngineRows
- writeOutputs
- run (estructura general de pipeline)
- reglas QA de decision import/discard/pending
- dedupeByPn (adaptandolo a PN normalizado consolidado)

## 4) Tests a anadir

Unitarios:

1. normalizacion de PN (espacios/variantes).
2. seleccion determinista de principal por orden estable.
3. merge de campos unicos con conflicto.
4. merge de campos acumulables con orden estable.
5. construccion de exp_imagenes con fallback correcto.

Integracion:

1. una fila por PN en new.
2. una fila por PN en superseded.
3. cero duplicados por formato de PN.
4. no perdida de assets de hermanos.
5. no perdida de GESA/SUST de hermanos.

## 5) Validaciones antes/despues

Antes:

- baseline de PN unicos engines: 5860.
- baseline export: 8631 filas, 8630 PN unicos, 1 duplicado.
- baseline perdida principal-only: 4810 PN (assets), 414 PN (GESA/SUST).

Despues:

- duplicados por PN = 0.
- una sola fila por PN normalizado en cada bucket.
- assets hermanos incluidos en fila consolidada.
- GESA/SUST presentes aunque vengan de copia.

## 6) Riesgos

1. Regresion en reglas sinteticas de superseded/new.
2. Incremento de cardinalidad en exp_imagenes/exp_categorias.
3. Conflictos de campos unicos por PN no resueltos explicitamente.
4. Dependencias downstream que asumen principal-only.

## 7) Rollback

1. Mantener comportamiento actual como ruta de respaldo.
2. Entregar cambio bajo flag interno de ejecucion.
3. Ejecutar export viejo y nuevo en paralelo durante validacion.
4. Si falla KPI, revertir a salida previa y conservar reporte de difs.

## 8) Secuencia recomendada

1. Implementar agrupacion por PN normalizado.
2. Implementar principal determinista.
3. Implementar merge consolidado (assets + GESA/SUST + categorias).
4. Integrar validaciones obligatorias de unicidad y no perdida.
5. Ajustar tests y validadores.
6. Ejecutar smoke export y comparar con baseline.
