"""
clear_esquemas_pos_fields.py

Limpieza masiva de campos heredados de esquemas POS en engine_*.json.

Acciones permitidas:
- Vaciar SOLO estos campos:
  - exp_imagenes
  - esquemas_circulos_all
  - esquemas_circulos
  - ruta_esquemas_pos

No reconstruye ni recalcula nada.

Uso:
  python clear_esquemas_pos_fields.py --engine 12V4000M40A --dry-run
  python clear_esquemas_pos_fields.py --engine 12V4000M40A --write
  python clear_esquemas_pos_fields.py --all --dry-run
  python clear_esquemas_pos_fields.py --all --write
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

from python_lib.engine_constants import ENGINE_FILES
from python_lib.json_io import load_json, save_json


TARGET_FIELDS = (
    "exp_imagenes",
    "esquemas_circulos_all",
    "esquemas_circulos",
    "ruta_esquemas_pos",
)

REPORT_PATH = "clear_esquemas_pos_fields_report.json"


def repo_root() -> Path:
    return Path(__file__).resolve().parent


def normalize_engine_arg(engine_arg: str) -> str:
    raw = str(engine_arg or "").strip()
    if not raw:
        raise ValueError("--engine no puede estar vacio")

    if raw.lower().endswith(".json") and raw.lower().startswith("engine_"):
        return raw

    if raw.lower().startswith("engine_"):
        return f"{raw}.json"

    return f"engine_{raw}.json"


def build_backup_path(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    return path.with_suffix(f".json.bak.{stamp}")


def clear_target_fields(record: dict[str, Any], counters: dict[str, int]) -> bool:
    changed = False
    for field in TARGET_FIELDS:
        if field not in record:
            continue
        value = record.get(field)
        if value == "":
            continue
        record[field] = ""
        counters[field] += 1
        changed = True
    return changed


def process_engine(path: Path, write: bool) -> dict[str, Any]:
    data = load_json(path)
    if not isinstance(data, list):
        raise ValueError(f"{path.name}: se esperaba lista de registros")

    fields_cleared = {field: 0 for field in TARGET_FIELDS}
    records_modified = 0

    for row in data:
        if not isinstance(row, dict):
            continue
        if clear_target_fields(row, fields_cleared):
            records_modified += 1

    report_item = {
        "engine": path.name.removeprefix("engine_").removesuffix(".json"),
        "records_total": len(data),
        "records_modified": records_modified,
        "fields_cleared": fields_cleared,
    }

    if write and records_modified > 0:
        backup_path = build_backup_path(path)
        shutil.copy2(path, backup_path)
        save_json(path, data)
        report_item["backup"] = backup_path.name

    return report_item


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)

    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--engine", help="Modelo (ej: 12V4000M40A) o archivo engine_*.json")
    scope.add_argument("--all", action="store_true", help="Procesa todos los engine_*.json canonicos")

    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="No escribe, solo informa")
    mode.add_argument("--write", action="store_true", help="Escribe cambios y crea backup")

    return parser.parse_args(list(argv) if argv is not None else None)


def resolve_targets(root: Path, args: argparse.Namespace) -> list[Path]:
    if args.all:
        return [root / name for name in ENGINE_FILES]

    filename = normalize_engine_arg(args.engine)
    return [root / filename]


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    root = repo_root()
    write_mode = bool(args.write)
    targets = resolve_targets(root, args)

    results: list[dict[str, Any]] = []
    missing: list[str] = []

    for path in targets:
        if not path.exists():
            missing.append(path.name)
            continue
        item = process_engine(path, write=write_mode)
        results.append(item)

        if args.dry_run:
            print(
                json.dumps(
                    {
                        "engine": item["engine"],
                        "records": item["records_total"],
                        "would_clear": item["records_modified"],
                    },
                    ensure_ascii=False,
                )
            )
        else:
            print(
                json.dumps(
                    {
                        "engine": item["engine"],
                        "records": item["records_total"],
                        "cleared": item["records_modified"],
                        "backup": item.get("backup", ""),
                    },
                    ensure_ascii=False,
                )
            )

    save_json(root / REPORT_PATH, results)

    if missing:
        print(json.dumps({"missing_files": missing}, ensure_ascii=False))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
