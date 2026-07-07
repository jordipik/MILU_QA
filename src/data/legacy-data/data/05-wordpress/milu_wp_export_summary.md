# MILU WordPress Export Summary (QA only)

Generated at: 2026-06-10T11:19:22.998Z
Dry run: no

## Totals
- Engines processed: 9
- Occurrences processed: 69681
- PN unique: 5847
- Importables (total): 8614
- New: 5487
- Superseded: 3127
- Pending review: 0
- Discarded: 1

## Superseded Audit
- Total New reales: 5126
- Total New sinteticos: 451
- Total Superseded reales: 721
- Total Superseded sinteticos desde lista: 2406
- Total Superseded omitidos por existir en JSON: 270
- Total Superseded huerfanos que generan New sintetico: 451
- Duplicados evitados: 90

## Official Rules
- Rule 1: Base QA-only: solo ok/importar entra en export.
- Rule 2: Superseded real por sust_hierarchie/hierarchie_final = Superseded.
- Rule 3: Superseded sintetico desde sust_superseded_list/subst_pnlist_final (sin duplicar PNs reales).
- Rule 4: Superseded real huerfano puede crear New sintetico minimo.
- Rule 5: Dedupe por PN dentro de cada salida, priorizando real y mayor completitud.
