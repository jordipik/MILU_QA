import json
import os
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

DEFAULT_EXP_IMAGENES = "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"

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

    # Limpia espacios duplicados en dimensions_gesa para dejar una sola separación.
    cleaned_dimensions = normalize_spaces(record.get("dimensions_gesa"))
    record["dimensions_gesa"] = cleaned_dimensions

    # Limpia también MEASUREMENT / STANDARD para evitar dobles espacios en fallback.
    cleaned_measurement_standard = normalize_spaces(record.get("MEASUREMENT / STANDARD"))
    record["MEASUREMENT / STANDARD"] = cleaned_measurement_standard

    # designation_final: si hay designation_gesa usa ese, si no usa DESIGNATION
    if "designation_final" not in record:
        if record.get("designation_gesa"):
            record["designation_final"] = record.get("designation_gesa")
        else:
            record["designation_final"] = record.get("DESIGNATION", None)
    
    # measurement_final: siempre prioriza dimensions_gesa, si no usa MEASUREMENT / STANDARD.
    record["measurement_final"] = cleaned_dimensions or cleaned_measurement_standard

    # Corregir typo legado: wheight_final -> weight_final.
    legacy_weight_final = record.get("wheight_final")
    current_weight_final = record.get("weight_final")
    current_weight_final_text = "" if current_weight_final is None else str(current_weight_final).strip()
    legacy_weight_final_text = "" if legacy_weight_final is None else str(legacy_weight_final).strip()

    # Si weight_final no existe o esta vacio, reutiliza el valor legado si existe.
    if ("weight_final" not in record or current_weight_final_text == "") and legacy_weight_final_text:
        record["weight_final"] = legacy_weight_final
    elif "weight_final" not in record:
        if record.get("WEIGHT"):
            record["weight_final"] = record.get("WEIGHT")
        else:
            weight_gesa = record.get("weight_gesa", "")
            units = record.get("units", "")
            if weight_gesa:
                record["weight_final"] = f"{weight_gesa} {units}".strip()
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
        
        # Procesar cada registro
        if isinstance(data, list):
            data = [add_final_fields(record) for record in data]
        elif isinstance(data, dict):
            data = add_final_fields(data)
        
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
