# MILU WordPress Export Summary (QA only)

Generated at: 2026-06-06T10:04:47.975Z
Dry run: no

## Totals
- Engines processed: 9
- Occurrences processed: 69681
- PN unique: 5860
- Importables (total): 8630
- New: 5500
- Superseded: 3130
- Pending review: 0
- Discarded: 0

## Superseded Audit
- Total New reales: 5139
- Total New sinteticos: 451
- Total Superseded reales: 721
- Total Superseded sinteticos desde lista: 2409
- Total Superseded omitidos por existir en JSON: 267
- Total Superseded huerfanos que generan New sintetico: 451
- Duplicados evitados: 90

## Official Rules
- Rule 1: Base QA-only: solo ok/importar entra en export.
- Rule 2: Superseded real por sust_hierarchie/hierarchie_final = Superseded.
- Rule 3: Superseded sintetico desde sust_superseded_list/subst_pnlist_final (sin duplicar PNs reales).
- Rule 4: Superseded real huerfano puede crear New sintetico minimo.
- Rule 5: Dedupe por PN dentro de cada salida, priorizando real y mayor completitud.
