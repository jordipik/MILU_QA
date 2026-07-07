# MILU V1.04 - WordPress Post-Import Field Fix Report

## Alcance

Hotfix aplicado solo en [scripts/export_wordpress_milu.js](scripts/export_wordpress_milu.js), sin tocar:

- `engine_*.json`
- endpoints
- contrato de columnas
- orden de columnas
- logica de consolidacion por hermanos
- export definitivo

## Campos corregidos

| Campo WordPress | Origen anterior | Origen nuevo |
|---|---|---|
| `fecha_version` | `row.fecha_version` o vacio | `row.fecha_version` y, si falta, timestamp real `YYYYMMDD.HHMM` |
| `GESA_NORM` | `row.GESA_NORM` | `row.norma_final` |
| `GESA_NORMALIZADO` | `row.GESA_NORMALIZADO` | `row.normalizado_final` |
| `fg_code` | valor normalizado derivado (`fg_code`/`FG/FGS`) | `row.fg_fgs_final` preservando el valor completo |
| `fg_description` | lookup/fallback derivado | `row.fgs_description` |
| `fg_code_description` | composicion desde `fg_code + fg_description` | `row.fgs_code_description` |
| `TIPOARTICULO` | `row.TIPOARTICULO` | constante `piezas` |
| `PAG` | `row.PAG` o `Source Page` | `row.libro_pag` consolidado |

## Ajustes tecnicos aplicados

- Se añadió generacion de timestamp real para `fecha_version` cuando no llega poblado.
- Se preserva `fg_fgs_final` completo en `fg_code` exportado.
- El lookup auxiliar de FG sigue usando version normalizada solo para catalogo interno.
- `PAG` ahora toma `libro_pag`, que ya viene con formato `ENGINE-####`.
- Se mantiene la consolidacion por hermanos usando `joinUniqueSorted(...)`.

## Tests añadidos/actualizados

Archivo: [tests/wordpress-export-consolidation.test.js](tests/wordpress-export-consolidation.test.js)

Casos añadidos:

1. `fecha_version` no vacio y con formato timestamp
2. `GESA_NORM` toma `norma_final`
3. `GESA_NORMALIZADO` toma `normalizado_final`
4. `fg_code` toma `fg_fgs_final`
5. `fg_description` toma `fgs_description`
6. `fg_code_description` toma `fgs_code_description`
7. `TIPOARTICULO` siempre es `piezas`
8. `PAG` usa `libro_pag` con formato `engine-page` y padding 4 digitos

## Resultado de tests

Comando ejecutado:

```bash
node --test tests/wordpress-export-contract.test.js tests/wordpress-export-consolidation.test.js
```

Resultado:

- PASS 21/21
- FAIL 0

## Dry-run ejecutado

Comando ejecutado:

```bash
node -e "const exp=require('./scripts/export_wordpress_milu.js'); exp.run({dryRun:true, writeAuditMirror:false});"
```

Resultado dry-run:

- `dry_run`: true
- `engines_processed`: 9
- `occurrences_processed`: 69681
- `import`: 8631
- `new`: 5501
- `superseded`: 3130
- `pending`: 0
- `discard`: 0

No se escribio export definitivo.

## Muestra real antes/despues

PN auditado: `136M52010/1`

Antes:

- `fecha_version`: vacio
- `GESA_NORM`: vacio
- `GESA_NORMALIZADO`: vacio
- `fg_code`: `202`
- `fg_description`: vacio
- `fg_code_description`: `202`
- `TIPOARTICULO`: vacio
- `PAG`: `221, 231, 252, 257, 589, 733, 1460, 1844`

Despues:

- `fecha_version`: `20260605.0218`
- `GESA_NORM`: vacio
- `GESA_NORMALIZADO`: `NO`
- `fg_code`: `202-65`
- `fg_description`: `COOLANT CIRCUIT, GENERAL, HT CIRCUIT`
- `fg_code_description`: `202 COOLANT CIRCUIT, GENERAL, HT CIRCUIT`
- `TIPOARTICULO`: `piezas`
- `PAG`: `12V4000M40A-0257, 12V4000M70-0252, 12V4000M70-0589, 16V4000M61-0231, 16V4000M61-0733, 16V4000M90-0221, 20V4000M93L-1460, 20V4000M93L-1844`

## Veredicto

Hotfix validado en tests y en dry-run real.

Estado: APTO PARA SIGUIENTE PASO

Condicion mantenida:

- No ejecutar export definitivo hasta confirmacion posterior.
