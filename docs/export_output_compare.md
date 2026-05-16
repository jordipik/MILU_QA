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
  - Numero de registros equivalente: 4850
  - Clasificacion New/Superseded equivalente: New=4850 Superseded=0
- Diferencias esperadas:
  - Ninguna
- Diferencias criticas:
  - PN distintos | solo legacy=1 | solo semantic=1
  - designation con diferencias en 2 PN

## WordPress Superseded
- OK equivalentes:
  - PN equivalentes: 636
  - Numero de registros equivalente: 636
  - Clasificacion New/Superseded equivalente: New=636 Superseded=0
- Diferencias esperadas:
  - Ninguna
- Diferencias criticas:
  - designation con diferencias en 5 PN

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
