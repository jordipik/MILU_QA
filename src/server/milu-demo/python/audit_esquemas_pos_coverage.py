#!/usr/bin/env python3
"""Audita cobertura de esquemas POS (esquemas_circulos) en engine_*.json.

El script es de solo lectura: no modifica datasets de origen.
Genera:
- reports/esquemas_pos_audit.md
- reports/esquemas_pos_audit.json (opcional)
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from python_lib.engine_constants import ENGINE_PATTERN
from python_lib.json_io import load_engine_json, save_json

PAGE_FIELD_CANDIDATES = [
    "source_page",
    "Source Page",
    "sourcePage",
    "page",
    "pagina",
    "source_sheet",
]

BOOK_FIELD_CANDIDATES = [
    "model_type",
    "MODEL/TYPE",
    "engine_model",
    "model",
]


@dataclass
class BucketStats:
    total: int = 0
    with_pos: int = 0
    without_pos: int = 0


@dataclass
class GlobalStats:
    total_records: int = 0
    with_pos: int = 0
    without_pos: int = 0
    recoverable: int = 0
    non_recoverable: int = 0
    unknown_recoverability: int = 0


def is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, tuple, set, dict)):
        return len(value) == 0
    return False


def has_value(value: Any) -> bool:
    return not is_empty(value)


def safe_percent(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator * 100.0) / denominator, 2)


def normalize_label(value: Any, fallback: str) -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def first_present_value(row: dict[str, Any], candidates: list[str]) -> Any:
    for key in candidates:
        if key in row and not is_empty(row.get(key)):
            return row.get(key)
    return None


def book_from_file(path: Path) -> str:
    name = path.name
    if name.startswith("engine_") and name.endswith(".json"):
        return name[len("engine_") : -len(".json")]
    return name


def find_engine_files(repo_root: Path) -> list[Path]:
    return sorted(
        p
        for p in repo_root.glob(ENGINE_PATTERN)
        if p.is_file() and ".bak." not in p.name and ".backup-" not in p.name
    )


def update_bucket(bucket: BucketStats, with_pos: bool) -> None:
    bucket.total += 1
    if with_pos:
        bucket.with_pos += 1
    else:
        bucket.without_pos += 1


def build_markdown(
    generated_at: str,
    engine_files: list[Path],
    global_stats: GlobalStats,
    per_page: dict[str, BucketStats],
    per_book: dict[str, BucketStats],
    top_pages: list[tuple[str, BucketStats]],
    top_books: list[tuple[str, BucketStats]],
) -> str:
    total = global_stats.total_records
    coverage = safe_percent(global_stats.with_pos, total)
    recoverable_pct = safe_percent(global_stats.recoverable, global_stats.without_pos)

    lines: list[str] = []
    lines.append("# Auditoria de Cobertura de Esquemas POS")
    lines.append("")
    lines.append(f"Generado: {generated_at}")
    lines.append(f"Libros auditados: {len(engine_files)}")
    lines.append("")

    lines.append("## Metricas globales")
    lines.append("")
    lines.append(f"- Total registros: {total:,}")
    lines.append(f"- Registros con esquemas_circulos: {global_stats.with_pos:,}")
    lines.append(f"- Registros sin esquemas_circulos: {global_stats.without_pos:,}")
    lines.append(f"- Cobertura: {coverage:.2f}%")
    lines.append("")

    lines.append("## Recuperabilidad")
    lines.append("")
    lines.append(f"- Recuperables (tienen esquemas base): {global_stats.recoverable:,}")
    lines.append(f"- No recuperables (sin esquemas base): {global_stats.non_recoverable:,}")
    if global_stats.unknown_recoverability > 0:
        lines.append(f"- No clasificados: {global_stats.unknown_recoverability:,}")
    lines.append(f"- Porcentaje recuperable sobre pendientes: {recoverable_pct:.2f}%")
    lines.append("")

    lines.append("## Cobertura por pagina")
    lines.append("")
    lines.append("| Pagina | Registros totales | Registros sin esquema_pos | Cobertura % |")
    lines.append("| --- | ---: | ---: | ---: |")
    for page, stats in sorted(
        per_page.items(),
        key=lambda item: (item[1].without_pos, item[1].total),
        reverse=True,
    ):
        cov = safe_percent(stats.with_pos, stats.total)
        lines.append(
            f"| {page} | {stats.total:,} | {stats.without_pos:,} | {cov:.2f}% |"
        )
    lines.append("")

    lines.append("## Cobertura por libro")
    lines.append("")
    lines.append("| Libro | Registros totales | Sin esquema_pos | Cobertura % |")
    lines.append("| --- | ---: | ---: | ---: |")
    for book, stats in sorted(
        per_book.items(),
        key=lambda item: (safe_percent(item[1].with_pos, item[1].total), -item[1].without_pos),
    ):
        cov = safe_percent(stats.with_pos, stats.total)
        lines.append(
            f"| {book} | {stats.total:,} | {stats.without_pos:,} | {cov:.2f}% |"
        )
    lines.append("")

    lines.append("## TOP 50 paginas con mas registros sin esquema_pos")
    lines.append("")
    lines.append("| Pagina | Registros pendientes |")
    lines.append("| --- | ---: |")
    for page, stats in top_pages:
        lines.append(f"| {page} | {stats.without_pos:,} |")
    lines.append("")

    lines.append("## TOP libros con peor cobertura")
    lines.append("")
    lines.append("| Libro | Cobertura % | Pendientes |")
    lines.append("| --- | ---: | ---: |")
    for book, stats in top_books:
        cov = safe_percent(stats.with_pos, stats.total)
        lines.append(f"| {book} | {cov:.2f}% | {stats.without_pos:,} |")

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Audita cobertura de esquemas POS (esquemas_circulos) en engine_*.json"
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parent,
        help="Directorio raiz donde buscar engine_*.json (default: directorio del script)",
    )
    parser.add_argument(
        "--out-md",
        type=Path,
        default=Path("reports/esquemas_pos_audit.md"),
        help="Ruta del reporte Markdown (default: reports/esquemas_pos_audit.md)",
    )
    parser.add_argument(
        "--out-json",
        type=Path,
        default=Path("reports/esquemas_pos_audit.json"),
        help="Ruta del reporte JSON (default: reports/esquemas_pos_audit.json)",
    )
    parser.add_argument(
        "--no-json",
        action="store_true",
        help="No genera salida JSON",
    )
    parser.add_argument(
        "--top-limit",
        type=int,
        default=50,
        help="Limite para rankings TOP (default: 50)",
    )
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    engine_files = find_engine_files(repo_root)
    if not engine_files:
        raise SystemExit("No se encontraron archivos engine_*.json canonicos en el directorio indicado.")

    global_stats = GlobalStats()
    per_page: dict[str, BucketStats] = defaultdict(BucketStats)
    per_book: dict[str, BucketStats] = defaultdict(BucketStats)
    per_model_type: dict[str, BucketStats] = defaultdict(BucketStats)

    for engine_path in engine_files:
        rows = load_engine_json(engine_path)
        book_label = book_from_file(engine_path)

        for row in rows:
            if not isinstance(row, dict):
                continue

            global_stats.total_records += 1

            pos_value = row.get("esquemas_circulos")
            base_scheme_value = row.get("esquemas")

            has_pos = has_value(pos_value)
            has_base_scheme = has_value(base_scheme_value)

            if has_pos:
                global_stats.with_pos += 1
            else:
                global_stats.without_pos += 1
                if has_base_scheme:
                    global_stats.recoverable += 1
                elif not has_base_scheme:
                    global_stats.non_recoverable += 1
                else:
                    global_stats.unknown_recoverability += 1

            page_raw = first_present_value(row, PAGE_FIELD_CANDIDATES)
            page_label = normalize_label(page_raw, "<sin_pagina>")
            update_bucket(per_page[page_label], has_pos)

            model_raw = first_present_value(row, BOOK_FIELD_CANDIDATES)
            model_label = normalize_label(model_raw, "<sin_model_type>")
            update_bucket(per_model_type[model_label], has_pos)

            update_bucket(per_book[book_label], has_pos)

    top_limit = max(args.top_limit, 0)
    top_pages = sorted(
        ((page, stats) for page, stats in per_page.items() if stats.without_pos > 0),
        key=lambda item: (item[1].without_pos, item[1].total),
        reverse=True,
    )[:top_limit]

    top_books = sorted(
        per_book.items(),
        key=lambda item: (safe_percent(item[1].with_pos, item[1].total), -item[1].without_pos),
    )[:top_limit]

    generated_at = datetime.now(timezone.utc).isoformat()
    report_md_path = (repo_root / args.out_md).resolve()
    report_json_path = (repo_root / args.out_json).resolve()

    report_md_path.parent.mkdir(parents=True, exist_ok=True)

    markdown_content = build_markdown(
        generated_at=generated_at,
        engine_files=engine_files,
        global_stats=global_stats,
        per_page=per_page,
        per_book=per_book,
        top_pages=top_pages,
        top_books=top_books,
    )
    report_md_path.write_text(markdown_content, encoding="utf-8")

    payload = {
        "generated_at": generated_at,
        "input": {
            "repo_root": str(repo_root),
            "engine_files": [str(p.relative_to(repo_root)).replace("\\", "/") for p in engine_files],
            "page_field_candidates": PAGE_FIELD_CANDIDATES,
            "book_field_candidates": BOOK_FIELD_CANDIDATES,
        },
        "global": asdict(global_stats)
        | {
            "coverage_pct": safe_percent(global_stats.with_pos, global_stats.total_records),
            "recoverable_pct_over_pending": safe_percent(
                global_stats.recoverable, global_stats.without_pos
            ),
        },
        "by_page": [
            {
                "page": page,
                **asdict(stats),
                "coverage_pct": safe_percent(stats.with_pos, stats.total),
            }
            for page, stats in sorted(
                per_page.items(),
                key=lambda item: (item[1].without_pos, item[1].total),
                reverse=True,
            )
        ],
        "by_book": [
            {
                "book": book,
                **asdict(stats),
                "coverage_pct": safe_percent(stats.with_pos, stats.total),
            }
            for book, stats in sorted(
                per_book.items(),
                key=lambda item: (safe_percent(item[1].with_pos, item[1].total), -item[1].without_pos),
            )
        ],
        "by_model_type_detected": [
            {
                "model_type": model,
                **asdict(stats),
                "coverage_pct": safe_percent(stats.with_pos, stats.total),
            }
            for model, stats in sorted(
                per_model_type.items(),
                key=lambda item: (safe_percent(item[1].with_pos, item[1].total), -item[1].without_pos),
            )
        ],
        "top_problematic_pages": [
            {
                "page": page,
                "pending": stats.without_pos,
                "total": stats.total,
                "coverage_pct": safe_percent(stats.with_pos, stats.total),
            }
            for page, stats in top_pages
        ],
        "top_problematic_books": [
            {
                "book": book,
                "pending": stats.without_pos,
                "total": stats.total,
                "coverage_pct": safe_percent(stats.with_pos, stats.total),
            }
            for book, stats in top_books
        ],
    }

    if not args.no_json:
        report_json_path.parent.mkdir(parents=True, exist_ok=True)
        save_json(report_json_path, payload)

    coverage = payload["global"]["coverage_pct"]
    recoverable_pct = payload["global"]["recoverable_pct_over_pending"]

    top_page_line = "N/A"
    if top_pages:
        top_page_line = f"{top_pages[0][0]} -> {top_pages[0][1].without_pos:,} pendientes"

    top_book_line = "N/A"
    if top_books:
        top_book_cov = safe_percent(top_books[0][1].with_pos, top_books[0][1].total)
        top_book_line = f"{top_books[0][0]} -> {top_book_cov:.2f}% cobertura"

    print("====================================")
    print("AUDITORIA ESQUEMAS POS")
    print("====================================")
    print()
    print(f"Total registros: {global_stats.total_records:,}")
    print()
    print(f"Con esquema_pos: {global_stats.with_pos:,}")
    print(f"Sin esquema_pos: {global_stats.without_pos:,}")
    print()
    print(f"Cobertura: {coverage:.2f}%")
    print()
    print(f"Recuperables: {global_stats.recoverable:,}")
    print(f"No recuperables: {global_stats.non_recoverable:,}")
    print(f"Porcentaje recuperable: {recoverable_pct:.2f}%")
    print()
    print("Top pagina problematica:")
    print(top_page_line)
    print()
    print("Top libro problematico:")
    print(top_book_line)
    print()
    print("Informe generado:")
    print(str(report_md_path.relative_to(repo_root)).replace("\\", "/"))
    if not args.no_json:
        print(str(report_json_path.relative_to(repo_root)).replace("\\", "/"))
    print("====================================")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
