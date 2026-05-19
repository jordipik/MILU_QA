"""
clear_engine_fields.py — Vacia el contenido de campos por sufijo en los 9
archivos engine_*.json del repositorio.

Por defecto vacia los campos *_pdf y *_final (los reescribe a "").
Se pueden pasar otros sufijos con --suffixes.

Uso:
    python clear_engine_fields.py                          # vacia _pdf y _final
    python clear_engine_fields.py --dry-run                # solo informa
    python clear_engine_fields.py --suffixes _pdf          # solo _pdf
    python clear_engine_fields.py --suffixes _pdf _final _gesa
    python clear_engine_fields.py --exclude gesa_pdf nsn_pdf
    python clear_engine_fields.py --files engine_12V4000M53.json
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any, Iterable

from python_lib.engine_constants import ENGINE_FILES
from python_lib.json_io import load_json, save_json


DEFAULT_SUFFIXES = ("_pdf", "_final")


def repo_root() -> Path:
    return Path(__file__).resolve().parent


def clear_fields_in_record(
    record: dict[str, Any],
    suffixes: tuple[str, ...],
    exclude: set[str],
) -> int:
    """Vacia claves que terminan en alguno de ``suffixes``. Devuelve nº de campos tocados."""
    changed = 0
    for key in list(record.keys()):
        if not any(key.endswith(suf) for suf in suffixes):
            continue
        if key in exclude:
            continue
        if record[key] == "":
            continue
        record[key] = ""
        changed += 1
    return changed


def process_file(
    path: Path,
    suffixes: tuple[str, ...],
    exclude: set[str],
    dry_run: bool,
) -> tuple[int, int]:
    data = load_json(path)
    if not isinstance(data, list):
        raise ValueError(f"{path.name}: se esperaba una lista de articulos")

    total_fields = 0
    affected_records = 0
    for record in data:
        if not isinstance(record, dict):
            continue
        n = clear_fields_in_record(record, suffixes, exclude)
        if n:
            affected_records += 1
            total_fields += n

    if not dry_run and total_fields:
        save_json(path, data)

    return affected_records, total_fields


def parse_args(argv: Iterable[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--dry-run", action="store_true", help="No escribe cambios, solo informa.")
    parser.add_argument(
        "--suffixes",
        nargs="+",
        default=list(DEFAULT_SUFFIXES),
        help="Sufijos de campos a vaciar (por defecto: _pdf _final).",
    )
    parser.add_argument(
        "--exclude",
        nargs="*",
        default=[],
        help="Nombres exactos de campos que NO se deben vaciar (ej: gesa_pdf nsn_pdf).",
    )
    parser.add_argument(
        "--files",
        nargs="*",
        default=None,
        help="Archivos engine_*.json a procesar. Por defecto: los 9 canonicos.",
    )
    return parser.parse_args(list(argv) if argv is not None else None)


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(argv)
    root = repo_root()
    suffixes = tuple(args.suffixes)
    exclude = set(args.exclude)
    files = args.files if args.files else ENGINE_FILES

    print(f"Sufijos: {', '.join(suffixes)}")
    if exclude:
        print(f"Excluidos: {', '.join(sorted(exclude))}")
    print()

    grand_records = 0
    grand_fields = 0
    print(f"{'ARCHIVO':<32} {'REGISTROS':>10} {'CAMPOS':>10}")
    for name in files:
        path = root / name
        if not path.exists():
            print(f"  [AVISO] No existe: {name}")
            continue
        records, fields = process_file(path, suffixes, exclude, args.dry_run)
        grand_records += records
        grand_fields += fields
        print(f"{name:<32} {records:>10} {fields:>10}")

    accion = "se vaciarian" if args.dry_run else "vaciados"
    print(f"\nTotal: {grand_fields} campos {accion} en {grand_records} registros.")
    if args.dry_run:
        print("(dry-run, no se ha escrito ningun archivo)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
