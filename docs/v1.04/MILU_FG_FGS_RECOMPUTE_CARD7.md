# MILU V1.04 - Recompute ficha 7: Fill Missing FG/FGS by BOM

## Objetivo de la ficha 7

La ficha 7 de recompute_simple ejecuta el flujo oficial para completar FG/FGS faltante sin sobrescribir valores existentes.

Alcance funcional:
- Solo actua sobre registros con fg_fgs_final vacio.
- Usa bom_final como clave de busqueda en el catalogo BOM -> FG/FGS.
- Si hay match: completa fg_fgs_final y recalcula fg_code, fgs_description y fgs_code_description.
- Si no hay match: deja fg_fgs_final vacio y contabiliza BOM_NOT_FOUND.
- Nunca sobrescribe registros que ya tienen fg_fgs_final.

## Endpoint

POST /api/recompute-simple/fill-missing-fg-fgs

Payload:

```json
{
  "engine": "ALL | 12V4000M40A | ...",
  "dryRun": true,
  "backup": true
}
```

Comportamiento:
- dryRun=true por defecto.
- Si dryRun=false, exige SERVER_ENABLE_DANGEROUS_WRITE=true.
- En caso contrario responde 403.

Respuesta:

```json
{
  "ok": true,
  "dryRun": true,
  "engine": "ALL",
  "summary": {
    "recordsProcessed": 0,
    "alreadyHadFgFgs": 0,
    "missingFgFgs": 0,
    "withBom": 0,
    "withoutBom": 0,
    "bomFound": 0,
    "bomNotFound": 0,
    "recordsFillable": 0,
    "recordsUpdated": 0,
    "conflicts": 0
  },
  "reportPath": "docs/v1.04/FG_FGS_FILL_MISSING_DRYRUN_REPORT.md"
}
```

## Script ejecutado

El endpoint invoca:

```bash
python scripts/fill_missing_fg_fgs_by_bom.py --engine <ENGINE|ALL> --dry-run|--write [--backup]
```

## Reglas funcionales

- Si fg_fgs_final tiene valor: no se toca.
- Si fg_fgs_final esta vacio y bom_final existe:
  - busca BOM en catalogo.
  - si encuentra, propone/aplica FG/FGS y campos derivados.
  - si no encuentra, mantiene vacio.
- Si bom_final esta vacio: mantiene vacio.
- No conserva valores historicos en registros vacios sin match.

## Dry-run vs Write

- Dry-run:
  - Simulacion sin escritura en engine_*.json.
  - Permite validar cobertura y contadores antes de escribir.
- Write:
  - Escribe solo cambios de registros vacios que son rellenables.
  - Puede crear backup cuando backup=true.

## Proteccion SERVER_ENABLE_DANGEROUS_WRITE

- dryRun=false sin SERVER_ENABLE_DANGEROUS_WRITE=true -> 403.
- El guard evita escrituras accidentales desde UI o llamadas HTTP directas.

## Metricas devueltas

- recordsProcessed
- alreadyHadFgFgs
- missingFgFgs
- withBom
- withoutBom
- bomFound
- bomNotFound
- recordsFillable
- recordsUpdated
- conflicts

## Riesgos

- Catalogo BOM desactualizado reduce recordsFillable y aumenta BOM_NOT_FOUND.
- En write, una seleccion de engine incorrecta puede aplicar cambios en un alcance mayor al esperado.
- Backups masivos pueden consumir espacio si se ejecuta write sobre muchos motores.

## Rollback

- Si write se ejecuto con backup=true:
  - restaurar desde archivos .bak creados por el script.
- Si no hubo backup:
  - restaurar desde control de versiones o copia manual previa.
- Recomendacion operativa:
  - ejecutar siempre dry-run, revisar resumen y luego write por engine controlado.
