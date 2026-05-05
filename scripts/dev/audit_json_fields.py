#!/usr/bin/env python3
"""
MILU JSON field auditor.

Purpose:
- Read relevant MILU JSON datasets (runtime, derived, legacy, export)
- Build per-file field inventory (type, presence, empties, examples)
- Detect probable duplicate fields
- Detect mixed-type fields
- Export markdown and CSV reports into docs/

This script is analysis-only. It does not modify source JSON files.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

DEFAULT_FILES = [
    "engine_12V4000M40A.json",
    "engine_12V4000M53.json",
    "engine_12V4000M70.json",
    "engine_16V4000M61.json",
    "engine_16V4000M73.json",
    "engine_16V4000M73L.json",
    "engine_16V4000M90.json",
    "engine_20V4000M93.json",
    "engine_20V4000M93L.json",
    "MILU_New_v506.json",
    "MILU_Superseded_v506.json",
    "qa_synthetic_new.json",
    "qa_synthetic_superseded.json",
    "data/output/wordpress/milu_wp_import.json",
    "data/output/wordpress/milu_wp_superseded.json",
    "data/output/wordpress/milu_wp_pending_review.json",
    "data/output/wordpress/milu_wp_discarded.json",
    "zz_old/qa_index.json",
    "zz_old/df_116_bom.json",
]

FOCUS_FIELDS = [
    "PART NO.",
    "part_no",
    "pn",
    "pn_raw",
    "pn_clean",
    "pn_final",
    "esquemas",
    "esquemas_circulos",
    "ruta_esquemas_pos",
    "ruta_foto",
    "img_urls",
    "schema_urls",
    "revision_estado",
    "revision_accion",
    "qa_revision_estado",
    "qa_revision_accion",
    "import_action",
    "import_status",
    "gesa",
    "designation_gesa",
    "dimensions_gesa",
    "weight_gesa",
    "normalizado",
    "norma",
    "sust_status",
    "sust_hierarchie",
    "sust_new_part_number",
    "sust_superseded_list",
]

LEGACY_NAME_HINTS = {
    "qa_errors",
    "qa_errors_active",
    "wheight_final",
    "revision_estado",
    "revision_accion",
    "import_action",
    "import_status",
    "img_urls",
    "schema_urls",
    "sust_hierarchie",
}

DOMAIN_HINTS = {
    "qa": ["qa_", "_error", "has_error", "revision"],
    "import": ["import", "decision", "pending", "discard"],
    "media": ["foto", "img", "schema", "esquema", "imagen", "url"],
    "gesa": ["gesa", "normalizado", "norma"],
    "sust": ["sust", "superseded", "new_part", "hierarch"],
    "wordpress": ["wp_", "wordpress", "product"],
}


@dataclass
class FieldMetrics:
    name: str
    present_count: int = 0
    empty_count: int = 0
    type_counts: Counter = field(default_factory=Counter)
    examples: List[str] = field(default_factory=list)


@dataclass
class FileAudit:
    file: str
    total_rows: int
    fields: Dict[str, FieldMetrics]
    missing: bool = False
    parse_error: Optional[str] = None


def detect_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, list):
        return len(value) == 0
    if isinstance(value, dict):
        return len(value) == 0
    return False


def sample_value(value: Any, max_len: int = 140) -> str:
    if isinstance(value, str):
        out = value
    else:
        out = json.dumps(value, ensure_ascii=True, separators=(",", ":"))
    out = out.replace("\n", " ").strip()
    return out[:max_len]


def rows_from_json_payload(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("data"), list):
        return [row for row in payload["data"] if isinstance(row, dict)]
    return []


def audit_file(path: Path, repo_root: Path) -> FileAudit:
    rel = str(path.relative_to(repo_root)).replace("\\", "/")
    if not path.exists():
        return FileAudit(file=rel, total_rows=0, fields={}, missing=True)

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return FileAudit(file=rel, total_rows=0, fields={}, parse_error=str(exc))

    rows = rows_from_json_payload(payload)
    metrics: Dict[str, FieldMetrics] = {}

    for row in rows:
        for key, value in row.items():
            item = metrics.get(key)
            if item is None:
                item = FieldMetrics(name=key)
                metrics[key] = item

            item.present_count += 1
            item.type_counts[detect_type(value)] += 1
            if is_empty(value):
                item.empty_count += 1

            sampled = sample_value(value)
            if sampled and sampled not in item.examples and len(item.examples) < 4:
                item.examples.append(sampled)

    return FileAudit(file=rel, total_rows=len(rows), fields=metrics)


def norm_key(field_name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", field_name.lower())


def detect_duplicate_name_groups(audits: Sequence[FileAudit]) -> List[Tuple[str, List[str]]]:
    grouped: Dict[str, set] = defaultdict(set)
    for audit in audits:
        for field_name in audit.fields.keys():
            grouped[norm_key(field_name)].add(field_name)

    out = []
    for key, names in grouped.items():
        if len(names) > 1:
            out.append((key, sorted(names)))
    out.sort(key=lambda x: x[0])
    return out


def probable_legacy(field_name: str) -> bool:
    if field_name in LEGACY_NAME_HINTS:
        return True
    lower = field_name.lower()
    if lower.endswith("_pdf"):
        return True
    if "legacy" in lower:
        return True
    return False


def infer_domains(field_name: str) -> List[str]:
    lower = field_name.lower()
    tags = []
    for domain, hints in DOMAIN_HINTS.items():
        if any(hint in lower for hint in hints):
            tags.append(domain)
    return tags


def detect_probable_duplicates_for_field(field_name: str, all_field_names: Iterable[str]) -> List[str]:
    base = norm_key(field_name)
    related = []
    for other in all_field_names:
        if other == field_name:
            continue
        if norm_key(other) == base:
            related.append(other)
    return sorted(set(related))


def to_percent(present_count: int, total_rows: int) -> float:
    if total_rows <= 0:
        return 0.0
    return round((present_count * 100.0) / total_rows, 2)


def write_csv_report(audits: Sequence[FileAudit], out_csv: Path) -> None:
    all_fields = sorted({k for audit in audits for k in audit.fields.keys()})

    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "file",
                "total_rows",
                "field_name",
                "type_detected",
                "pct_present",
                "present_count",
                "empty_count",
                "examples",
                "duplicate_candidates",
                "legacy_candidate",
                "domains",
            ]
        )

        for audit in sorted(audits, key=lambda a: a.file):
            if audit.missing:
                writer.writerow([audit.file, 0, "<missing>", "", 0, 0, 0, "", "", "", ""])
                continue
            if audit.parse_error:
                writer.writerow([audit.file, 0, "<parse_error>", "", 0, 0, 0, audit.parse_error, "", "", ""])
                continue

            for field_name, metric in sorted(audit.fields.items(), key=lambda it: it[0].lower()):
                type_detected = "|".join(sorted(metric.type_counts.keys()))
                duplicates = "|".join(detect_probable_duplicates_for_field(field_name, all_fields))
                legacy = "yes" if probable_legacy(field_name) else "no"
                domains = "|".join(infer_domains(field_name))
                examples = " ; ".join(metric.examples)

                writer.writerow(
                    [
                        audit.file,
                        audit.total_rows,
                        field_name,
                        type_detected,
                        to_percent(metric.present_count, audit.total_rows),
                        metric.present_count,
                        metric.empty_count,
                        examples,
                        duplicates,
                        legacy,
                        domains,
                    ]
                )


def write_markdown_report(audits: Sequence[FileAudit], out_md: Path) -> None:
    generated = datetime.now(timezone.utc).isoformat()
    duplicate_groups = detect_duplicate_name_groups(audits)

    lines: List[str] = []
    lines.append("# MILU JSON Field Audit Report")
    lines.append("")
    lines.append(f"Generated: {generated}")
    lines.append("")

    lines.append("## Files audited")
    lines.append("")
    for audit in sorted(audits, key=lambda a: a.file):
        if audit.missing:
            lines.append(f"- {audit.file}: missing")
        elif audit.parse_error:
            lines.append(f"- {audit.file}: parse_error ({audit.parse_error})")
        else:
            lines.append(
                f"- {audit.file}: rows={audit.total_rows}, fields={len(audit.fields)}"
            )
    lines.append("")

    lines.append("## Focus fields")
    lines.append("")
    for audit in sorted(audits, key=lambda a: a.file):
        if audit.missing or audit.parse_error:
            continue
        focus_present = [name for name in FOCUS_FIELDS if name in audit.fields]
        if not focus_present:
            continue

        lines.append(f"### {audit.file}")
        for field_name in focus_present:
            metric = audit.fields[field_name]
            types = "|".join(sorted(metric.type_counts.keys()))
            lines.append(
                "- "
                + f"{field_name}: pct={to_percent(metric.present_count, audit.total_rows)} "
                + f"empty={metric.empty_count}/{audit.total_rows} types={types}"
            )
        lines.append("")

    lines.append("## Potential duplicate field groups (name-based)")
    lines.append("")
    if not duplicate_groups:
        lines.append("- None")
    else:
        for normed, names in duplicate_groups:
            lines.append(f"- {normed}: {', '.join(names)}")
    lines.append("")

    lines.append("## Mixed-type fields")
    lines.append("")
    for audit in sorted(audits, key=lambda a: a.file):
        if audit.missing or audit.parse_error:
            continue
        mixed = [
            (name, metric)
            for name, metric in audit.fields.items()
            if len(metric.type_counts.keys()) > 1
        ]
        if not mixed:
            continue
        lines.append(f"### {audit.file}")
        for name, metric in sorted(mixed, key=lambda it: it[0].lower()):
            types = "|".join(sorted(metric.type_counts.keys()))
            lines.append(f"- {name}: {types}")
        lines.append("")

    out_md.write_text("\n".join(lines), encoding="utf-8")


def resolve_file_list(repo_root: Path, files: Sequence[str], include_glob: Optional[str]) -> List[Path]:
    found: List[Path] = []

    for rel in files:
        found.append((repo_root / rel).resolve())

    if include_glob:
        for path in repo_root.glob(include_glob):
            if path.suffix.lower() != ".json":
                continue
            resolved = path.resolve()
            if resolved not in found:
                found.append(resolved)

    return found


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit MILU JSON fields and export reports.")
    parser.add_argument(
        "--repo-root",
        default=".",
        help="Repository root path (default: current directory)",
    )
    parser.add_argument(
        "--out-md",
        default="docs/MILU_JSON_FIELD_AUDIT_REPORT.md",
        help="Output markdown path (default: docs/MILU_JSON_FIELD_AUDIT_REPORT.md)",
    )
    parser.add_argument(
        "--out-csv",
        default="docs/MILU_JSON_FIELD_AUDIT_REPORT.csv",
        help="Output CSV path (default: docs/MILU_JSON_FIELD_AUDIT_REPORT.csv)",
    )
    parser.add_argument(
        "--include-glob",
        default=None,
        help="Optional extra glob of JSON files relative to repo root (example: 'data/output/**/*.json')",
    )
    parser.add_argument(
        "--file",
        action="append",
        default=[],
        help="Additional file path(s) relative to repo root. Can be repeated.",
    )
    parser.add_argument(
        "--only-files",
        action="store_true",
        help="Use only --file entries (ignore default file set).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()

    if args.only_files:
        base_files = list(args.file)
    else:
        base_files = list(DEFAULT_FILES) + list(args.file)

    targets = resolve_file_list(repo_root, base_files, args.include_glob)

    audits = [audit_file(path, repo_root) for path in targets]

    out_md = (repo_root / args.out_md).resolve()
    out_csv = (repo_root / args.out_csv).resolve()
    out_md.parent.mkdir(parents=True, exist_ok=True)
    out_csv.parent.mkdir(parents=True, exist_ok=True)

    write_markdown_report(audits, out_md)
    write_csv_report(audits, out_csv)

    print(f"OK markdown: {out_md}")
    print(f"OK csv: {out_csv}")
    print(f"Files audited: {len(audits)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
