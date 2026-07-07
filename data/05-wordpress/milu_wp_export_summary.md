# MILU WordPress Export Summary (QA only)

Generated at: 2026-07-02T11:34:20.350Z
Dry run: no

## Totals
- Engines processed: 9
- Occurrences processed: 0
- PN unique: 0
- Importables (total): 0
- New: 0
- Superseded: 0
- Pending review: 0
- Discarded: 0

## Superseded Audit
- Total New reales: 0
- Total New sinteticos: 0
- Total Superseded reales: 0
- Total Superseded sinteticos desde lista: 0
- Total Superseded omitidos por existir en JSON: 0
- Total Superseded huerfanos que generan New sintetico: 0
- Duplicados evitados: 0

## Official Rules
- Rule 1: Base QA-only: solo ok/importar entra en export.
- Rule 2: Superseded real por sust_hierarchie/hierarchie_final = Superseded.
- Rule 3: Superseded sintetico desde sust_superseded_list/subst_pnlist_final (sin duplicar PNs reales).
- Rule 4: Superseded real huerfano puede crear New sintetico minimo.
- Rule 5: Dedupe por PN dentro de cada salida, priorizando real y mayor completitud.
