# MILU_WORDPRESS_ASSET_URL_NORMALIZATION_REPORT

STATUS: V1.04 HOTFIX
DATE: 2026-06-06

## Motivo del cambio

El exportador WordPress estaba emitiendo URLs de assets en carpetas mensuales:

- /wp-content/uploads/2026/01/
- /wp-content/uploads/2026/02/

Se requiere usar carpetas por modelo POS para assets exportados.

## Campos afectados

Normalizacion aplicada en salida del exportador para campos de imagen:

- ruta_foto
- exp_imagenes (lista CSV)
- old_ruta_01 ... old_ruta_18 (solo si contienen rutas/filenames de assets)

## Regla aplicada

Si una URL contiene:

- /wp-content/uploads/2026/01/
- /wp-content/uploads/2026/02/

se normaliza a:

- /wp-content/uploads/<MODEL>-POS/<basename>

Deteccion de modelo:

1. Prefix del filename (modelo conocido).
2. Contexto del registro (engine_model, exp_motor, model_type, __engine_file).
3. Si no hay modelo: no transforma y registra warning URL_MODEL_NOT_FOUND.

Excepciones:

- URLs ya en /<MODEL>-POS/ no cambian.
- sin_imagen.jpeg no cambia.

## Ejemplos antes/despues

1) Antes:

https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/02/12V4000M40A-0208-01-70.webp

Despues:

https://milu-naval.mystagingwebsite.com/wp-content/uploads/12V4000M40A-POS/12V4000M40A-0208-01-70.webp

2) Antes:

https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/20V4000M93L-1374-01-400.webp

Despues:

https://milu-naval.mystagingwebsite.com/wp-content/uploads/20V4000M93L-POS/20V4000M93L-1374-01-400.webp

3) Sin cambio:

https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg

## Tests ejecutados

Comando:

- node --test tests/wordpress-export-contract.test.js tests/wordpress-export-consolidation.test.js

Cobertura de hotfix:

1. 2026/02 -> MODEL-POS
2. 2026/01 -> MODEL-POS
3. URL ya normalizada no cambia
4. exp_imagenes lista normaliza por item
5. sin_imagen no cambia
6. filename con modelo se normaliza
7. filename sin modelo registra URL_MODEL_NOT_FOUND

## Dry-run validado

Comando:

- node -e "const exp=require('./scripts/export_wordpress_milu.js'); exp.run({dryRun:true, writeAuditMirror:false});"

Validaciones objetivo:

- sin /wp-content/uploads/2026/01/ en assets POS exportados
- sin /wp-content/uploads/2026/02/ en assets POS exportados
- presencia de /wp-content/uploads/<MODEL>-POS/
- contrato de columnas intacto
- filas totales y PN unicos sin cambios funcionales
- sin cambios en engine JSON

Resultado observado:

- headerCount: 66
- rows exportables: 8631
- monthlyHits: 2534 (corresponden a fallback sin_imagen.jpeg)
- monthlyNonFallbackHits: 0
- posFolderHits: 30649
- URL_MODEL_NOT_FOUND: 0

Interpretacion:

- No quedan rutas mensuales para assets POS reales.
- Las rutas mensuales restantes pertenecen al fallback sin_imagen.jpeg, que se conserva por regla funcional.

## Warnings detectados

El exportador registra en report.warnings.URL_MODEL_NOT_FOUND:

- total
- examples (hasta 10)

Se usa para auditar casos ambiguos sin romper export.
