"""Aplica los campos *_pdf de un book_preview_*.json al engine_*.json correspondiente.

Match principal: (Source Page, POS) en engine <-> (source_page, pos_pdf) en book_preview.
Desempate: pn_pdf == pn_pdf / pn_excel / PART NO. en el engine.
Fallback controlado: si no hay match por (Source Page, POS), intentar (Source Page, PN)
solo cuando haya un unico candidato.

Por defecto dry-run y sin sobrescribir valores no vacios. Usa --write para persistir
y --overwrite para forzar sustitucion de valores no vacios.

Uso:
    python apply_book_preview_to_engine.py \
        --book-preview book_preview_12V4000M40A.json \
        --engine engine_12V4000M40A.json

    python apply_book_preview_to_engine.py \
        --book-preview book_preview_12V4000M40A.json \
        --engine engine_12V4000M40A.json \
        --write

    python apply_book_preview_to_engine.py ... --write --overwrite
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

# Campos *_pdf del book_preview que copiamos al engine (mismos nombres).
PDF_FIELDS = (
    "pos_pdf",
    "pn_pdf",
    "designation_pdf",
    "model_type_pdf",
    "qty_pdf",
    "units_pdf",
    "weight_pdf",
    "fn_pdf",
    "measure_pdf",
    "norma_pdf",
    "bom_pdf",
    "fg_fgs_pdf",
)

OTHER_EMPTY_FIELDS = (
    "pos_pdf",
    "pn_pdf",
    "model_type_pdf",
    "qty_pdf",
    "units_pdf",
    "weight_pdf",
    "fn_pdf",
    "measure_pdf",
    "norma_pdf",
)

# Campos para comprobar si varios candidatos ambiguos son equivalentes y se puede
# aplicar el mismo preview a todos sin decision manual.
DUPLICATE_EQUIVALENCE_FIELDS = (
    "engine_model",
    "Source Page",
    "PART NO.",
    "pn_final",
    "pn_excel",
    "pn_pdf",
    "DESIGNATION",
    "designation_final",
    "designation_pdf",
    "BOM-No.",
    "bom_final",
    "bom_pdf",
    "FG/FGS",
    "fg_fgs_final",
)


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _is_empty(value: Any) -> bool:
    return _norm(value) == ""


def _is_other_row(row: dict) -> bool:
    # Agrupadores/headers del preview pueden traer solo designation_pdf o solo pn_pdf
    # (y a veces fg_fgs/bom), pero siguen sin ser registros importables si el resto
    # de campos clave esta vacio.
    if all(_is_empty(row.get(field)) for field in OTHER_EMPTY_FIELDS):
        return True

    only_pn_pdf_filled = (
        not _is_empty(row.get("pn_pdf"))
        and all(
            _is_empty(row.get(field))
            for field in OTHER_EMPTY_FIELDS
            if field != "pn_pdf"
        )
    )
    return only_pn_pdf_filled


def _build_not_found_row(page_num: int, row: dict, reason: str) -> dict:
    pos = _norm(row.get("pos_pdf"))
    pn = _norm(row.get("pn_pdf"))
    designation = _norm(row.get("designation_pdf"))
    return {
        "page": page_num,
        "row_index": row.get("row_index"),
        "pos": pos,
        "pos_pdf": pos,
        "pn_pdf": pn,
        "designation_pdf": designation,
        "reason": reason,
    }


def _engine_page(row: dict) -> int | None:
    raw = row.get("Source Page")
    if raw is None or raw == "":
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        try:
            return int(str(raw).strip())
        except (TypeError, ValueError):
            return None


def _engine_pos(row: dict) -> str:
    return _norm(row.get("POS") or row.get("pos_pdf") or row.get("pos_final"))


def _engine_pn_candidates(row: dict) -> list[str]:
    out = []
    for key in ("pn_pdf", "PART NO.", "pn_final", "pn_excel"):
        val = _norm(row.get(key))
        if val:
            out.append(val)
    return out


def build_engine_index(engine_rows: list[dict]) -> dict[tuple[int, str], list[int]]:
    """Indexa engine por (page, pos). Una clave puede mapear a varias filas."""
    idx: dict[tuple[int, str], list[int]] = defaultdict(list)
    for i, row in enumerate(engine_rows):
        page = _engine_page(row)
        pos = _engine_pos(row)
        if page is None or not pos:
            continue
        idx[(page, pos)].append(i)
    return idx


def build_engine_page_pn_index(engine_rows: list[dict]) -> dict[tuple[int, str], list[int]]:
    """Indexa engine por (page, pn) para fallback cuando preview no trae POS."""
    idx: dict[tuple[int, str], list[int]] = defaultdict(list)
    for i, row in enumerate(engine_rows):
        page = _engine_page(row)
        if page is None:
            continue
        for pn in set(_engine_pn_candidates(row)):
            idx[(page, pn)].append(i)
    return idx


def select_engine_row(
    idx: dict[tuple[int, str], list[int]],
    engine_rows: list[dict],
    page: int,
    pos: str,
    pn_pdf: str,
) -> tuple[int | None, str]:
    """Devuelve (engine_row_index, status). status in {'unique','tiebreak-pn','ambiguous','not-found'}."""
    candidates = idx.get((page, pos), [])
    if not candidates:
        return None, "not-found"
    if len(candidates) == 1:
        return candidates[0], "unique"
    if pn_pdf:
        with_pn = [
            ci
            for ci in candidates
            if pn_pdf in _engine_pn_candidates(engine_rows[ci])
        ]
        if len(with_pn) == 1:
            return with_pn[0], "tiebreak-pn"
    return None, "ambiguous"


def select_engine_row_without_pos(
    pn_idx: dict[tuple[int, str], list[int]],
    page: int,
    pn_pdf: str,
) -> tuple[int | None, str]:
    """Fallback por (page, pn) cuando el preview no trae POS."""
    if not pn_pdf:
        return None, "not-found"
    candidates = pn_idx.get((page, pn_pdf), [])
    if not candidates:
        return None, "not-found"
    if len(candidates) == 1:
        return candidates[0], "page-pn"
    return None, "ambiguous"


def _duplicate_candidate_signature(row: dict) -> tuple[str, ...]:
    return tuple(_norm(row.get(field)) for field in DUPLICATE_EQUIVALENCE_FIELDS)


def _equivalent_duplicate_candidates(engine_rows: list[dict], candidate_indexes: list[int]) -> tuple[bool, list[str]]:
    if not candidate_indexes:
        return False, []
    signatures = [_duplicate_candidate_signature(engine_rows[i]) for i in candidate_indexes]
    first = signatures[0]
    if all(sig == first for sig in signatures[1:]):
        return True, []

    differing_fields: list[str] = []
    for field_i, field_name in enumerate(DUPLICATE_EQUIVALENCE_FIELDS):
        values = {sig[field_i] for sig in signatures}
        if len(values) > 1:
            differing_fields.append(field_name)
    return False, differing_fields


def _candidate_snapshot(engine_rows: list[dict], candidate_indexes: list[int]) -> list[dict]:
    out: list[dict] = []
    for idx in candidate_indexes[:10]:
        row = engine_rows[idx]
        out.append(
            {
                "engine_index": idx,
                "ID": _norm(row.get("ID")),
                "Source Page": _norm(row.get("Source Page")),
                "POS": _norm(row.get("POS")),
                "PART NO.": _norm(row.get("PART NO.")),
                "pn_final": _norm(row.get("pn_final")),
                "pn_excel": _norm(row.get("pn_excel")),
                "pn_pdf": _norm(row.get("pn_pdf")),
            }
        )
    return out


def _conflict_key(page: int, pos: str, pn_pdf: str) -> str:
    return f"{int(page)}|{_norm(pos)}|{_norm(pn_pdf)}"


def _apply_preview_fields_to_engine_row(
    engine_row: dict,
    preview_row: dict,
    *,
    overwrite: bool,
    only_fields: tuple[str, ...],
    stats: dict,
) -> dict[str, dict]:
    row_changes: dict[str, dict] = {}
    for field in only_fields:
        new_val = preview_row.get(field)
        if _is_empty(new_val):
            continue
        current = engine_row.get(field)
        if not _is_empty(current) and not overwrite:
            if _norm(current) != _norm(new_val):
                stats["fields_skipped_nonempty"] += 1
            continue
        if _norm(current) == _norm(new_val):
            continue
        row_changes[field] = {"from": current, "to": new_val}
        engine_row[field] = new_val
        stats["fields_changed"] += 1
    return row_changes


def apply_preview(
    engine_rows: list[dict],
    preview: dict,
    *,
    overwrite: bool,
    conflict_decisions: dict[str, dict] | None = None,
    only_fields: tuple[str, ...] = PDF_FIELDS,
) -> dict:
    conflict_decisions = conflict_decisions or {}
    idx = build_engine_index(engine_rows)
    pn_idx = build_engine_page_pn_index(engine_rows)

    stats = {
        "preview_pages": 0,
        "preview_rows": 0,
        "matched_unique": 0,
        "matched_tiebreak_pn": 0,
        "matched_page_pn_no_pos": 0,
        "matched_page_pn_pos_mismatch": 0,
        "matched_ambiguous_all_equal": 0,
        "matched_ambiguous_manual": 0,
        "ambiguous": 0,
        "not_found": 0,
        "rows_changed": 0,
        "fields_changed": 0,
        "fields_skipped_nonempty": 0,
    }
    not_found_rows: list[dict] = []
    unmatched_samples: list[dict] = []
    ambiguous_samples: list[dict] = []
    action_required_conflicts: list[dict] = []
    applied_manual_decisions: list[dict] = []
    changes_log: list[dict] = []

    for page_block in preview.get("pages", []) or []:
        if not isinstance(page_block, dict):
            continue
        page_num = page_block.get("source_page")
        if page_num is None:
            continue
        try:
            page_num = int(page_num)
        except (TypeError, ValueError):
            continue
        stats["preview_pages"] += 1
        for row in page_block.get("rows", []) or []:
            if not isinstance(row, dict):
                continue
            stats["preview_rows"] += 1
            if _is_other_row(row):
                stats["not_found"] += 1
                not_found_rows.append(_build_not_found_row(page_num, row, "other"))
                continue
            pos = _norm(row.get("pos_pdf"))
            pn = _norm(row.get("pn_pdf"))
            if not pos:
                engine_i, status = select_engine_row_without_pos(pn_idx, page_num, pn)
                if status == "page-pn":
                    stats["matched_page_pn_no_pos"] += 1
                elif status == "ambiguous":
                    candidate_indexes = pn_idx.get((page_num, pn), []) if pn else []
                    can_apply_to_all, differing_fields = _equivalent_duplicate_candidates(engine_rows, candidate_indexes)

                    if candidate_indexes and can_apply_to_all:
                        stats["matched_ambiguous_all_equal"] += 1
                        for candidate_i in candidate_indexes:
                            engine_row = engine_rows[candidate_i]
                            row_changes = _apply_preview_fields_to_engine_row(
                                engine_row,
                                row,
                                overwrite=overwrite,
                                only_fields=only_fields,
                                stats=stats,
                            )
                            if row_changes:
                                stats["rows_changed"] += 1
                                if len(changes_log) < 200:
                                    changes_log.append(
                                        {
                                            "engine_index": candidate_i,
                                            "page": page_num,
                                            "pos": pos,
                                            "pn_pdf": pn,
                                            "match": "ambiguous-all-equal",
                                            "changes": row_changes,
                                        }
                                    )
                        continue

                    conflict_key = _conflict_key(page_num, pos, pn)
                    decision = conflict_decisions.get(conflict_key) if isinstance(conflict_decisions, dict) else None
                    decision_action = _norm((decision or {}).get("action")).lower()
                    decision_target_id = _norm((decision or {}).get("target_id") or (decision or {}).get("id"))

                    if decision_action in {"apply-id", "apply_id", "apply"} and decision_target_id:
                        chosen_indexes = [
                            ci for ci in candidate_indexes if _norm(engine_rows[ci].get("ID")) == decision_target_id
                        ]
                        if len(chosen_indexes) == 1:
                            chosen_i = chosen_indexes[0]
                            row_changes = _apply_preview_fields_to_engine_row(
                                engine_rows[chosen_i],
                                row,
                                overwrite=overwrite,
                                only_fields=only_fields,
                                stats=stats,
                            )
                            if row_changes:
                                stats["rows_changed"] += 1
                                if len(changes_log) < 200:
                                    changes_log.append(
                                        {
                                            "engine_index": chosen_i,
                                            "page": page_num,
                                            "pos": pos,
                                            "pn_pdf": pn,
                                            "match": "ambiguous-manual-id",
                                            "changes": row_changes,
                                        }
                                    )
                            stats["matched_ambiguous_manual"] += 1
                            if len(applied_manual_decisions) < 50:
                                applied_manual_decisions.append(
                                    {
                                        "page": page_num,
                                        "pos": pos,
                                        "pn_pdf": pn,
                                        "action": "apply-id",
                                        "target_id": decision_target_id,
                                        "engine_index": chosen_i,
                                    }
                                )
                            continue

                    stats["ambiguous"] += 1
                    ambiguous_entry = {
                        "page": page_num,
                        "pos": pos,
                        "pn_pdf": pn,
                        "reason": "missing-pos-page-pn-ambiguous",
                        "differing_fields": differing_fields,
                        "conflict_key": conflict_key,
                    }
                    if len(ambiguous_samples) < 20:
                        ambiguous_samples.append(ambiguous_entry)
                    if candidate_indexes and len(action_required_conflicts) < 20:
                        action_required_conflicts.append(
                            {
                                **ambiguous_entry,
                                "candidates": _candidate_snapshot(engine_rows, candidate_indexes),
                                "suggested_action": "manual-decision-required",
                            }
                        )
                    continue
                else:
                    stats["not_found"] += 1
                    reason = "missing-pos" if not pn else "missing-pos-no-pn-match"
                    not_found_rows.append(_build_not_found_row(page_num, row, reason))
                    continue
            else:
                engine_i, status = select_engine_row(idx, engine_rows, page_num, pos, pn)
                # Fallback de compatibilidad: si no existe (page,pos), intentar (page,pn)
                # y aplicar solo cuando el candidato por PN sea unico.
                if status == "not-found" and pn:
                    pn_engine_i, pn_status = select_engine_row_without_pos(pn_idx, page_num, pn)
                    if pn_status == "page-pn":
                        engine_i = pn_engine_i
                        status = "page-pn-pos-mismatch"
                    elif pn_status == "ambiguous":
                        stats["ambiguous"] += 1
                        if len(ambiguous_samples) < 20:
                            ambiguous_samples.append(
                                {
                                    "page": page_num,
                                    "pos": pos,
                                    "pn_pdf": pn,
                                    "reason": "pos-mismatch-page-pn-ambiguous",
                                }
                            )
                        continue
            if status == "unique":
                stats["matched_unique"] += 1
            elif status == "tiebreak-pn":
                stats["matched_tiebreak_pn"] += 1
            elif status == "page-pn":
                stats["matched_page_pn_no_pos"] += 1
            elif status == "page-pn-pos-mismatch":
                stats["matched_page_pn_pos_mismatch"] += 1
            elif status == "ambiguous":
                candidate_indexes: list[int]
                if pos:
                    candidate_indexes = idx.get((page_num, pos), [])
                else:
                    candidate_indexes = pn_idx.get((page_num, pn), []) if pn else []

                can_apply_to_all, differing_fields = _equivalent_duplicate_candidates(engine_rows, candidate_indexes)
                if not candidate_indexes:
                    stats["ambiguous"] += 1
                    if len(ambiguous_samples) < 20:
                        ambiguous_samples.append(
                            {"page": page_num, "pos": pos, "pn_pdf": pn, "reason": "ambiguous-without-candidates"}
                        )
                    continue

                if can_apply_to_all:
                    stats["matched_ambiguous_all_equal"] += 1
                    for candidate_i in candidate_indexes:
                        engine_row = engine_rows[candidate_i]
                        row_changes = _apply_preview_fields_to_engine_row(
                            engine_row,
                            row,
                            overwrite=overwrite,
                            only_fields=only_fields,
                            stats=stats,
                        )
                        if row_changes:
                            stats["rows_changed"] += 1
                            if len(changes_log) < 200:
                                changes_log.append(
                                    {
                                        "engine_index": candidate_i,
                                        "page": page_num,
                                        "pos": pos,
                                        "pn_pdf": pn,
                                        "match": "ambiguous-all-equal",
                                        "changes": row_changes,
                                    }
                                )
                    continue

                conflict_key = _conflict_key(page_num, pos, pn)
                decision = conflict_decisions.get(conflict_key) if isinstance(conflict_decisions, dict) else None
                decision_action = _norm((decision or {}).get("action")).lower()
                decision_target_id = _norm((decision or {}).get("target_id") or (decision or {}).get("id"))

                if decision_action in {"apply-id", "apply_id", "apply"} and decision_target_id:
                    chosen_indexes = [
                        ci for ci in candidate_indexes if _norm(engine_rows[ci].get("ID")) == decision_target_id
                    ]
                    if len(chosen_indexes) == 1:
                        chosen_i = chosen_indexes[0]
                        row_changes = _apply_preview_fields_to_engine_row(
                            engine_rows[chosen_i],
                            row,
                            overwrite=overwrite,
                            only_fields=only_fields,
                            stats=stats,
                        )
                        if row_changes:
                            stats["rows_changed"] += 1
                            if len(changes_log) < 200:
                                changes_log.append(
                                    {
                                        "engine_index": chosen_i,
                                        "page": page_num,
                                        "pos": pos,
                                        "pn_pdf": pn,
                                        "match": "ambiguous-manual-id",
                                        "changes": row_changes,
                                    }
                                )
                        stats["matched_ambiguous_manual"] += 1
                        if len(applied_manual_decisions) < 50:
                            applied_manual_decisions.append(
                                {
                                    "page": page_num,
                                    "pos": pos,
                                    "pn_pdf": pn,
                                    "action": "apply-id",
                                    "target_id": decision_target_id,
                                    "engine_index": chosen_i,
                                }
                            )
                        continue

                stats["ambiguous"] += 1
                ambiguous_entry = {
                    "page": page_num,
                    "pos": pos,
                    "pn_pdf": pn,
                    "reason": "ambiguous-duplicates-differ",
                    "differing_fields": differing_fields,
                    "conflict_key": conflict_key,
                }
                if len(ambiguous_samples) < 20:
                    ambiguous_samples.append(ambiguous_entry)
                if len(action_required_conflicts) < 20:
                    action_required_conflicts.append(
                        {
                            **ambiguous_entry,
                            "candidates": _candidate_snapshot(engine_rows, candidate_indexes),
                            "suggested_action": "manual-decision-required",
                        }
                    )
                continue
            else:
                stats["not_found"] += 1
                reason = "no-engine-match"
                if pos and pn:
                    reason = "no-pos-match-page-pn-no-match"
                not_found_rows.append(_build_not_found_row(page_num, row, reason))
                if len(unmatched_samples) < 20:
                    unmatched_samples.append(
                        {"page": page_num, "pos": pos, "pn_pdf": pn, "reason": reason}
                    )
                continue

            engine_row = engine_rows[engine_i]
            row_changes = _apply_preview_fields_to_engine_row(
                engine_row,
                row,
                overwrite=overwrite,
                only_fields=only_fields,
                stats=stats,
            )
            if row_changes:
                stats["rows_changed"] += 1
                if len(changes_log) < 200:
                    changes_log.append(
                        {
                            "engine_index": engine_i,
                            "page": page_num,
                            "pos": pos,
                            "pn_pdf": pn,
                            "match": status,
                            "changes": row_changes,
                        }
                    )

    return {
        "stats": stats,
        "not_found_rows": not_found_rows,
        "unmatched_samples": unmatched_samples,
        "ambiguous_samples": ambiguous_samples,
        "action_required_conflicts": action_required_conflicts,
        "applied_manual_decisions": applied_manual_decisions,
        "changes_sample": changes_log,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--book-preview", required=True, help="Ruta del book_preview_*.json")
    parser.add_argument("--engine", required=True, help="Ruta del engine_*.json")
    parser.add_argument("--write", action="store_true", help="Persistir cambios (crea .bak).")
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Sobrescribir valores no vacios del engine.",
    )
    parser.add_argument(
        "--fields",
        nargs="+",
        default=None,
        help="Limita qué campos copiar (defecto: todos los *_pdf).",
    )
    parser.add_argument(
        "--report",
        default=None,
        help="Ruta opcional para guardar el informe JSON del run.",
    )
    parser.add_argument(
        "--conflict-decisions",
        default=None,
        help="Ruta JSON opcional con decisiones manuales por conflicto ambiguo.",
    )

    args = parser.parse_args(argv)

    preview_path = Path(args.book_preview)
    engine_path = Path(args.engine)
    if not preview_path.is_file():
        print(f"[ERROR] No existe book preview: {preview_path}", file=sys.stderr)
        return 2
    if not engine_path.is_file():
        print(f"[ERROR] No existe engine: {engine_path}", file=sys.stderr)
        return 2

    with preview_path.open("r", encoding="utf-8") as f:
        preview = json.load(f)
    with engine_path.open("r", encoding="utf-8") as f:
        engine_rows = json.load(f)
    if not isinstance(engine_rows, list):
        print(f"[ERROR] Engine {engine_path} no es una lista JSON.", file=sys.stderr)
        return 2

    only_fields = tuple(args.fields) if args.fields else PDF_FIELDS

    conflict_decisions: dict[str, dict] = {}
    if args.conflict_decisions:
        decisions_path = Path(args.conflict_decisions)
        if decisions_path.is_file():
            loaded = None
            try:
                with decisions_path.open("r", encoding="utf-8") as f:
                    loaded = json.load(f)
            except json.JSONDecodeError:
                with decisions_path.open("r", encoding="utf-8-sig") as f:
                    loaded = json.load(f)
            if isinstance(loaded, dict):
                conflict_decisions = loaded

    report = apply_preview(
        engine_rows,
        preview,
        overwrite=args.overwrite,
        conflict_decisions=conflict_decisions,
        only_fields=only_fields,
    )
    stats = report["stats"]

    print("=" * 70)
    print(f"Book preview : {preview_path}")
    print(f"Engine       : {engine_path}")
    print(f"Modo         : {'WRITE' if args.write else 'DRY-RUN'} | overwrite={args.overwrite}")
    print(f"Campos       : {', '.join(only_fields)}")
    print("-" * 70)
    print(f"Páginas en preview       : {stats['preview_pages']}")
    print(f"Filas en preview         : {stats['preview_rows']}")
    print(f"Match único              : {stats['matched_unique']}")
    print(f"Match desempate por PN   : {stats['matched_tiebreak_pn']}")
    print(f"Match page+PN sin POS    : {stats['matched_page_pn_no_pos']}")
    print(f"Match page+PN por mismatch POS: {stats['matched_page_pn_pos_mismatch']}")
    print(f"Match ambiguo (todos iguales): {stats['matched_ambiguous_all_equal']}")
    print(f"Match ambiguo (decision manual): {stats['matched_ambiguous_manual']}")
    print(f"Ambiguos (no aplicado)   : {stats['ambiguous']}")
    print(f"No encontrados           : {stats['not_found']}")
    print(f"Filas con cambios        : {stats['rows_changed']}")
    print(f"Campos modificados       : {stats['fields_changed']}")
    print(f"Campos no vacíos saltados: {stats['fields_skipped_nonempty']}")
    if report["unmatched_samples"]:
        print("-" * 70)
        print("Ejemplos sin match (max 20):")
        for s in report["unmatched_samples"]:
            print(f"  page={s['page']} pos={s['pos']!r} pn={s['pn_pdf']!r}")
    if report["ambiguous_samples"]:
        print("-" * 70)
        print("Ejemplos ambiguos (max 20):")
        for s in report["ambiguous_samples"]:
            print(f"  page={s['page']} pos={s['pos']!r} pn={s['pn_pdf']!r}")
    if report["action_required_conflicts"]:
        print("-" * 70)
        print("Conflictos que requieren decision manual (max 20):")
        for s in report["action_required_conflicts"]:
            print(
                f"  page={s['page']} pos={s['pos']!r} pn={s['pn_pdf']!r} "
                f"diferencias={','.join(s.get('differing_fields') or [])}"
            )
    print("=" * 70)

    if args.write and stats["rows_changed"] > 0:
        ts = int(time.time())
        backup = engine_path.with_name(f"{engine_path.name}.bak.{ts}")
        shutil.copyfile(engine_path, backup)
        with engine_path.open("w", encoding="utf-8") as f:
            json.dump(engine_rows, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print(f"[OK] Engine actualizado. Backup: {backup.name}")
    elif args.write:
        print("[INFO] --write indicado pero no hay cambios que escribir.")
    else:
        print("[INFO] DRY-RUN: no se ha escrito nada. Usa --write para persistir.")

    if args.report:
        rp = Path(args.report)
        rp.parent.mkdir(parents=True, exist_ok=True)
        with rp.open("w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"[OK] Informe guardado: {rp}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
