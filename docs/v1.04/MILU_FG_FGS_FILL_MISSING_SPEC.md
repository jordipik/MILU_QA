# MILU FG/FGS Fill Missing Spec

## Objetivo

Completar exclusivamente registros con `fg_fgs_final` vacío usando `bom_final` como clave de búsqueda sobre un catálogo BOM → FG/FGS.

## Alcance

- Solo procesa filas con `fg_fgs_final` vacío.
- Nunca sobrescribe un `fg_fgs_final` ya informado.
- No usa datos legacy.
- No toca WordPress.
- No toca otros campos salvo los derivados FG cuando realmente se rellena `fg_fgs_final`.

## Script

- [scripts/fill_missing_fg_fgs_by_bom.py](scripts/fill_missing_fg_fgs_by_bom.py)

Parámetros:

- `--engine 12V4000M40A | ALL`
- `--dry-run`
- `--write`
- `--backup`
- `--catalog data/catalogs/FG_FGS_CATALOG.json`
- `--fg-catalog EXCEL_FG-FGS.json`

## Regla funcional

1. Si `fg_fgs_final` ya tiene valor:
   - no tocar.
2. Si `fg_fgs_final` está vacío:
   - leer `bom_final`
   - buscar ese BOM en catálogo BOM → FG/FGS
   - si existe match único:
     - escribir `fg_fgs_final`
     - recalcular `fg_code`
     - recalcular `fgs_description`
     - recalcular `fgs_code_description`
   - si no existe:
     - dejar vacío
     - registrar `BOM_NOT_FOUND`
   - si el BOM tiene conflicto en catálogo:
     - dejar vacío
     - registrar conflicto

## Catálogos

Catálogo BOM → FG/FGS:

- [data/catalogs/FG_FGS_CATALOG.json](data/catalogs/FG_FGS_CATALOG.json)

Catálogo FG descriptivo:

- [EXCEL_FG-FGS.json](EXCEL_FG-FGS.json)

## Diferencia frente a rebuild total

`fill missing`:

- solo completa huecos
- preserva valores existentes
- no recalcula filas ya pobladas
- se usa para aumentar cobertura con riesgo acotado

`rebuild total`:

- vacía/recalcula todos los registros objetivo
- puede sustituir valores ya presentes
- implica una operación mucho más invasiva
- no es equivalente a este flujo

## Integración futura

- No integrar todavía en UI.
- No añadir botón todavía.
- Mantener como utilidad offline con revisión previa del reporte dry-run.

## Validación requerida antes de `--write`

1. Ejecutar `--dry-run`.
2. Revisar [docs/v1.04/FG_FGS_FILL_MISSING_DRYRUN_REPORT.md](docs/v1.04/FG_FGS_FILL_MISSING_DRYRUN_REPORT.md).
3. Confirmar que solo se proponen cambios en filas con `fg_fgs_final` vacío.
4. Confirmar que no se sobrescriben valores existentes.
5. Confirmar cobertura estimada y conflictos.
6. Aprobar explícitamente antes de `--write`.