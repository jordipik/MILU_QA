# MILU_V104_CONSOLIDATED_EXPORT_IMPLEMENTATION_PLAN

Fecha: 2026-06-04

## Alcance

Plan de implementación sin escritura, sin modificar código en esta fase.

## 1) Scripts a tocar

Principales:

- scripts/export_wordpress_milu.js

Soporte potencial:

- js/export-field-helper.js
- js/fieldAdapter.js
- tests relacionados con export y adapters

## 2) Funciones nuevas a crear

En export_wordpress_milu.js:

1. normalizePnForConsolidation
2. groupRowsByNormalizedPn
3. selectPrincipalByStableOrder
4. mergeCanonicalFields
5. mergeAccumulatedFields
6. buildConsolidatedExpImagenes
7. buildConsolidatedExpCategorias
8. validateConsolidatedUniqueness
9. buildConsolidationAuditReport

## 3) Funciones actuales que se mantienen

- Lectura de engine files
- Estructura de salida CSV/JSON
- Generación de summary/report
- Integración con lógica QA existente

## 4) Tests a añadir

Unidad:

1. Normalización PN (espacios y variantes)
2. Selección determinista del principal
3. Dedupe de assets y categorías
4. Consolidación GESA/SUST con conflicto
5. Construcción exp_imagenes con fallback correcto

Integración:

1. Unicidad PN en import y superseded
2. Cero pérdida de assets desde hermanos
3. Cero pérdida de GESA/SUST desde hermanos
4. Detección de duplicados por formato de PN

## 5) Validaciones antes y después

Antes:

- Snapshot de métricas actuales
- Recuento PN únicos engines y WordPress
- Duplicados WordPress

Después:

- Validar una fila por PN
- Validar cero duplicados
- Validar reducción a cero de pérdidas por hermanos
- Comparar volumen global con baseline

## 6) Riesgos

1. Regresiones en reglas de superseded
2. Incremento de tamaño de campos acumulados
3. Ambigüedad de principal en datos sucios
4. Impacto en consumidores que asumen fila individual no consolidada

## 7) Plan rollback

1. Mantener ruta legacy de export como fallback de emergencia
2. Activar export consolidado bajo flag interno de ejecución
3. Comparar ambos outputs en paralelo
4. Si falla validación, revertir a output legacy y conservar auditoría de difs

## 8) Orden recomendado de ejecución

1. Implementar normalización PN + agrupación
2. Implementar principal determinista
3. Implementar merge de assets y categorías
4. Implementar merge GESA/SUST
5. Activar validaciones de unicidad y pérdida
6. Correr test suite de export y smoke funcional
