#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Normaliza coordenadas manuales de override entre DPI y opcionalmente "
            "las guarda en rebuild_schemes_circles_manual_overrides.json"
        )
    )
    parser.add_argument("--x", type=float, required=True, help="X origen en px")
    parser.add_argument("--y", type=float, required=True, help="Y origen en px")
    parser.add_argument("--w", type=float, required=True, help="Ancho origen en px")
    parser.add_argument("--h", type=float, required=True, help="Alto origen en px")
    parser.add_argument("--from-dpi", type=float, required=True, help="DPI de origen")
    parser.add_argument("--to-dpi", type=float, default=200.0, help="DPI destino (default: 200)")
    parser.add_argument(
        "--round-mode",
        choices=["nearest", "floor", "ceil"],
        default="nearest",
        help="Modo de redondeo al pasar de float a int (default: nearest)",
    )

    parser.add_argument(
        "--print-json-only",
        action="store_true",
        help="Solo imprime el bloque JSON con px normalizado",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Guarda/actualiza entrada en overrides JSON",
    )
    parser.add_argument(
        "--overrides-json",
        default="rebuild_schemes_circles_manual_overrides.json",
        help="Ruta del JSON de overrides",
    )
    parser.add_argument("--id", default="", help="ID del registro (requerido con --apply)")
    parser.add_argument("--base", default="", help="Nombre base de esquema (requerido con --apply)")
    parser.add_argument("--pos", default="", help="POS objetivo (requerido con --apply)")
    return parser.parse_args()


def _quantize(value: float, mode: str) -> int:
    if mode == "floor":
        return int(math.floor(value))
    if mode == "ceil":
        return int(math.ceil(value))
    return int(round(value))


def normalize_px(
    x: float,
    y: float,
    w: float,
    h: float,
    from_dpi: float,
    to_dpi: float,
    round_mode: str,
) -> List[int]:
    if from_dpi <= 0 or to_dpi <= 0:
        raise ValueError("from_dpi y to_dpi deben ser > 0")
    ratio = to_dpi / from_dpi
    return [
        _quantize(x * ratio, round_mode),
        _quantize(y * ratio, round_mode),
        _quantize(w * ratio, round_mode),
        _quantize(h * ratio, round_mode),
    ]


def load_entries(path: Path) -> Tuple[List[Dict[str, Any]], str]:
    if not path.exists():
        return [], "list"

    raw = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)], "list"
    if isinstance(raw, dict) and isinstance(raw.get("overrides"), list):
        entries = [item for item in raw.get("overrides", []) if isinstance(item, dict)]
        return entries, "object"
    raise ValueError(f"Formato no soportado en {path}")


def upsert_entry(entries: List[Dict[str, Any]], record_id: str, base: str, pos: str, px: List[int]) -> bool:
    for entry in entries:
        if (
            str(entry.get("id") or "").strip() == record_id
            and str(entry.get("base") or "").strip() == base
            and str(entry.get("pos") or "").strip() == pos
        ):
            entry["item"] = {"px": px}
            return False

    entries.append(
        {
            "id": record_id,
            "base": base,
            "pos": pos,
            "item": {"px": px},
        }
    )
    return True


def save_entries(path: Path, entries: List[Dict[str, Any]], mode: str) -> None:
    if mode == "object":
        payload: Any = {"overrides": entries}
    else:
        payload = entries
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=4) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    px = normalize_px(args.x, args.y, args.w, args.h, args.from_dpi, args.to_dpi, args.round_mode)

    if args.print_json_only and not args.apply:
        print(json.dumps({"item": {"px": px}}, ensure_ascii=True, indent=4))
        return 0

    if not args.apply:
        print(f"px_normalized={px}")
        return 0

    record_id = str(args.id or "").strip()
    base = str(args.base or "").strip()
    pos = str(args.pos or "").strip()
    if not record_id or not base or not pos:
        raise ValueError("Con --apply debes indicar --id, --base y --pos")

    path = Path(args.overrides_json)
    entries, mode = load_entries(path)
    created = upsert_entry(entries, record_id, base, pos, px)
    save_entries(path, entries, mode)

    print(f"px_normalized={px}")
    print(f"overrides_json={path}")
    print("entry_created=" + ("true" if created else "false"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
