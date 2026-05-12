import os
from pathlib import Path

from python_lib.repo_paths import resolve_repo_dir, should_log_repo_resolution
from python_lib.engine_constants import (
    ENGINE_FILES,
    FIELDS_TO_SYNC_FROM_QA,
    DEFAULT_EXP_IMAGENES,
    BLOCKED_ARTICLE_FRAGMENTS,
    NAN_LIKE_TOKENS,
)
from python_lib.json_io import load_json, save_json
from python_lib.engine_helpers import (
    normalize_compare_value,
    is_compare_match,
    calc_record_errors,
    collapse_spaces_in_structure,
    split_measurement_and_standard,
)

# Directorio principal (portable)
base_dir = resolve_repo_dir(__file__)

# engine_files: alias local para compatibilidad con código existente en este script
engine_files = ENGINE_FILES


def should_drop_record(record):
    """
    Excluye registros cuyo POS o DESIGNATION contienen fragmentos no validos.
    """
    if not isinstance(record, dict):
        return False

    candidate_values = [
        " ".join(str(record.get("POS") or "").strip().split()).lower(),
        " ".join(str(record.get("DESIGNATION") or "").strip().split()).lower(),
    ]

    for text_value in candidate_values:
        if not text_value:
            continue
        if any(fragment in text_value for fragment in BLOCKED_ARTICLE_FRAGMENTS):
            return True

    return False

def add_final_fields(record):
    """
    Agrega los campos finales a cada registro con criterio específico.
    """
    def normalize_spaces(value):
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if text.lower() in NAN_LIKE_TOKENS:
            return None
        return " ".join(text.split())

    # Normaliza espacios en todos los campos string del registro.
    record = collapse_spaces_in_structure(record)

    # Limpia espacios duplicados en dimensions_gesa para dejar una sola separación.
    cleaned_dimensions = normalize_spaces(record.get("dimensions_gesa"))
    record["dimensions_gesa"] = cleaned_dimensions

    # Limpia también MEASUREMENT / STANDARD y separa medida y norma cuando vengan mezcladas.
    cleaned_measurement_standard = normalize_spaces(record.get("MEASUREMENT / STANDARD"))
    cleaned_measure_pdf, extracted_norma_raw = split_measurement_and_standard(cleaned_measurement_standard)

    record["MEASUREMENT / STANDARD"] = cleaned_measure_pdf
    record["measure_pdf"] = cleaned_measure_pdf
    record["norma_raw"] = extracted_norma_raw

    if not normalize_spaces(record.get("norma")) and extracted_norma_raw:
        record["norma"] = extracted_norma_raw

    # designation_final: siempre prioriza designation_gesa; si no hay, usa DESIGNATION.
    record["designation_final"] = record.get("designation_gesa") or record.get("DESIGNATION", None)
    
    # measure_final conserva la medida final; measurement_final deja de persistirse.
    record["measure_final"] = cleaned_dimensions or cleaned_measure_pdf
    record.pop("measurement_final", None)

    # weight_final: siempre prioriza weight_gesa + units; si no, WEIGHT; si no, valor legado.
    legacy_weight_final = normalize_spaces(record.get("wheight_final"))
    source_weight = normalize_spaces(record.get("WEIGHT"))
    weight_gesa = record.get("weight_gesa")
    units = normalize_spaces(record.get("units"))
    record["units"] = units

    has_weight_gesa = weight_gesa is not None and str(weight_gesa).strip() != ""
    if has_weight_gesa:
        record["weight_final"] = f"{weight_gesa} {units or ''}".strip()
    elif source_weight:
        record["weight_final"] = source_weight
    elif legacy_weight_final:
        record["weight_final"] = legacy_weight_final
    else:
        record["weight_final"] = None

    if "wheight_final" in record:
        del record["wheight_final"]

    # exp_imagenes: prioridad 1: ruta_foto, 2: ruta_esquemas_pos
    # Si hay ambas, combinarlas (foto, esquema). Si no hay ninguna, usar sin_imagen
    ruta_foto = record.get("ruta_foto")
    ruta_esquemas_pos = record.get("ruta_esquemas_pos")
    
    imagenes = []
    if ruta_foto and str(ruta_foto).strip():
        imagenes.append(str(ruta_foto).strip())
    if ruta_esquemas_pos and str(ruta_esquemas_pos).strip():
        imagenes.append(str(ruta_esquemas_pos).strip())
    
    if imagenes:
        record["exp_imagenes"] = ", ".join(imagenes)
    else:
        record["exp_imagenes"] = DEFAULT_EXP_IMAGENES
    
    return calc_record_errors(record)


def build_qa_lookup_for_engine_file(engine_file_path):
    """
    Crea un índice por ID desde json_originales/qa_<modelo>.json para sincronizar campos.
    """
    engine_name = engine_file_path.name
    model_name = engine_name.replace("engine_", "", 1)
    qa_filename = f"qa_{model_name}"
    qa_file_path = base_dir / "json_originales" / qa_filename

    if not qa_file_path.exists():
        return {}

    try:
        qa_data = load_json(qa_file_path)
    except Exception:
        return {}

    if not isinstance(qa_data, list):
        return {}

    lookup = {}
    for row in qa_data:
        if not isinstance(row, dict):
            continue
        row_id = str(row.get("ID", "")).strip()
        if not row_id:
            continue
        lookup[row_id] = row
    return lookup


def sync_fields_from_qa(record, qa_lookup):
    """
    Sincroniza campos concretos desde QA al registro engine por ID.
    """
    row_id = str(record.get("ID", "")).strip()
    if not row_id:
        return record

    qa_row = qa_lookup.get(row_id)
    if not qa_row:
        return record

    for field_name in FIELDS_TO_SYNC_FROM_QA:
        record[field_name] = qa_row.get(field_name)

    return record

def process_file(file_path):
    """
    Procesa un archivo JSON y agrega los campos finales a todos los registros.
    """
    print(f"Procesando: {file_path}")
    
    try:
        # Leer el archivo
        data = load_json(file_path)
        
        qa_lookup = build_qa_lookup_for_engine_file(file_path)

        # Eliminar registros contaminados por fragmentos de cabecera/pie del PDF.
        if isinstance(data, list):
            original_count = len(data)
            filtered_data = [record for record in data if not should_drop_record(record)]
            removed_count = original_count - len(filtered_data)
            if removed_count:
                print(f"  - Registros eliminados por filtro POS/DESIGNATION: {removed_count}")

            data = [add_final_fields(sync_fields_from_qa(record, qa_lookup)) for record in filtered_data]
        elif isinstance(data, dict):
            if should_drop_record(data):
                print("  - Registro unico eliminado por filtro POS/DESIGNATION")
                data = []
            else:
                data = add_final_fields(sync_fields_from_qa(data, qa_lookup))
        
        if isinstance(data, list):
            updated_count = len(data)
        else:
            updated_count = 1

        # Guardar el archivo modificado
        save_json(file_path, data)
        
        print(f"  ✓ Completado: {updated_count} registros actualizados")
        return True
    
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

def main():
    if should_log_repo_resolution():
        print(f"[add_final_fields] repo_dir={base_dir}")

    # Procesar archivos en el directorio raiz
    print("Procesando archivos engine*.json en el directorio raíz:\n")
    for filename in engine_files:
        file_path = base_dir / filename
        if file_path.exists():
            process_file(file_path)
        else:
            print(f"Archivo no encontrado: {file_path}")

    print("\n✓ Proceso completado")


if __name__ == "__main__":
    main()
