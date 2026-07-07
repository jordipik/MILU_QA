import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

from python_lib.repo_paths import resolve_repo_dir
from python_lib.engine_constants import ENGINE_FILES
from python_lib.json_io import load_json, save_json

PDF_KEYS = [
    "pos_pdf",
    "pn_pdf",
    "designation_pdf",
    "model_type_pdf",
    "qty_pdf",
    "units_pdf",
    "weight_pdf",
    "fn_pdf",
    "measure_pdf",
    "fg_fgs_pdf",
    "gesa_pdf",
    "nsn_pdf",
    "normalizado_pdf",
    "norma_pdf",
    "sust_status_pdf",
    "hierarchi_pdf",
    "sust_new_part_number_pdf",
    "sust_superseded_list_pdf",
    "bom_pdf",
]


def run_command(cmd, cwd, label):
    print(f"\n>>> {label}")
    print("$ " + " ".join(cmd))
    result = subprocess.run(cmd, cwd=str(cwd), check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Fallo en {label} (exit code {result.returncode})")


def qa_filename_for_engine(engine_filename):
    model_name = engine_filename.replace("engine_", "", 1)
    return f"qa_{model_name}"


def reimport_from_qa(base_dir):
    """
    Reemplaza completamente cada engine_*.json con su qa_*.json correspondiente.
    """
    print("\n>>> Reimportando engines desde json_originales/qa_*.json")
    qa_dir = base_dir / "json_originales"

    files_reimported = 0
    total_rows = 0

    for engine_filename in ENGINE_FILES:
        engine_path = base_dir / engine_filename
        qa_filename = qa_filename_for_engine(engine_filename)
        qa_path = qa_dir / qa_filename

        if not qa_path.exists():
            raise RuntimeError(f"No existe QA de origen para {engine_filename}: {qa_path}")

        qa_data = load_json(qa_path)

        if not isinstance(qa_data, list):
            raise RuntimeError(f"El QA origen no es un array para {engine_filename}: {qa_path}")

        save_json(engine_path, qa_data)

        files_reimported += 1
        total_rows += len(qa_data)
        print(f"- {engine_filename}: {len(qa_data)} filas importadas desde {qa_filename}")

    print(f"Reimport completado. Archivos: {files_reimported}, filas: {total_rows}")


def reset_pdf_fields(base_dir):
    print("\n>>> Reseteando campos *_pdf")
    files_updated = 0
    rows_updated = 0

    for filename in ENGINE_FILES:
        file_path = base_dir / filename
        if not file_path.exists():
            print(f"- Omitido (no existe): {filename}")
            continue

        data = load_json(file_path)

        if not isinstance(data, list):
            print(f"- Omitido (no es array): {filename}")
            continue

        changed_in_file = 0
        for row in data:
            if not isinstance(row, dict):
                continue

            row_changed = False
            for key in PDF_KEYS:
                current_value = row.get(key, "")
                if str(current_value or "") != "":
                    row_changed = True
                row[key] = ""

            if row_changed:
                changed_in_file += 1

        save_json(file_path, data)

        files_updated += 1
        rows_updated += changed_in_file
        print(f"- {filename}: {changed_in_file} filas con cambios")

    print(f"Reset PDF completado. Archivos: {files_updated}, filas afectadas: {rows_updated}")


def fix_pn_final_suffix(base_dir):
    """
    Corrige pn_final cuando llega truncado y es un sufijo de un PN completo.
    Busca el valor completo en campos fuente (pn_raw, PART NO., pn_pdf, sust_*).
    Ejemplo: pn_final="912760297149", pn_raw="000912760297149"
    En ese caso pn_final se reemplaza por "000912760297149".
    """
    print("\n>>> Corrigiendo pn_final (sufijo de pn_raw/pn_pdf)")
    files_updated = 0
    rows_fixed = 0

    for filename in ENGINE_FILES:
        file_path = base_dir / filename
        if not file_path.exists():
            print(f"- Omitido (no existe): {filename}")
            continue

        data = load_json(file_path)

        if not isinstance(data, list):
            continue

        changed_in_file = 0
        for row in data:
            if not isinstance(row, dict):
                continue
            pn_final = str(row.get("pn_final") or "").strip()
            if not pn_final:
                continue

            source_candidates = []
            for key in [
                "pn_raw",
                "PART NO.",
                "pn_pdf",
                "sust_new_part_number",
                "sust_new_part_number_pdf",
            ]:
                candidate = str(row.get(key) or "").strip()
                if not candidate:
                    continue
                if candidate == "-":
                    continue
                if candidate == pn_final:
                    continue
                if candidate.endswith(pn_final):
                    source_candidates.append(candidate)

            if source_candidates:
                # Si hay varios candidatos compatibles, preferimos el más largo.
                best_candidate = max(source_candidates, key=len)
                row["pn_final"] = best_candidate
                changed_in_file += 1

        if changed_in_file:
            save_json(file_path, data)
            files_updated += 1
            rows_fixed += changed_in_file
            print(f"- {filename}: {changed_in_file} filas corregidas")
        else:
            print(f"- {filename}: sin cambios")

    print(f"Corrección pn_final completada. Archivos: {files_updated}, filas: {rows_fixed}")


def run_depuracion(base_dir):
    run_command([sys.executable, "depuracion_json.py"], base_dir, "depuracion_json.py")


def run_pdf_regeneration(base_dir):
    print("\n>>> Regenerando campos PDF con qa_pdf_compare")
    for filename in ENGINE_FILES:
        run_command(
            [
                "node",
                "scripts/qa_pdf_compare.js",
                f"--file={filename}",
                "--write-pdf",
                "--recompute-errors",
                "--no-backup",
            ],
            base_dir,
            f"qa_pdf_compare ({filename})",
        )


def main():
    parser = argparse.ArgumentParser(
        description="Reimporta engines desde qa_*.json, ejecuta depuracion y regenera campos PDF."
    )
    parser.add_argument(
        "--skip-pdf",
        action="store_true",
        help="Ejecuta solo depuracion_json.py (sin regenerar campos PDF).",
    )
    parser.add_argument(
        "--reset-pdf",
        action="store_true",
        help="Antes de regenerar, deja vacios todos los campos *_pdf en los engine_*.json.",
    )
    args = parser.parse_args()

    base_dir = resolve_repo_dir(__file__)
    started_at = time.time()

    print("Iniciando importar_json")
    print(f"Directorio: {base_dir}")
    if os.getenv("MILU_REPO_DEBUG", "").strip().lower() in {"1", "true", "yes", "on", "debug"}:
        print("[importar_json] resolucion de repo via MILU_REPO_DIR/env + fallback por __file__")

    reimport_from_qa(base_dir)
    fix_pn_final_suffix(base_dir)

    run_depuracion(base_dir)

    if not args.skip_pdf:
        if args.reset_pdf:
            reset_pdf_fields(base_dir)
        run_pdf_regeneration(base_dir)
    else:
        print("\n>>> Regeneracion PDF omitida por --skip-pdf")

    elapsed = time.time() - started_at
    print(f"\nProceso completado en {elapsed:.1f}s")


if __name__ == "__main__":
    main()
