"""
logging_utils.py — helpers de logging ligero para scripts Python de MILU.

AR-3: proporciona un prefijo de script consistente en los mensajes de consola.
"""
from __future__ import annotations

import sys


def make_logger(script_name: str):
    """
    Devuelve una función log(msg, *, file=sys.stdout) que imprime con prefijo [script_name].

    Uso:
        log = make_logger("depuracion_json")
        log("Procesando 9 engines...")
        log("Error al leer archivo", file=sys.stderr)
    """
    prefix = f"[{script_name}]"

    def _log(msg: str = "", *, file=sys.stdout) -> None:
        print(f"{prefix} {msg}", file=file)

    return _log
