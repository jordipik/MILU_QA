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
import json
import re
import subprocess
import sys
import tempfile
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


def _run_one(preview: Path, engine: Path, *, write: bool, overwrite: bool, report: Path | None = None) -> int:
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
    if report is not None:
        cmd.extend(["--report", str(report)])
    print(f"\n>>> {' '.join(cmd)}", flush=True)
    proc = subprocess.run(cmd, cwd=str(REPO_ROOT))
    return proc.returncode


def _empty_stats() -> dict[str, int]:
    return {
        "preview_pages": 0,
        "preview_rows": 0,
        "matched_unique": 0,
        "matched_tiebreak_pn": 0,
        "ambiguous": 0,
        "not_found": 0,
        "rows_changed": 0,
        "fields_changed": 0,
        "fields_skipped_nonempty": 0,
    }


def _merge_stats(total: dict[str, int], part: dict) -> None:
    for key in total.keys():
        total[key] += int(part.get(key) or 0)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--previews-dir", default="json_originales", help="Carpeta donde buscar book_preview_*.json (default: json_originales)")
    parser.add_argument("--write", action="store_true", help="Aplicar cambios al disco (sin esto es dry-run).")
    parser.add_argument("--overwrite", action="store_true", help="Sobrescribir valores no vacios en los engines.")
    parser.add_argument("--only", nargs="*", help="Lista de modelos a procesar (ej: 12V4000M40A 12V4000M53). Por defecto todos.")
    parser.add_argument("--stop-on-error", action="store_true", help="Detener barrido si un engine falla.")
    parser.add_argument("--report", default=None, help="Ruta opcional para guardar un informe JSON agregado.")
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
    aggregate_stats = _empty_stats()
    aggregate_not_found_rows: list[dict] = []
    per_model: list[dict] = []

    for model, preview, engine in targets:
        if not engine.exists():
            print(f"[SKIP] {model}: no existe {engine}")
            results.append((model, -1, False))
            per_model.append({
                "model": model,
                "engine": engine.name,
                "preview": preview.name,
                "ok": False,
                "exit_code": -1,
                "skipped": True,
                "reason": "engine-missing",
            })
            continue

        with tempfile.NamedTemporaryFile(prefix=f"milu_apply_book_preview_child_{model}_", suffix=".json", delete=False) as tf:
            child_report = Path(tf.name)
        try:
            child_report.unlink()
        except Exception:
            pass

        rc = _run_one(
            preview,
            engine,
            write=args.write,
            overwrite=args.overwrite,
            report=child_report,
        )

        results.append((model, rc, True))

        child_data = None
        if child_report.exists():
            try:
                with child_report.open("r", encoding="utf-8") as f:
                    child_data = json.load(f)
            except Exception as exc:
                print(f"[WARN] No se pudo leer reporte hijo de {model}: {exc}")
            finally:
                try:
                    child_report.unlink()
                except Exception:
                    pass

        if isinstance(child_data, dict):
            child_stats = child_data.get("stats") if isinstance(child_data.get("stats"), dict) else {}
            _merge_stats(aggregate_stats, child_stats)

            child_not_found = child_data.get("not_found_rows") if isinstance(child_data.get("not_found_rows"), list) else []
            for row in child_not_found:
                if not isinstance(row, dict):
                    continue
                row_copy = dict(row)
                row_copy.setdefault("book", model)
                row_copy.setdefault("engine", engine.name)
                aggregate_not_found_rows.append(row_copy)

            per_model.append({
                "model": model,
                "engine": engine.name,
                "preview": preview.name,
                "ok": rc == 0,
                "exit_code": rc,
                "skipped": False,
                "stats": child_stats,
            })
        else:
            per_model.append({
                "model": model,
                "engine": engine.name,
                "preview": preview.name,
                "ok": rc == 0,
                "exit_code": rc,
                "skipped": False,
            })

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

    if args.report:
        report_path = Path(args.report)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "stats": aggregate_stats,
            "not_found_rows": aggregate_not_found_rows,
            "per_model": per_model,
            "summary": {
                "ok": ok,
                "fail": fail,
                "skip": skip,
                "total": len(results),
            },
        }
        with report_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"[OK] Informe agregado guardado: {report_path}")

    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
