"""
repo_paths.py — adaptador de rutas de repositorio para scripts Python MILU.

AR-3: capa común ligera. Mantiene compatibilidad delegando en python_repo_paths.
"""
from __future__ import annotations

from pathlib import Path

from python_repo_paths import resolve_repo_dir as _resolve_repo_dir
from python_repo_paths import should_log_repo_resolution as _should_log_repo_resolution


def resolve_repo_dir(current_file: str | Path | None = None) -> Path:
    """Wrapper compatible para resolver la raíz del repo MILU."""
    return _resolve_repo_dir(current_file)


def should_log_repo_resolution() -> bool:
    """Wrapper de flag MILU_REPO_DEBUG."""
    return _should_log_repo_resolution()
