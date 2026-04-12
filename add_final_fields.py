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

def add_final_fields(record):
    """
    Agrega los campos finales a cada registro con criterio específico.
    """
    # designation_final: si hay designation_gesa usa ese, si no usa DESIGNATION
    if "designation_final" not in record:
        if record.get("designation_gesa"):
            record["designation_final"] = record.get("designation_gesa")
        else:
            record["designation_final"] = record.get("DESIGNATION", None)
    
    # measurement_final: si hay dimensions_gesa usa ese, si no usa MEASUREMENT / STANDARD
    if "measurement_final" not in record:
        if record.get("dimensions_gesa"):
            record["measurement_final"] = record.get("dimensions_gesa")
        else:
            record["measurement_final"] = record.get("MEASUREMENT / STANDARD", None)
    
    # wheight_final: si hay WEIGHT usa ese, si no combina weight_gesa + " " + units
    if "wheight_final" not in record:
        if record.get("WEIGHT"):
            record["wheight_final"] = record.get("WEIGHT")
        else:
            weight_gesa = record.get("weight_gesa", "")
            units = record.get("units", "")
            if weight_gesa:
                record["wheight_final"] = f"{weight_gesa} {units}".strip()
            else:
                record["wheight_final"] = None
    
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

# Procesar archivos en json_originales/
print("\n\nProcesando archivos engine*.json en json_originales/:\n")
original_dir = base_dir / "json_originales"
if original_dir.exists():
    for filename in engine_files:
        file_path = original_dir / filename
        if file_path.exists():
            process_file(file_path)
        else:
            print(f"Archivo no encontrado: {file_path}")

print("\n✓ Proceso completado")
