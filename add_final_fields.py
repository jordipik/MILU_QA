import json
import os
import unicodedata
from pathlib import Path

# Directorio principal
base_dir = Path(r"c:\Users\jordi\source\repos\milu")

# Lista de archivos engine*.json en el directorio raíz
engine_files = [
    "engine_12V4000M40A.json",
    "engine_12V4000M53.json",
    "engine_16V4000M61.json",
    "engine_16V4000M73.json",
    "engine_16V4000M73L.json",
    "engine_16V4000M90.json",
    "engine_20V4000M93.json",
    "engine_20V4000M93L.json",
]

FIELDS_TO_SYNC_FROM_QA = [
    "designation_gesa",
    "dimensions_gesa",
    "weight_gesa",
    "units",
]

DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"


def normalize_compare_value(value):
    """
    Normaliza valores para comparacion QA (espacios, minusculas y sin acentos).
    """
    text = " ".join(str(value or "").strip().split())
    if not text or text == "-":
        return ""

    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def is_compare_match(left, right):
    normalized_left = normalize_compare_value(left)
    normalized_right = normalize_compare_value(right)
    return bool(normalized_left and normalized_right and normalized_left == normalized_right)


def calc_record_errors(record):
    """
    Calcula flags de error por campo y total_error, alineado con los checks QA activos.
    """
    pos_final = record.get("pos_final")
    pos_pdf = record.get("pos_pdf") or record.get("POS")

    pn_final = record.get("pn_final")
    pn_pdf = record.get("pn_pdf") or record.get("PART NO.")

    designation_final = record.get("designation_final")
    designation_pdf = record.get("designation_pdf") or record.get("DESIGNATION")
    designation_gesa = record.get("designation_gesa")

    weight_final = record.get("weight_final")
    weight_pdf = record.get("weight_pdf") or record.get("WEIGHT")
    weight_gesa = record.get("weight_gesa")
    units = record.get("units")
    weight_gesa_with_units = None
    if weight_gesa is not None and str(weight_gesa).strip() != "":
        weight_gesa_with_units = f"{weight_gesa} {str(units or '').strip()}".strip()

    measurement_final = record.get("measure_final") or record.get("measurement_final")
    measurement_pdf = record.get("measure_pdf") or record.get("MEASUREMENT / STANDARD")
    measurement_gesa = record.get("dimensions_gesa") or record.get("measure_gesa")
    measurement_all_empty = all(
        normalize_compare_value(value) == ""
        for value in [measurement_final, measurement_pdf, measurement_gesa]
    )

    norma_final = record.get("norma_final") or record.get("norma")
    norma_pdf = record.get("norma_pdf") or record.get("norma_raw") or record.get("norma")
    norma_gesa = record.get("norma_gesa")
    norma_all_empty = all(
        normalize_compare_value(value) == ""
        for value in [norma_final, norma_pdf, norma_gesa]
    )

    bom_final = record.get("BOM-No.")
    bom_pdf = record.get("bom_pdf")

    pos_error = int(
        normalize_compare_value(pos_final) == ""
        or not is_compare_match(pos_final, pos_pdf)
    )

    pn_error = int(
        normalize_compare_value(pn_final) == ""
        or not is_compare_match(pn_final, pn_pdf)
    )

    designation_error = int(
        normalize_compare_value(designation_final) == ""
        or (
            not is_compare_match(designation_final, designation_pdf)
            and not is_compare_match(designation_final, designation_gesa)
        )
    )

    weight_error = int(
        not is_compare_match(weight_final, weight_pdf)
        and not is_compare_match(weight_final, weight_gesa_with_units)
    )

    measurement_error = int(
        (not measurement_all_empty)
        and not is_compare_match(measurement_final, measurement_pdf)
        and not is_compare_match(measurement_final, measurement_gesa)
    )

    norma_error = int(
        (not norma_all_empty)
        and not is_compare_match(norma_final, norma_pdf)
        and not is_compare_match(norma_final, norma_gesa)
    )

    bom_error = int(
        normalize_compare_value(bom_pdf) != ""
        and not is_compare_match(bom_final, bom_pdf)
    )

    record["pos_error"] = pos_error
    record["pn_error"] = pn_error
    record["designation_error"] = designation_error
    record["weight_error"] = weight_error
    record["measurement_error"] = measurement_error
    record["norma_error"] = norma_error
    record["bom_error"] = bom_error

    total_error = (
        pos_error
        + pn_error
        + designation_error
        + weight_error
        + measurement_error
        + norma_error
        + bom_error
    )
    record["total_error"] = total_error
    record["has_error"] = total_error > 0

    return record


def collapse_spaces_in_structure(value):
    """
    Normaliza espacios en cualquier string dentro de una estructura anidada.
    """
    if isinstance(value, str):
        return " ".join(value.split())
    if isinstance(value, list):
        return [collapse_spaces_in_structure(item) for item in value]
    if isinstance(value, dict):
        return {k: collapse_spaces_in_structure(v) for k, v in value.items()}
    return value

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
        return " ".join(text.split())

    # Normaliza espacios en todos los campos string del registro.
    record = collapse_spaces_in_structure(record)

    # Limpia espacios duplicados en dimensions_gesa para dejar una sola separación.
    cleaned_dimensions = normalize_spaces(record.get("dimensions_gesa"))
    record["dimensions_gesa"] = cleaned_dimensions

    # Limpia también MEASUREMENT / STANDARD para evitar dobles espacios en fallback.
    cleaned_measurement_standard = normalize_spaces(record.get("MEASUREMENT / STANDARD"))
    record["MEASUREMENT / STANDARD"] = cleaned_measurement_standard

    # designation_final: siempre prioriza designation_gesa; si no hay, usa DESIGNATION.
    record["designation_final"] = record.get("designation_gesa") or record.get("DESIGNATION", None)
    
    # measurement_final: siempre prioriza dimensions_gesa, si no usa MEASUREMENT / STANDARD.
    record["measurement_final"] = cleaned_dimensions or cleaned_measurement_standard

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
        with open(qa_file_path, 'r', encoding='utf-8') as f:
            qa_data = json.load(f)
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
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        qa_lookup = build_qa_lookup_for_engine_file(file_path)

        # Procesar cada registro
        if isinstance(data, list):
            data = [add_final_fields(sync_fields_from_qa(record, qa_lookup)) for record in data]
        elif isinstance(data, dict):
            data = add_final_fields(sync_fields_from_qa(data, qa_lookup))
        
        # Guardar el archivo modificado
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"  ✓ Completado: {len(data) if isinstance(data, list) else 1} registros actualizados")
        return True
    
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

# Procesar archivos en el directorio raíz
print("Procesando archivos engine*.json en el directorio raíz:\n")
for filename in engine_files:
    file_path = base_dir / filename
    if file_path.exists():
        process_file(file_path)
    else:
        print(f"Archivo no encontrado: {file_path}")

print("\n✓ Proceso completado")
