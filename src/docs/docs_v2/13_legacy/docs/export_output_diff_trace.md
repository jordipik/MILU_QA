# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Export Output Diff Trace

Fecha: 2026-05-16

Objetivo: trazabilidad PN a PN de las diferencias detectadas inicialmente en `docs/export_output_compare.md` y clasificacion de causa raiz.

## Resumen inicial

- WordPress New: PN distintos (`solo legacy=1`, `solo semantic=1`).
- WordPress New: designation distinta en 2 PN.
- WordPress Superseded: designation distinta en 5 PN.

## Clasificacion global

- BASELINE_STALE: 9 casos.
- EXPECTED_RULE_CHANGE: 0.
- SEMANTIC_HELPER_BUG: 0.
- EXPORT_MAPPING_BUG: 0.
- DATA_INCONSISTENCY: 0.
- NORMALIZATION_ALIAS_MISSING: 0.

## Casos trazados

### 1) PN solo legacy: 000931008075

- Tipo diferencia: PN solo legacy.
- Clasificacion: BASELINE_STALE.
- Export legacy:
  - pn: `000931008075`
  - designation_final: `HEX SCREW`
  - engines/source_pages/source_ids: `12V4000M40A` / `16` / `1100658`
  - qa_revision_estado/accion: `ok` / `importar`
- Export semantic: no existe.
- Fuente engine (ID 1100658):
  - pn_final: `000931008075`
  - designation_final: `HEX SCREW`
  - designation_gesa: `HEX SCREW`
  - designation_excel: ``
  - designation_pdf: `BOLT HEX`
  - qa_revision_estado/accion: `ok` / `revisar`
  - hierarchie_final/sust_hierarchie: `` / ``
  - status legacy: `OK_GESA`
  - new_pn_final/sust_new_part_number: `` / ``
  - source_page: `16`
- Motivo probable: baseline legacy incluye PN sin fila actual `ok/importar`.

### 2) PN solo semantic: X00E50208388

- Tipo diferencia: PN solo semantic.
- Clasificacion: BASELINE_STALE.
- Export legacy: no existe.
- Export semantic:
  - pn: `X00E50208388`
  - designation_final: `PRESSURE SENSOR`
  - engines/source_pages/source_ids: `12V4000M53` / `338` / `1202840`
  - qa_revision_estado/accion: `ok` / `importar`
- Fuente engine (ID 1202840):
  - pn_final: `X00E50208388`
  - designation_final: `PRESSURE SENSOR`
  - designation_gesa: ``
  - designation_excel: ``
  - designation_pdf: `PRESSURE SENSOR`
  - qa_revision_estado/accion: `ok` / `importar`
  - hierarchie_final/sust_hierarchie: `` / ``
  - status legacy: `OK_GESA`
  - new_pn_final/sust_new_part_number: `` / ``
  - source_page: `338`
- Motivo probable: baseline legacy no congelado con el estado actual de datos para este PN.

### 3) New designation: 016531328

- Tipo diferencia: designation distinta en New.
- Clasificacion: BASELINE_STALE.
- Export legacy:
  - designation_final: `CONTACT FEMALE CONTACT FOR BUSH`
  - source_pages/source_ids: `353, 403, 749, 799, 1145, 1195, 1541, 1591` / `1703230, 1703732, 1706970, 1707472, 1710710, 1711212, 1714452, 1714953`
- Export semantic:
  - designation_final: `3 HOUSING FOR`
  - source_pages/source_ids: `353` / `1703230`
- Fuente engine relevante:
  - fila `ok/importar` (ID 1703230, page 353): designation_final=`3 HOUSING FOR`
  - filas `ok/copia` (IDs 1703732, 1707472, 1711212, 1714953): designation_final=`CONTACT FEMALE CONTACT FOR BUSH`
  - pn_final: `016531328`
  - designation_gesa/excel/pdf: vacio
  - hierarchie_final/sust_hierarchie: vacio/vacio
  - status legacy: `REVISAR`
  - new_pn_final/sust_new_part_number: vacio/vacio
- Motivo probable: legacy mezcla filas `copia` al consolidar designation; semantic prioriza fila `ok/importar`.

### 4) New designation: XP52811

- Tipo diferencia: designation distinta en New.
- Clasificacion: BASELINE_STALE.
- Export legacy:
  - designation_final: `SEALING CORD`
  - source_pages/source_ids: `158, 554, 950` / `1701143, 1701144, 1701145, 1701146, 1704882, 1704883, 1704884, 1704886, 1708622, 1708623, 1708624, 1708625`
- Export semantic:
  - designation_final: `COOLER HOUSING`
  - source_pages/source_ids: `158` / `1701143`
- Fuente engine relevante:
  - fila `ok/importar` (ID 1701143): designation_final=`COOLER HOUSING`
  - filas `ok/copia` (IDs 1701145, 1701146, 1704884, 1704886, 1708624, 1708625): designation_final=`SEALING CORD`
  - pn_final: `XP52811`
  - designation_gesa/excel/pdf: vacio
  - qa_revision_estado/accion: `ok` + mezcla `importar/copia`
  - hierarchie_final/sust_hierarchie: vacio/vacio
  - status legacy: `REVISAR`
  - new_pn_final/sust_new_part_number: vacio/vacio
- Motivo probable: legacy selecciona designacion frecuente de filas `copia`; semantic usa la de la fila `importar`.

### 5) Superseded designation: 5241534940

