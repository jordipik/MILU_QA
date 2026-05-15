#!/usr/bin/env python3
"""Controlled JSON field refactor/migration for MILU engine files.

This script reads a field registry and produces normalized engine JSON files
without modifying original engine_*.json inputs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REGISTRY = REPO_ROOT / "data" / "field_registry.json"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "normalized"

# These fields must remain available exactly as-is in normalized output.
PROTECTED_FIELDS = {
    "qa_revision_estado",
    "qa_revision_accion",
    "qa_revision_updated_at",
    "ruta_foto",
    "esquemas",
    "esquemas_circulos_all",
    "esquemas_circulos",
    "ruta_esquemas_pos",
    "pn_final",
    "designation_final",
    "qty_final",
    "weight_final",
    "measure_final",
    "norma_final",
}


def normalize_action(value: Any) -> str:
    text = str(value or "").strip().lower()
    # Handle accent/mis-encoding variants from Excel exports.
    text = text.replace("á", "a").replace("à", "a").replace("ä", "a")
    text = text.replace("±", "n")
    mapping = {
        "copiar": "copy",
        "copy": "copy",
        "anadir": "add",
        "añadir": "add",
        "add": "add",
        "eliminar": "delete",
        "delete": "delete",
    }
    return mapping.get(text, text)


def is_empty(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) == 0
    return False


def normalize_field_name(name: str) -> str:
    field = str(name or "").strip()
    if field == "Source Page":
        return "source_page"
    if field == "measurement_error":
        return "measure_error"
    if field.startswith("isgesa_"):
        return field.replace("isgesa_", "is_gesa_", 1)
    return field


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def first_present_value(record: Dict[str, Any], aliases: Iterable[str]) -> Tuple[Any, Optional[str]]:
    for alias in aliases:
        if alias in record:
            return record.get(alias), alias
    return None, None


def build_alias_list(field_rule: Dict[str, Any]) -> List[str]:
    aliases: List[str] = []
    new_name = normalize_field_name(str(field_rule.get("new_name") or "").strip())
    current_name = field_rule.get("current_name")
    if new_name:
        aliases.append(new_name)
    if current_name:
        raw_current = str(current_name).strip()
        aliases.append(raw_current)
        aliases.append(normalize_field_name(raw_current))

    for alias in field_rule.get("legacy_names", []) or []:
        alias_raw = str(alias or "").strip()
        if alias_raw:
            aliases.append(alias_raw)
            aliases.append(normalize_field_name(alias_raw))

    # Required compatibility aliases.
    if new_name == "source_page":
        aliases.extend(["Source Page", "page4"])
    if new_name == "measure_error":
        aliases.extend(["measurement_error"])
    if new_name.startswith("is_gesa_"):
        aliases.append(new_name.replace("is_gesa_", "isgesa_", 1))
    if new_name == "is_gesa_excel":
        aliases.append("gesa")
    if new_name == "ruta_esquemas_pos":
        aliases.append("exp_imagenes")

    # Unique, keep order.
    seen = set()
    unique_aliases: List[str] = []
    for alias in aliases:
        if alias and alias not in seen:
            unique_aliases.append(alias)
            seen.add(alias)
    return unique_aliases


def normalize_record(
    record: Dict[str, Any],
    fields: List[Dict[str, Any]],
    deletes: List[Dict[str, Any]],
    include_legacy: bool,
) -> Dict[str, Any]:
    normalized: Dict[str, Any] = {}
    legacy_block: Dict[str, Any] = {}

    for field_rule in fields:
        new_name = normalize_field_name(str(field_rule.get("new_name") or "").strip())
        if not new_name:
            continue

        action = normalize_action(field_rule.get("action"))
        aliases = build_alias_list(field_rule)

        if action == "delete":
            continue

        if action == "copy":
            value, used_alias = first_present_value(record, aliases)
            if used_alias == "exp_imagenes" and ("ruta_esquemas_pos" in record) and not is_empty(record.get("ruta_esquemas_pos")):
                value = record.get("ruta_esquemas_pos")
            normalized[new_name] = value if used_alias is not None else None
            continue

        # add (or unknown action) => ensure the target exists.
        normalized.setdefault(new_name, None)

    # Keep protected fields exactly as they were if not already present.
    for key in list(record.keys()):
        if key in PROTECTED_FIELDS and key not in normalized:
            normalized[key] = record.get(key)

    # Keep other QA fields untouched.
    for key, value in record.items():
        if key.startswith("qa_") and key not in normalized:
            normalized[key] = value

    if include_legacy:
        for delete_rule in deletes:
            current_name = str(delete_rule.get("current_name") or "").strip()
            if not current_name:
                continue
            if current_name in record and not is_empty(record.get(current_name)):
                legacy_block[current_name] = record.get(current_name)

        # Always preserve these as legacy-derived if present and non-empty.
        for derived_key in ("page4", "pages", "book_set"):
            if derived_key in record and not is_empty(record.get(derived_key)):
                legacy_block.setdefault(derived_key, record.get(derived_key))

    if include_legacy and legacy_block:
        normalized["_legacy"] = legacy_block

    return normalized


def normalize_engine_file(
    input_path: Path,
    output_dir: Path,
    fields: List[Dict[str, Any]],
    deletes: List[Dict[str, Any]],
    dry_run: bool,
    include_legacy: bool,
) -> Tuple[int, Path]:
    payload = load_json(input_path)
    if not isinstance(payload, list):
        raise ValueError(f"Input file is not a JSON array: {input_path}")

    normalized_records = [normalize_record(item, fields, deletes, include_legacy) for item in payload]
    output_name = f"{input_path.stem}.normalized.json"
    output_path = output_dir / output_name

    if not dry_run:
        write_json(output_path, normalized_records)

    if len(normalized_records) != len(payload):
        raise ValueError(
            f"Record count mismatch in {input_path.name}: {len(payload)} -> {len(normalized_records)}"
        )

    return len(normalized_records), output_path


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize engine_*.json fields using field registry")
    parser.add_argument(
        "--input",
        action="append",
        default=[],
        help="Path to an engine JSON file. Can be used multiple times.",
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_OUTPUT_DIR),
        help="Output directory for normalized JSON files.",
    )
    parser.add_argument(
        "--registry",
        default=str(DEFAULT_REGISTRY),
        help="Path to field registry JSON file.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Do not write files")
    parser.add_argument("--include-legacy", action="store_true", help="Include _legacy block")
    parser.add_argument(
        "--all-engines",
        action="store_true",
        help="Process all engine_*.json files in repository root.",
    )
    return parser.parse_args(argv)


def resolve_inputs(repo_root: Path, explicit_inputs: List[str], all_engines: bool) -> List[Path]:
    inputs: List[Path] = []

    for raw_path in explicit_inputs:
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            candidate = (repo_root / candidate).resolve()
        if candidate.exists() and candidate.suffix.lower() == ".json":
            inputs.append(candidate)

    if all_engines:
        engine_files = sorted(repo_root.glob("engine_*.json"))
        inputs.extend(engine_files)

    # Unique and preserve order.
    seen = set()
    unique_inputs: List[Path] = []
    for path in inputs:
        key = str(path)
        if key not in seen:
            unique_inputs.append(path)
            seen.add(key)

    return unique_inputs


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    repo_root = REPO_ROOT

    registry_path = Path(args.registry)
    if not registry_path.is_absolute():
        registry_path = (repo_root / registry_path).resolve()

    registry_payload = load_json(registry_path)
    fields = registry_payload.get("fields", []) if isinstance(registry_payload, dict) else []
    deletes = registry_payload.get("deletes", []) if isinstance(registry_payload, dict) else []

    if not isinstance(fields, list) or not fields:
        print("Registry fields list is missing or empty", file=sys.stderr)
        return 1

    inputs = resolve_inputs(repo_root, args.input, args.all_engines)
    if not inputs:
        print("No input files provided. Use --input or --all-engines", file=sys.stderr)
        return 1

    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = (repo_root / output_dir).resolve()

    total_records = 0
    for input_path in inputs:
        count, out_path = normalize_engine_file(
            input_path=input_path,
            output_dir=output_dir,
            fields=fields,
            deletes=deletes,
            dry_run=args.dry_run,
            include_legacy=args.include_legacy,
        )
        total_records += count
        mode_label = "DRY-RUN" if args.dry_run else "WROTE"
        print(f"[{mode_label}] {input_path.name} -> {out_path} ({count} records)")

    print(
        f"Done. Files={len(inputs)} Records={total_records} "
        f"IncludeLegacy={bool(args.include_legacy)} DryRun={bool(args.dry_run)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
