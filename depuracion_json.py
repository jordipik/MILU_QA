from datetime import datetime, timezone
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

# Timestamp de la ejecución actual (ISO 8601 UTC)
RUN_TIMESTAMP = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

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
    cleaned_measure_raw, extracted_norma_raw = split_measurement_and_standard(cleaned_measurement_standard)

    record["MEASUREMENT / STANDARD"] = cleaned_measure_raw
    record["measure_raw"] = cleaned_measure_raw
    record["norma_raw"] = extracted_norma_raw

    if not normalize_spaces(record.get("norma")) and extracted_norma_raw:
        record["norma"] = extracted_norma_raw

    # Copia/normaliza campos base a sus variantes finales cuando falten.
    pos_source = normalize_spaces(record.get("POS"))
    pos_final = normalize_spaces(record.get("pos_final"))
    record["pos_final"] = pos_final or pos_source

    # Corrige pn_final truncado cuando es sufijo de un PN completo disponible.
    pn_final = normalize_spaces(record.get("pn_final"))
    if pn_final:
        pn_sources = []
        for key in [
            "pn_raw",
            "PART NO.",
            "pn_pdf",
            "sust_new_part_number",
            "sust_new_part_number_pdf",
        ]:
            source_value = normalize_spaces(record.get(key))
            if not source_value or source_value == "-" or source_value == pn_final:
                continue
            if source_value.endswith(pn_final):
                pn_sources.append(source_value)

        if pn_sources:
            record["pn_final"] = max(pn_sources, key=len)

    # Si pn_final coincide con el PN nuevo de sustitucion, conservar ese valor
    # solo en sust_new_part_number y mantener pn_final alineado al PN base.
    pn_final = normalize_spaces(record.get("pn_final"))
    pn_new_sust = normalize_spaces(record.get("sust_new_part_number"))
    if pn_final and pn_new_sust and pn_final == pn_new_sust:
        base_candidates = [
            normalize_spaces(record.get("PART NO.")),
            normalize_spaces(record.get("pn_raw")),
            normalize_spaces(record.get("pn_pdf")),
        ]
        base_candidates = [value for value in base_candidates if value and value != "-"]
        if base_candidates:
            base_pn = base_candidates[0]
            if base_pn != pn_final:
                record["pn_final"] = base_pn

    model_type_source = normalize_spaces(record.get("MODEL/TYPE"))
    record["model_final"] = model_type_source
    record["MODEL/TYPE_final"] = model_type_source

    qty_source = normalize_spaces(record.get("QTY"))
    qty_final = normalize_spaces(record.get("qty_final"))
    record["qty_final"] = qty_final or qty_source

    qty_units_source = normalize_spaces(record.get("UNITS"))
    qty_units_final = normalize_spaces(record.get("qty_units_final"))
    record["qty_units_final"] = qty_units_final or qty_units_source

    norma_source = normalize_spaces(record.get("norma"))
    norma_final = normalize_spaces(record.get("norma_final"))
    record["norma_final"] = norma_final or norma_source

    # designation_final: prioriza GESA salvo cuando GESA y PDF son equivalentes
    # tras normalizar (espacios/caja/acentos). En ese caso conserva el formato PDF.
    designation_gesa = record.get("designation_gesa")
    designation_pdf = record.get("designation_pdf") or record.get("DESIGNATION")
    if (
        normalize_compare_value(designation_gesa)
        and normalize_compare_value(designation_pdf)
        and is_compare_match(designation_gesa, designation_pdf)
    ):
        record["designation_final"] = designation_pdf
    else:
        record["designation_final"] = designation_gesa or record.get("DESIGNATION", None)
    
    # measure_final conserva la medida final; measurement_final deja de persistirse.
    record["measure_final"] = cleaned_dimensions or cleaned_measure_raw
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

    record["depuracion_ts"] = RUN_TIMESTAMP

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
        print(f"[depuracion_json] repo_dir={base_dir}")

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
