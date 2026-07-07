"""
schema_validation.py — utilidades para validar engine_*.json contra el esquema formal.

AR-3: wrapper de validación para pipelines Python sin introducir dependencias.
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def validate_engine_schema(repo_dir: str | Path, summary: bool = True) -> subprocess.CompletedProcess:
    """
    Ejecuta scripts/validate-engine-schema.js desde Python.

    Devuelve el CompletedProcess para inspeccionar stdout/stderr/returncode.
    Lanza RuntimeError si el script no existe.
    """
    repo = Path(repo_dir)
    validator = repo / "scripts" / "validate-engine-schema.js"
    if not validator.exists():
        raise RuntimeError(f"No existe validador de esquema: {validator}")

    cmd = ["node", str(validator)]
    if summary:
        cmd.append("--summary")

    return subprocess.run(
        cmd,
        cwd=str(repo),
        check=False,
        capture_output=True,
        text=True,
    )


def assert_engine_schema_valid(repo_dir: str | Path, summary: bool = True) -> None:
    """Valida el esquema y lanza RuntimeError si falla (exit code != 0)."""
    result = validate_engine_schema(repo_dir=repo_dir, summary=summary)
    if result.returncode != 0:
        details = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
        raise RuntimeError(
            "Validación de esquema fallida (validate-engine-schema.js).\n"
            f"Exit code: {result.returncode}\n{details.strip()}"
        )


def get_current_python() -> str:
    """Devuelve el ejecutable Python actual (helper de diagnóstico ligero)."""
    return sys.executable
