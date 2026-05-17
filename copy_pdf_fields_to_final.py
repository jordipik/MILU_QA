from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from python_lib.engine_constants import ENGINE_FILES, NAN_LIKE_TOKENS
from python_lib.json_io import load_json, save_json


EXCLUDED_PDF_FIELDS = {
    "gesa_pdf",
    "nsn_pdf",
    "sust_status_pdf",
    "hierarchi_pdf",
    "sust_new_part_number_pdf",
    "sust_superseded_list_pdf",
    "susu_superseded_list_pdf",
}


def repo_root() -> Path:
    return Path(__file__).resolve().parent


def normalize_value(value: Any) -> str | None:
    if value is None:
        return None

    text = str(value).strip()
    if not text:
        return None

    if text.lower() in NAN_LIKE_TOKENS:
        return None

    return text


def is_copyable_value(value: Any) -> bool:
    return normalize_value(value) is not None


def pdf_to_final_key(pdf_key: str) -> str | None:
    if not pdf_key.endswith("_pdf"):
        return None
    return f"{pdf_key[:-4]}_final"


def copy_pdf_fields(record: dict[str, Any]) -> list[tuple[str, str]]:
    changed_fields: list[tuple[str, str]] = []

    for pdf_key, pdf_value in list(record.items()):
        if not isinstance(pdf_key, str):
            continue
        if not pdf_key.endswith("_pdf"):
            continue
        if pdf_key in EXCLUDED_PDF_FIELDS:
            continue

        final_key = pdf_to_final_key(pdf_key)
        if not final_key:
            continue
        if not is_copyable_value(pdf_value):
            continue

        normalized_pdf_value = normalize_value(pdf_value)
        if record.get(final_key) == normalized_pdf_value:
            continue

        record[final_key] = normalized_pdf_value
        changed_fields.append((pdf_key, final_key))

    return changed_fields


def process_file(file_path: Path, dry_run: bool = False) -> tuple[int, int]:
    data = load_json(file_path)
    records_changed = 0
    field_changes = 0

    if isinstance(data, list):
        for record in data:
            if not isinstance(record, dict):
                continue
            changes = copy_pdf_fields(record)
            if changes:
                records_changed += 1
                field_changes += len(changes)
    elif isinstance(data, dict):
        changes = copy_pdf_fields(data)
        if changes:
            records_changed = 1
            field_changes = len(changes)
    else:
        return 0, 0

    if field_changes and not dry_run:
        save_json(file_path, data)

    return records_changed, field_changes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Copia campos *_pdf a sus *_final en los engine_*.json, con exclusiones explícitas."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simula los cambios sin escribir en disco.",
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="Archivos JSON a procesar. Si se omiten, se usan los 9 engine_*.json.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = repo_root()
    file_names = args.files or ENGINE_FILES

    total_records_changed = 0
    total_field_changes = 0

    for file_name in file_names:
        file_path = root / file_name
        if not file_path.exists():
            print(f"[skip] No existe: {file_path}")
            continue

        records_changed, field_changes = process_file(file_path, dry_run=args.dry_run)
        total_records_changed += records_changed
        total_field_changes += field_changes

        mode_label = "dry-run" if args.dry_run else "update"
        print(
            f"[{mode_label}] {file_path.name}: {records_changed} registros, {field_changes} campos"
        )

    print(
        f"Resumen: {total_records_changed} registros afectados, {total_field_changes} campos {'detectados' if args.dry_run else 'actualizados'}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())