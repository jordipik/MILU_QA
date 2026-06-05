# MILU V1.04 - WordPress Post-Import Acceptance

## Estado

Veredicto final: APROBADO

## Seguridad

- No se tocaron endpoints.
- No se tocaron `engine_*.json`.
- Contrato de columnas: intacto.
- Orden de columnas: intacto.

Comprobacion explicita:

- `git status --short -- engine_*.json`
- Resultado: salida vacia

## Tests ejecutados

Comando ejecutado:

```bash
node --test tests/wordpress-export-contract.test.js tests/wordpress-export-consolidation.test.js
```

Resultado:

- PASS 21/21
- FAIL 0

## Comando de export definitivo

Comando ejecutado:

```bash
npm run export:wordpress
```

Resultado:

- Ejecutado correctamente
- Export definitivo generado en las rutas WordPress del repo

## Archivos generados / actualizados

Rutas de salida WordPress modificadas por la generacion final:

- [data/output/wordpress/milu_wp_new_import.csv](data/output/wordpress/milu_wp_new_import.csv)
- [data/output/wordpress/milu_wp_superseded_import.csv](data/output/wordpress/milu_wp_superseded_import.csv)
- [data/output/wordpress/milu_wp_import.csv](data/output/wordpress/milu_wp_import.csv)
- [data/output/wordpress/milu_wp_superseded.csv](data/output/wordpress/milu_wp_superseded.csv)
- [data/output/wordpress/milu_wp_export_summary.md](data/output/wordpress/milu_wp_export_summary.md)
- [data/05-wordpress/milu_wp_new_import.csv](data/05-wordpress/milu_wp_new_import.csv)
- [data/05-wordpress/milu_wp_superseded_import.csv](data/05-wordpress/milu_wp_superseded_import.csv)
- [data/05-wordpress/milu_wp_import.csv](data/05-wordpress/milu_wp_import.csv)
- [data/05-wordpress/milu_wp_superseded.csv](data/05-wordpress/milu_wp_superseded.csv)
- [data/05-wordpress/milu_wp_export_summary.md](data/05-wordpress/milu_wp_export_summary.md)

## Metricas finales

- import: 8631
- new: 5501
- superseded: 3130
- PN unicos: 8631
- duplicados por PN normalizado: 0

## Contrato CSV

- columnas canonicas: 30
- header new: 30
- header superseded: 30
- match exacto contra canonico: si
- orden exacto new vs superseded: si

## Validacion de campos corregidos

Validacion global sobre salida definitiva:

- `fecha_version` con formato timestamp `YYYYMMDD.HHMM`: CUMPLE
- `TIPOARTICULO = piezas` en todas las filas: CUMPLE
- `PAG` con formato `ENGINE-PAGE` padded (`ENGINE-####`): CUMPLE

Validacion de mapeos fuente por tests automatizados y muestra real:

- `GESA_NORM <- norma_final`: CUMPLE
- `GESA_NORMALIZADO <- normalizado_final`: CUMPLE
- `fg_code <- fg_fgs_final`: CUMPLE
- `fg_description <- fgs_description`: CUMPLE
- `fg_code_description <- fgs_code_description`: CUMPLE

Nota tecnica:

- En export consolidado por PN, varias filas fuente pueden coexistir por hermano/copia y los campos de negocio se resuelven con la logica del exportador validada en tests.
- Por eso la aceptacion final se apoya en: tests 21/21, chequeos globales de formato/constante y muestra real en datos definitivos.

## Muestra real antes/despues

PN auditado: `136M52010/1`

Antes del hotfix:

- `fecha_version`: vacio
- `GESA_NORM`: vacio
- `GESA_NORMALIZADO`: vacio
- `fg_code`: `202`
- `fg_description`: vacio
- `fg_code_description`: `202`
- `TIPOARTICULO`: vacio
- `PAG`: `221, 231, 252, 257, 589, 733, 1460, 1844`

Despues en salida definitiva:

- `fecha_version`: `20260605.0224`
- `GESA_NORM`: vacio
- `GESA_NORMALIZADO`: `NO`
- `fg_code`: `202-65`
- `fg_description`: `COOLANT CIRCUIT, GENERAL, HT CIRCUIT`
- `fg_code_description`: `202 COOLANT CIRCUIT, GENERAL, HT CIRCUIT`
- `TIPOARTICULO`: `piezas`
- `PAG`: `12V4000M40A-0257, 12V4000M70-0252, 12V4000M70-0589, 16V4000M61-0231, 16V4000M61-0733, 16V4000M90-0221, 20V4000M93L-1460, 20V4000M93L-1844`

Esperado para `PAG`:

- `12V4000M40A-0257, 12V4000M70-0252, 12V4000M70-0589, 16V4000M61-0231, 16V4000M61-0733, 16V4000M90-0221, 20V4000M93L-1460, 20V4000M93L-1844`

Resultado:

- Coincidencia exacta: si

## Comparacion contra dry-run validado

Equivalencia practica contra el dry-run validado:

- `new`: igual ignorando `fecha_version` dinamico
- `superseded`: igual ignorando `fecha_version` dinamico

Interpretacion:

- La unica diferencia natural entre dry-run y definitivo es el timestamp real de `fecha_version`.
- El contenido funcional del export coincide con el dry-run validado.

## Confirmacion final

1. Tests: PASS
2. Export definitivo: generado
3. Contrato 30 columnas: intacto
4. Duplicados PN: 0
5. PAG corregido con formato `ENGINE-####`: si
6. No cambios en engine JSON: confirmado

Estado final: APTO Y ACEPTADO
