# Deuda de validacion de schema preexistente

Fecha: 2026-05-16

## Resumen ejecutivo

- Estado actual de `npm run validate:schema`: FAIL.
- Errores totales: 31.
- Registros afectados: 1.
- Engine afectado: `12V4000M40A` (`engine_12V4000M40A.json`, registro `ID=1199999`).
- Causa raiz mas probable: fila de cabecera/plantilla de importacion cargada como registro de datos (valores literales con nombre de campo).
- Impacto en legacy cleanup: no bloquea la limpieza legacy documental/codigo de bajo riesgo, pero si bloquea el gate de validacion estricta de schema mientras exista.

## Resultado de ejecucion

- Comando: `npm run validate:schema`
- Resultado: `FAIL`
- Resumen del validador:
  - Ficheros validados: 9
  - Registros totales: 67884
  - Errores schema: 31

## Errores por engine

| Engine | Archivo | Registros con error | Errores |
|---|---|---:|---:|
| 12V4000M40A | engine_12V4000M40A.json | 1 | 31 |
| 12V4000M53 | engine_12V4000M53.json | 0 | 0 |
| 12V4000M70 | engine_12V4000M70.json | 0 | 0 |
| 16V4000M61 | engine_16V4000M61.json | 0 | 0 |
| 16V4000M73 | engine_16V4000M73.json | 0 | 0 |
| 16V4000M73L | engine_16V4000M73L.json | 0 | 0 |
| 16V4000M90 | engine_16V4000M90.json | 0 | 0 |
| 20V4000M93 | engine_20V4000M93.json | 0 | 0 |
| 20V4000M93L | engine_20V4000M93L.json | 0 | 0 |

## Errores por tipo de problema

| Tipo | Regla incumplida | Conteo |
|---|---|---:|
| `oneOf` (tipo permitido no coincide) | `oneOf` | 23 |
| tipo incorrecto | `type` (`integer`/`boolean`) | 6 |
| enum invalido | `enum` | 1 |
| formato invalido de fecha | `format: date-time` | 1 |

## Errores por campo

Todos los errores pertenecen al mismo registro: `engine_12V4000M40A.json`, `ID=1199999`, `engine=12V4000M40A`.

| Archivo | Engine | Registro | Campo | Valor actual | Regla schema incumplida | Posible causa |
|---|---|---|---|---|---|---|
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | criterio_pn | "criterio_pn" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | existeix_gesa | "existeix_gesa" | `oneOf: boolean \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | existeix_sust_new | "existeix_sust_new" | `oneOf: boolean \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | existeix_sust_old | "existeix_sust_old" | `oneOf: boolean \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | Hierarchie | "Hierarchie" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | Replacement Type | "Replacement Type" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | MTART | "MTART" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | MSTAE | "MSTAE" | `oneOf: number \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | status | "status" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | model | "model" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | fg_code | "fg_code" | `oneOf: number \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | precio | "precio" | `oneOf: number \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | gesa | "gesa" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | normalizado | "normalizado" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | sust_hierarchie | "sust_hierarchie" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | book_set | "book_set" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | depuracion_ts | "depuracion_ts" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | pos_error | "pos_error" | `type: integer` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | pn_error | "pn_error" | `type: integer` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | designation_error | "designation_error" | `type: integer` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | weight_error | "weight_error" | `type: integer` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | measurement_error | "measurement_error" | `type: integer` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | norma_error | "norma_error" | `type: integer` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | bom_error | "bom_error" | `type: integer` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | total_error | "total_error" | `type: integer` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | has_error | "has_error" | `type: boolean` (recibido string) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | qa_revision_estado | "qa_revision_estado" | `enum: ["ok","pendiente"]` | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | qa_revision_updated_at | "qa_revision_updated_at" | `format: date-time` (ISO 8601) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | qa_revision_confianza | "qa_revision_confianza" | `oneOf: number \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | qa_revision_fecha | "qa_revision_fecha" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |
| engine_12V4000M40A.json | 12V4000M40A | ID=1199999 | normalizado_pdf | "normalizado_pdf" | `oneOf: string \| null` (no coincide) | Fila cabecera importada como dato |

## Severidad

| Criterio | Evaluacion |
|---|---|
| Integridad de datos | Media (afecta 1 registro, 31 violaciones derivadas) |
| Riesgo operativo runtime | Baja (no afecta arranque ni lectura principal de la app) |
| Riesgo de pipeline/calidad | Media-Alta (rompe `validate:schema`) |
| Alcance | Acotado a 1 engine y 1 registro |

## Recomendacion de correccion (sin aplicar en este informe)

1. Corregir en fase de datos separada (no en fase legacy cleanup).
2. Eliminar o reparar el registro `ID=1199999` en `engine_12V4000M40A.json` segun criterio de negocio (registro real vs fila de cabecera residual).
3. Reejecutar validaciones:
   - `npm run validate:schema`
   - `npm run validate:field-refactor-final`
   - `npm run validate:field-refactor-final:exports`

## Bloqueo respecto a legacy cleanup

- Legacy cleanup Fase 1/Fase 2 (documental/codigo no-datos): **No bloqueado** por estos errores.
- Cierre de calidad con gate de schema en verde: **Si bloqueado** hasta resolver la deuda de datos.