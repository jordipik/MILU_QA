#!/usr/bin/env python3
"""
Refactoriza 'measurement_error' a 'measure_error' en todos los engine_*.json.
"""

import json
import os
import sys
from pathlib import Path

def refactor_json_file(file_path):
    """Refactoriza un archivo JSON reemplazando measurement_error con measure_error."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"❌ Error al leer {file_path}: {e}")
        return False

    if not isinstance(data, list):
        print(f"⚠️  {file_path} no es un array JSON, se omite")
        return False

    changed = False
    for row in data:
        if isinstance(row, dict):
            # Si existe 'measurement_error', renombrarlo a 'measure_error'
            if 'measurement_error' in row:
                row['measure_error'] = row.pop('measurement_error')
                changed = True

    if changed:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            print(f"✅ {file_path}: refactorizado (measurement_error → measure_error)")
            return True
        except IOError as e:
            print(f"❌ Error al escribir {file_path}: {e}")
            return False
    else:
        print(f"⏭️  {file_path}: sin cambios (measurement_error no encontrado)")
        return False

def main():
    """Refactoriza todos los engine_*.json en el directorio actual."""
    repo_root = Path(__file__).parent
    
    # Buscar todos los archivos engine_*.json
    engine_files = sorted(repo_root.glob('engine_*.json'))
    
    if not engine_files:
        print("❌ No se encontraron archivos engine_*.json")
        sys.exit(1)

    print(f"🔄 Refactorizando {len(engine_files)} archivos...\n")
    
    success_count = 0
    for file_path in engine_files:
        if refactor_json_file(file_path):
            success_count += 1

    print(f"\n✅ Refactorización completada: {success_count}/{len(engine_files)} archivos actualizados")

if __name__ == '__main__':
    main()
