from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from python_lib.engine_constants import ENGINE_FILES, NAN_LIKE_TOKENS
from python_lib.json_io import load_json, save_json


TARGET_FIELDS = {
    "nsn": "nsn_final",
    "normalizado": "normalizado_final",
    "norma": "norma_final",
    "designation_gesa": "designation_final",
    "dimensions_gesa": "measure_final",
    "weight_gesa": "weight_final",
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

    return " ".join(text.split())


def is_gesa_yes(record: dict[str, Any]) -> bool:
    return str(record.get("gesa") or "").strip().upper() == "SI"


def copy_gesa_values(record: dict[str, Any]) -> list[tuple[str, str]]:
    if not is_gesa_yes(record):
        return []

    changed_fields: list[tuple[str, str]] = []

    for source_key, final_key in TARGET_FIELDS.items():
        source_value = normalize_value(record.get(source_key))
        if not source_value:
            continue

        if normalize_value(record.get(final_key)) == source_value:
            continue

        record[final_key] = source_value
        changed_fields.append((source_key, final_key))

    return changed_fields


def process_file(file_path: Path, dry_run: bool = False) -> tuple[int, int]:
    data = load_json(file_path)
    records_changed = 0
    field_changes = 0

    if isinstance(data, list):
        for record in data:
            if not isinstance(record, dict):
                continue
            changes = copy_gesa_values(record)
            if changes:
                records_changed += 1
                field_changes += len(changes)
    elif isinstance(data, dict):
        changes = copy_gesa_values(data)
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
        description="Copia nsn, normalizado y norma a sus campos *_final cuando gesa = SI."
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
        print(f"[{mode_label}] {file_path.name}: {records_changed} registros, {field_changes} campos")

    summary_label = "detectados" if args.dry_run else "actualizados"
    print(
        f"Resumen: {total_records_changed} registros afectados, {total_field_changes} campos {summary_label}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())