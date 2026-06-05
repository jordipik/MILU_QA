# FG/FGS Fill Missing Dry-Run Report

Generated at: 2026-06-05T00:55:23Z
Mode: WRITE
Engine scope: 12V4000M53
Catalog source: file
Catalog path: C:\Users\jordi\source\repos\milu\data\catalogs\FG_FGS_CATALOG.json
FG catalog path: C:\Users\jordi\source\repos\milu\EXCEL_FG-FGS.json

## Totals

- registros procesados: 6707
- registros con fg_fgs_final vacío: 2498
- registros con BOM: 2498
- registros sin BOM: 0
- BOM encontrados: 0
- BOM no encontrados: 2498
- registros rellenables: 0
- registros que no se tocarían porque ya tenían valor: 4209
- conflictos BOM → FG/FGS (filas afectadas): 0
- conflictos BOM → FG/FGS (BOMs únicos del catálogo): 37

## Coverage Estimate

- cobertura actual estimada: 62.76%
- cobertura nueva estimada: 62.76%
- incremento estimado: 0.00 puntos

## Safety Checks

- Solo propone cambios en registros con fg_fgs_final vacío: YES
- No propone sobrescribir valores existentes: YES
- Si no hay BOM o no hay match, deja vacío: YES

## Cambios propuestos por libro

- No hay cambios propuestos.

## Muestras rellenables

- No hay muestras rellenables.

## Muestras BOM_NOT_FOUND

- 12V4000M53 | ID RB-12V4000M53-000035 | PN X59401100065 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000036 | PN X59301100005 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000037 | PN 5240110570 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000038 | PN 5240110172 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000039 | PN X52899100040 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000040 | PN 700521020200 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000041 | PN 5249970020 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000042 | PN 5240510110 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000043 | PN X00027830 | BOM X59401100066 | BOM_NOT_FOUND
- 12V4000M53 | ID RB-12V4000M53-000044 | PN X59301300038 | BOM X59401100066 | BOM_NOT_FOUND

## Muestras de conflicto

- No hay muestras de conflicto.

## Decision

- No ejecutar `--write` hasta aprobar este reporte.