- Tipo diferencia: designation distinta en Superseded.
- Clasificacion: BASELINE_STALE.
- Export legacy: `BRACKET OFFSET H:38`
- Export semantic: `BRACKET OFFSET H:38 4000`
- Fuente engine relevante:
  - fila `ok/importar` (ID 1803296): designation_final=`BRACKET OFFSET H:38 4000`
  - varias filas `ok/copia` en 16V4000M73L: designation_final=`BRACKET OFFSET H:38`
  - pn_final: `5241534940`
  - designation_gesa/excel: vacio
  - designation_pdf: variantes `...H:38` y `...H:38 4000`
  - qa_revision_estado/accion: `ok` + mezcla `importar/copia`
  - hierarchie_final/sust_hierarchie: vacio/`Superseded`
  - status legacy: `OK_SUST_OLD`
  - new_pn_final/sust_new_part_number: vacio/`X59499100415`
- Motivo probable: consolidacion legacy toma valor de filas `copia` multi-engine; semantic fija la fila `importar`.

### 6) Superseded designation: X00003620

- Tipo diferencia: designation distinta en Superseded.
- Clasificacion: BASELINE_STALE.
- Export legacy: `OIL FILTER ELEMENT`
- Export semantic: `OIL FILTER ELEMENT BR 4000`
- Fuente engine relevante:
  - fila `ok/importar` (ID 1802029): designation_final=`OIL FILTER ELEMENT BR 4000`
  - filas `ok/copia` en 16V4000M73L: designation_final=`OIL FILTER ELEMENT`
  - pn_final: `X00003620`
  - designation_gesa/excel: vacio
  - designation_pdf: coincide con designation_final en cada variante
  - qa_revision_estado/accion: `ok` + mezcla `importar/copia`
  - hierarchie_final/sust_hierarchie: vacio/`Superseded`
  - status legacy: `OK_SUST_OLD`
  - new_pn_final/sust_new_part_number: vacio/`XP52618300032`
- Motivo probable: baseline legacy arrastra designation de filas `copia`.

### 7) Superseded designation: X52404100033

- Tipo diferencia: designation distinta en Superseded.
- Clasificacion: BASELINE_STALE.
- Export legacy: `CYLINDER HEAD W.VALVE + SEAT RING 20`
- Export semantic: `CYLINDER HEAD W.VALVE + SEAT RING`
- Fuente engine relevante:
  - fila `ok/importar` (ID 1800436): designation_final=`CYLINDER HEAD W.VALVE + SEAT RING`
  - fila `ok/copia` (ID 1804007): designation_final=`... SEAT RING 20`
  - pn_final: `X52404100033`
  - designation_gesa/excel: vacio
  - designation_pdf: variantes con/sin sufijo `20`
  - qa_revision_estado/accion: `ok` + mezcla `importar/copia`
  - hierarchie_final/sust_hierarchie: vacio/`Superseded`
  - status legacy: `OK_SUST_OLD`
  - new_pn_final/sust_new_part_number: vacio/`EX52904100372`
- Motivo probable: legacy mezcla filas `copia` y escoge otra variante de texto.

### 8) Superseded designation: X59610100058

- Tipo diferencia: designation distinta en Superseded.
- Clasificacion: BASELINE_STALE.
- Export legacy: `COMPRESSOR HOUSING A/R=1.91CM`
- Export semantic: `COMPRESSOR HOUSING`
- Fuente engine relevante:
  - fila `ok/importar` (ID 1700891): designation_final=`COMPRESSOR HOUSING`
  - multiples filas `ok/copia`: designation_final=`COMPRESSOR HOUSING A/R=1.91CM`
  - pn_final: `X59610100058`
  - designation_gesa/excel: vacio
  - designation_pdf: variantes con/sin sufijo `A/R=1.91CM`
  - qa_revision_estado/accion: `ok` + mezcla `importar/copia`
  - hierarchie_final/sust_hierarchie: vacio/`Superseded`
  - status legacy: `OK_SUST_OLD`
  - new_pn_final/sust_new_part_number: vacio/`XT3510100299`
- Motivo probable: legacy consolida por frecuencia sobre filas `copia`.

### 9) Superseded designation: X59620200103

- Tipo diferencia: designation distinta en Superseded.
- Clasificacion: BASELINE_STALE.
- Export legacy: `COVER PLATE FOR SEAWATER COOLER`
- Export semantic: `COVER PLATE FOR SEAWATER COOLER BR 4000`
- Fuente engine relevante:
  - fila `ok/importar` (ID 1802784): designation_final=`COVER PLATE FOR SEAWATER COOLER BR 4000`
  - filas `ok/copia` en 16V4000M73L: designation_final=`COVER PLATE FOR SEAWATER COOLER`
  - pn_final: `X59620200103`
  - designation_gesa/excel: vacio
  - designation_pdf: variantes con/sin `BR 4000`
  - qa_revision_estado/accion: `ok` + mezcla `importar/copia`
  - hierarchie_final/sust_hierarchie: vacio/`Superseded`
  - status legacy: `OK_SUST_OLD`
  - new_pn_final/sust_new_part_number: vacio/`X59320300048`
- Motivo probable: baseline legacy usa variante de filas `copia`.

## Conclusiones

- No se detectan bugs reales en helper semantico ni en mapeo de export para estos 9 casos.
- El patron es consistente: baseline legacy mezcla filas `ok/copia` en la consolidacion, mientras la salida semantica actual queda alineada con fila(s) `ok/importar`.
- Resultado final: diferencias criticas = 0 en `docs/export_output_compare.md`; diferencias restantes clasificadas como `BASELINE_STALE`.

