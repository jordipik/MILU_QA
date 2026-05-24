# Contrato De Copia PDF -> _pdf

Este documento define el contrato obligatorio para cualquier flujo que copie lectura PDF a campos `*_pdf`.

## Funcion Canonica

La unica funcion canonica de escritura para este contrato es:

- `applyCanonicalPdfCopyToRow(...)`
- Ubicacion: `scripts/qa_pdf_visual_copy.js`

Cualquier flujo nuevo que copie PDF -> `*_pdf` debe delegar en esta funcion.

## Regla Principal: Reemplazo Total (Por Defecto)

El comportamiento por defecto es **reemplazo total** del estado `*_pdf`:

1. Limpiar primero todos los campos `*_pdf` existentes en la fila.
2. Escribir despues solo los valores detectados en la nueva lectura.
3. No conservar residuos historicos de ejecuciones anteriores.

En terminos de contrato, el resultado final de `*_pdf` debe representar un snapshot limpio de la lectura actual, no un merge incremental opaco.

## Regla Derivada: norma_pdf -> normalizado_pdf

Si en la escritura se establece `norma_pdf` con un valor no vacio detectado, entonces:

- `normalizado_pdf` debe pasar a `SI`.

Esta regla forma parte del contrato y no debe implementarse en paralelo fuera de la funcion canonica.

## Modo Sin Limpieza (Excepcion Controlada)

Existe un modo con limpieza desactivada (`clearPdfBeforeCopy: false`) solo como excepcion controlada.

Uso esperado:

- Casos puntuales de merge deliberado.
- Nunca como comportamiento por defecto del pipeline.

## Flujos Que Deben Usar La Funcion Canonica

Los flujos actuales y futuros de copia PDF -> `*_pdf` deben usar `applyCanonicalPdfCopyToRow(...)` de forma directa o por delegacion.

Incluye:

- Endpoint de copia puntual.
- Recompute visual-compatible.
- Batch backend multi-libro.
- Scripts CLI de copia PDF.
- Cualquier nuevo recalculo automatico que toque `*_pdf`.

## Test De Contrato

El contrato queda protegido por:

- Test: `tests/pdf-copy-contract.test.js`
- Script: `npm run test:pdf-copy-contract`

Este test verifica al menos:

- Reemplazo total con limpieza previa.
- Ausencia de residuos antiguos en `*_pdf`.
- Regla `norma_pdf -> normalizado_pdf = SI`.
- Diferencia explicita frente al modo sin limpieza.

## Validacion Recomendada Antes De Integrar Cambios

Ejecutar:

- `npm run test:pdf-copy-contract`
- `npm run test:smoke`

Si falla el test de contrato, se considera rotura de la regla PDF -> `*_pdf` y debe corregirse antes de fusionar cambios.
