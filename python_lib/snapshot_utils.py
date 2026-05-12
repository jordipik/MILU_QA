"""
snapshot_utils.py — helpers ligeros para inspección de snapshots de datos.

AR-3: utilidades Python para interoperar con data/snapshots sin cambiar el pipeline Node.
"""
from __future__ import annotations

from pathlib import Path

from python_lib.json_io import load_json


def snapshots_dir(repo_dir: str | Path) -> Path:
    """Devuelve la ruta canónica de snapshots (data/snapshots)."""
    return Path(repo_dir) / "data" / "snapshots"


def latest_snapshot_name(repo_dir: str | Path) -> str | None:
    """Lee data/snapshots/latest.json y devuelve el nombre del snapshot, si existe."""
    latest_file = snapshots_dir(repo_dir) / "latest.json"
    if not latest_file.exists():
        return None
    data = load_json(latest_file)
    if not isinstance(data, dict):
        return None
    value = data.get("snapshot")
    return str(value) if value else None
