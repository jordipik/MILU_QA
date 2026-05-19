"""Aplica los campos *_pdf de un book_preview_*.json al engine_*.json correspondiente.

Match: (Source Page, POS) en engine <-> (source_page, pos_pdf) en book_preview.
Desempate: pn_pdf == pn_pdf / pn_excel / PART NO. en el engine.

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


def _norm(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _is_empty(value: Any) -> bool:
    return _norm(value) == ""


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


def apply_preview(
    engine_rows: list[dict],
    preview: dict,
    *,
    overwrite: bool,
    only_fields: tuple[str, ...] = PDF_FIELDS,
) -> dict:
    idx = build_engine_index(engine_rows)

    stats = {
        "preview_pages": 0,
        "preview_rows": 0,
        "matched_unique": 0,
        "matched_tiebreak_pn": 0,
        "ambiguous": 0,
        "not_found": 0,
        "rows_changed": 0,
        "fields_changed": 0,
        "fields_skipped_nonempty": 0,
    }
    unmatched_samples: list[dict] = []
    ambiguous_samples: list[dict] = []
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
            pos = _norm(row.get("pos_pdf"))
            pn = _norm(row.get("pn_pdf"))
            if not pos:
                stats["not_found"] += 1
                continue
            engine_i, status = select_engine_row(idx, engine_rows, page_num, pos, pn)
            if status == "unique":
                stats["matched_unique"] += 1
            elif status == "tiebreak-pn":
                stats["matched_tiebreak_pn"] += 1
            elif status == "ambiguous":
                stats["ambiguous"] += 1
                if len(ambiguous_samples) < 20:
                    ambiguous_samples.append(
                        {"page": page_num, "pos": pos, "pn_pdf": pn}
                    )
                continue
            else:
                stats["not_found"] += 1
                if len(unmatched_samples) < 20:
                    unmatched_samples.append(
                        {"page": page_num, "pos": pos, "pn_pdf": pn}
                    )
                continue

            engine_row = engine_rows[engine_i]
            row_changes: dict[str, dict] = {}
            for field in only_fields:
                new_val = row.get(field)
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
        "unmatched_samples": unmatched_samples,
        "ambiguous_samples": ambiguous_samples,
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

    report = apply_preview(engine_rows, preview, overwrite=args.overwrite, only_fields=only_fields)
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
