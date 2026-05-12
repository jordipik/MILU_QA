"""
json_io.py — helpers de carga y escritura de JSON para scripts Python de MILU.

AR-3: centraliza el patrón repetido open/json.load + json.dump(ensure_ascii=False, indent=2).
"""
from __future__ import annotations

import json
from pathlib import Path


# ---------------------------------------------------------------------------
# Carga
# ---------------------------------------------------------------------------

def load_json(path: str | Path) -> object:
    """Carga un archivo JSON con encoding utf-8-sig (tolera BOM)."""
    with open(path, "r", encoding="utf-8-sig") as fh:
        return json.load(fh)


def load_engine_json(path: str | Path) -> list[dict]:
    """Carga un engine_*.json y verifica que sea una lista."""
    data = load_json(path)
    if not isinstance(data, list):
        raise ValueError(f"{path}: se esperaba lista, se obtuvo {type(data).__name__}")
    return data


def load_unique_keys_from_json(filepath: str | Path, key: str) -> tuple[int, set]:
    """
    Carga un JSON y devuelve (total_registros, conjunto_de_valores_únicos_del_campo_key).

    Acepta archivos con estructura:
      - list[dict]  (engine_*.json, product-export-*.json, etc.)
      - dict con una lista de dicts como primer valor
    """
    data = load_json(filepath)
    if isinstance(data, list):
        return len(data), {item.get(key) for item in data if key in item}
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                return len(v), {item.get(key) for item in v if key in item}
    return 0, set()


# ---------------------------------------------------------------------------
# Escritura
# ---------------------------------------------------------------------------

def save_json(path: str | Path, data: object) -> None:
    """Escribe data en path con formato MILU estándar (utf-8, indent=2, no ascii-escape)."""
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)


def save_engine_json(path: str | Path, data: list[dict]) -> None:
    """Guarda un engine_*.json (shorthand con validación de tipo)."""
    if not isinstance(data, list):
        raise TypeError(f"save_engine_json: se esperaba lista, se obtuvo {type(data).__name__}")
    save_json(path, data)
