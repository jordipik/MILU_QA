"""Aplica en cadena cada book_preview_<MODEL>.json al engine_<MODEL>.json correspondiente.

Recorre la carpeta de previews (por defecto ``json_originales/``) buscando ficheros
``book_preview_*.json`` y, para cada uno, llama a ``apply_book_preview_to_engine.py``
con el engine homonimo en la raiz del repo. Reutiliza la logica oficial del script
unitario (mismo matching, backups y reglas de PDF_FIELDS).

Por defecto dry-run. Usa --write para persistir y --overwrite para sustituir
valores no vacios. Si un engine no existe, se salta con aviso.

Uso:
    python apply_all_book_previews.py
    python apply_all_book_previews.py --write
    python apply_all_book_previews.py --write --overwrite
    python apply_all_book_previews.py --previews-dir json_originales --only 12V4000M40A 12V4000M53
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent
SINGLE_SCRIPT = REPO_ROOT / "apply_book_preview_to_engine.py"
PREVIEW_RE = re.compile(r"^book_preview_(.+)\.json$", re.IGNORECASE)


def _discover(previews_dir: Path, only: list[str] | None) -> list[tuple[str, Path, Path]]:
    out: list[tuple[str, Path, Path]] = []
    only_set = {m.strip() for m in only} if only else None
    for preview in sorted(previews_dir.glob("book_preview_*.json")):
        m = PREVIEW_RE.match(preview.name)
        if not m:
            continue
        model = m.group(1)
        if only_set and model not in only_set:
            continue
        engine = REPO_ROOT / f"engine_{model}.json"
        out.append((model, preview, engine))
    return out


def _run_one(preview: Path, engine: Path, *, write: bool, overwrite: bool) -> int:
    cmd = [
        sys.executable,
        str(SINGLE_SCRIPT),
        "--book-preview", str(preview),
        "--engine", str(engine),
    ]
    if write:
        cmd.append("--write")
    if overwrite:
        cmd.append("--overwrite")
    print(f"\n>>> {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--previews-dir", default="json_originales", help="Carpeta donde buscar book_preview_*.json (default: json_originales)")
    parser.add_argument("--write", action="store_true", help="Aplicar cambios al disco (sin esto es dry-run).")
    parser.add_argument("--overwrite", action="store_true", help="Sobrescribir valores no vacios en los engines.")
    parser.add_argument("--only", nargs="*", help="Lista de modelos a procesar (ej: 12V4000M40A 12V4000M53). Por defecto todos.")
    parser.add_argument("--stop-on-error", action="store_true", help="Detener barrido si un engine falla.")
    args = parser.parse_args()

    if not SINGLE_SCRIPT.exists():
        print(f"[ERROR] No se encuentra el script unitario: {SINGLE_SCRIPT}", file=sys.stderr)
        return 2

    previews_dir = (REPO_ROOT / args.previews_dir).resolve() if not Path(args.previews_dir).is_absolute() else Path(args.previews_dir)
    if not previews_dir.is_dir():
        print(f"[ERROR] No es una carpeta valida: {previews_dir}", file=sys.stderr)
        return 2

    targets = _discover(previews_dir, args.only)
    if not targets:
        print(f"[WARN] No se encontraron book_preview_*.json en {previews_dir} (filtro --only={args.only}).")
        return 0

    print(f"Procesando {len(targets)} libro(s) desde {previews_dir}")
    print(f"  write={args.write}  overwrite={args.overwrite}")
    for model, preview, engine in targets:
        print(f"  - {model}: {preview.name}  ->  {engine.name}  (engine_exists={engine.exists()})")

    results: list[tuple[str, int, bool]] = []
    for model, preview, engine in targets:
        if not engine.exists():
            print(f"[SKIP] {model}: no existe {engine}")
            results.append((model, -1, False))
            continue
        rc = _run_one(preview, engine, write=args.write, overwrite=args.overwrite)
        results.append((model, rc, True))
        if rc != 0 and args.stop_on_error:
            print(f"[STOP] {model} devolvio rc={rc}. Abortando por --stop-on-error.")
            break

    print("\n=== RESUMEN ===")
    ok = sum(1 for _, rc, ran in results if ran and rc == 0)
    fail = sum(1 for _, rc, ran in results if ran and rc != 0)
    skip = sum(1 for _, _, ran in results if not ran)
    for model, rc, ran in results:
        tag = "SKIP" if not ran else ("OK" if rc == 0 else f"FAIL(rc={rc})")
        print(f"  {tag:>10}  {model}")
    print(f"Total: ok={ok}  fail={fail}  skip={skip}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
