from __future__ import annotations

import os
from pathlib import Path
from typing import Iterable, Optional

REPO_MARKERS = (
    "package.json",
    "server.js",
    "qa_milu.html",
)


def _looks_like_repo_dir(path: Path, markers: Iterable[str] = REPO_MARKERS) -> bool:
    if not path.exists() or not path.is_dir():
        return False
    return all((path / marker).exists() for marker in markers)


def _search_repo_from(start: Path) -> Optional[Path]:
    for candidate in (start, *start.parents):
        if _looks_like_repo_dir(candidate):
            return candidate
    return None


def resolve_repo_dir(current_file: Optional[str | Path] = None) -> Path:
    """
    Resolve MILU repo directory with stable precedence:
    1) MILU_REPO_DIR env var (if valid)
    2) Walk up from current_file (or this module) looking for repo markers
    3) Fallback to parent dir of current_file (or this module)
    """
    env_dir = os.getenv("MILU_REPO_DIR", "").strip()
    if env_dir:
        candidate = Path(env_dir).expanduser().resolve()
        if _looks_like_repo_dir(candidate):
            return candidate

    origin = Path(current_file).resolve() if current_file else Path(__file__).resolve()
    origin_dir = origin if origin.is_dir() else origin.parent

    discovered = _search_repo_from(origin_dir)
    if discovered is not None:
        return discovered

    return origin_dir


def should_log_repo_resolution() -> bool:
    return os.getenv("MILU_REPO_DEBUG", "").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
        "debug",
    }
