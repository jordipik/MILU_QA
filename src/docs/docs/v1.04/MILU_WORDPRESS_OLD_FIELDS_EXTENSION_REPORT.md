# MILU_WORDPRESS_OLD_FIELDS_EXTENSION_REPORT

STATUS: V1.04
DATE: 2026-06-06

## Motivo del cambio

La plantilla WordPress New requiere placeholders old_number_01..18 y old_ruta_01..18.
El contrato anterior solo exponia old_pn_relacionados, por lo que se amplia el contrato CSV sin tocar engine JSON ni endpoints.

## Columnas anadidas

Se anaden 36 columnas nuevas:

- old_number_01..old_number_18
- old_ruta_01..old_ruta_18

Posicion contractual:

- despues de old_pn_relacionados
- antes de EN_EXCEL_SUSTITUCION

Contrato resultante:

- 66 columnas totales

## Orden final

Fuente oficial:

- docs/v1.04/MILU_WORDPRESS_CANONICAL_EXPORT_SPEC.md
- tests/fixtures/wordpress_export_columns_v104.json

## Funcion generadora

Archivo:

- scripts/export_wordpress_milu.js

Implementacion:

- helper buildOldPnFields(rowOrGroup)
- consolidacion: old_pn_relacionados + subst_pnlist_final + sust_superseded_list
- dedupe estable
- maximo 18
- relleno vacio hasta 18
- old_ruta_N derivado de old_number_N con normalizacion de espacios para ruta

## Tests ejecutados

Comando de contrato + consolidacion:

- node --test tests/wordpress-export-contract.test.js tests/wordpress-export-consolidation.test.js

Resultado:

- PASS: 25
- FAIL: 0
- SKIP: 1 (validacion opcional del CSV generado en disco)

Cobertura agregada:

1. 66 columnas exactas y orden/case exacto.
2. Relleno old_number/old_ruta cuando hay 3 valores.
3. Limite maximo de 18 slots.
4. Dedupe de PN repetidos.
5. Regla de generacion de old_ruta.
6. Compatibilidad con old_pn_relacionados.

## Dry-run

Comando:

- node -e "const exp=require('./scripts/export_wordpress_milu.js'); exp.run({dryRun:true, writeAuditMirror:false});"

Validaciones observadas:

- headerCount = 66
- newHasOldFields = true
- supersededHasOldFields = true
- New rows = 5501
- Superseded rows = 3130
- changedRows fg/fgs = 0
- backupsCreated = 0

## Ejemplos reales

Ejemplo 1:

- old_pn_relacionados = "200439016200, 635D01023/1, 0009976290"
- old_number_01 = "200439016200"
- old_ruta_01 = "200439016200"
- old_number_02 = "635D01023/1"
- old_ruta_02 = "635D01023/1"

## Riesgos

1. Plantillas externas que asuman exactamente 30 columnas pueden fallar hasta actualizar mapeo.
2. old_ruta_N usa normalizacion base (sin router dedicado), posible ajuste futuro si se define slug oficial.

## Rollback

1. Revertir commit de extension old fields.
2. Restaurar fixture/contrato a 30 columnas.
3. Restaurar tests de contrato previos.

No se requiere rollback de datos, porque no se modifican engine JSON ni endpoints.
