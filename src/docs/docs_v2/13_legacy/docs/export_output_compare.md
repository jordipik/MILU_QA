# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Export Output Compare

## Baselines
- legacy_new: dist\milu_publish\data\output\wordpress\milu_wp_import.json
- semantic_new: data\output\wordpress\milu_wp_import.json
- legacy_superseded: dist\milu_publish\data\output\wordpress\milu_wp_superseded.json
- semantic_superseded: data\output\wordpress\milu_wp_superseded.json
- legacy_synthetic_new: MILU_New_v506.json
- semantic_synthetic_new: qa_synthetic_new.json
- legacy_synthetic_superseded: MILU_Superseded_v506.json
- semantic_synthetic_superseded: qa_synthetic_superseded.json

## WordPress New
- OK equivalentes:
  - PN comparados con trazabilidad: solo legacy=1 solo semantic=1 | esperados=2 | criticos=0
  - Numero de registros equivalente: 4850
  - Clasificacion New/Superseded equivalente: New=4850 Superseded=0
  - designation con trazabilidad: esperadas=2 | criticas=0
  - Campos criticos equivalentes: designation, qa_revision_estado, qa_revision_accion, ruta_foto, ruta_esquemas_pos, tipo
- Diferencias esperadas:
  - PN solo legacy=000931008075 (BASELINE_STALE) - legacy exportaba PN sin fila qa ok/importar en datos actuales
  - PN solo semantic=X00E50208388 (BASELINE_STALE) - semantic exporta PN con fila qa ok/importar en datos actuales
  - designation PN=016531328 (BASELINE_STALE) - semantic alinea designacion con fila qa ok/importar; legacy mezcla filas copia | legacy='CONTACT FEMALE CONTACT FOR BUSH' | semantic='3 HOUSING FOR'
  - designation PN=XP52811 (BASELINE_STALE) - semantic alinea designacion con fila qa ok/importar; legacy mezcla filas copia | legacy='SEALING CORD' | semantic='COOLER HOUSING'
- Diferencias criticas:
  - Ninguna

## WordPress Superseded
- OK equivalentes:
  - PN equivalentes: 636
  - Numero de registros equivalente: 636
  - Clasificacion New/Superseded equivalente: New=636 Superseded=0
  - designation con trazabilidad: esperadas=5 | criticas=0
  - Campos criticos equivalentes: designation, qa_revision_estado, qa_revision_accion, ruta_foto, ruta_esquemas_pos, tipo
- Diferencias esperadas:
  - designation PN=5241534940 (BASELINE_STALE) - semantic alinea designacion con fila qa ok/importar; legacy mezcla filas copia | legacy='BRACKET OFFSET H:38' | semantic='BRACKET OFFSET H:38 4000'
  - designation PN=X00003620 (BASELINE_STALE) - semantic alinea designacion con fila qa ok/importar; legacy mezcla filas copia | legacy='OIL FILTER ELEMENT' | semantic='OIL FILTER ELEMENT BR 4000'
  - designation PN=X52404100033 (BASELINE_STALE) - semantic alinea designacion con fila qa ok/importar; legacy mezcla filas copia | legacy='CYLINDER HEAD W.VALVE + SEAT RING 20' | semantic='CYLINDER HEAD W.VALVE + SEAT RING'
  - designation PN=X59610100058 (BASELINE_STALE) - semantic alinea designacion con fila qa ok/importar; legacy mezcla filas copia | legacy='COMPRESSOR HOUSING A/R=1.91CM' | semantic='COMPRESSOR HOUSING'
  - designation PN=X59620200103 (BASELINE_STALE) - semantic alinea designacion con fila qa ok/importar; legacy mezcla filas copia | legacy='COVER PLATE FOR SEAWATER COOLER' | semantic='COVER PLATE FOR SEAWATER COOLER BR 4000'
- Diferencias criticas:
  - Ninguna

## Synthetic New
- OK equivalentes:
  - Ninguno
- Diferencias esperadas:
  - Synthetic baseline con esquema/origen diferente: solo legacy=0 solo semantic=1248
- Diferencias criticas:
  - Ninguna

## Synthetic Superseded
- OK equivalentes:
  - Ninguno
- Diferencias esperadas:
  - Synthetic baseline con esquema/origen diferente: solo legacy=2307 solo semantic=0
- Diferencias criticas:
  - Ninguna

