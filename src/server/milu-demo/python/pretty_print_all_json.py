import json
import glob
import os

# Busca todos los archivos JSON en el directorio actual (excepto settings.json y product-export)
json_files = [f for f in glob.glob('*.json') if not f.startswith('product-export') and f != '.vscode/settings.json']

for file in json_files:
    with open(file, 'r', encoding='utf-8') as f:
        try:
            data = json.load(f)
        except Exception as e:
            print(f'Error leyendo {file}: {e}')
            continue
    with open(file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Formateado: {file}')
