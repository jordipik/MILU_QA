import json
import glob

# Cargar los post_name del export de WordPress
with open('product-export-2026-03-29-11-07.json', 'r', encoding='utf-8') as f:
    wp_data = json.load(f)
    post_names = set(str(item.get('post_name', '')).strip() for item in wp_data if item.get('post_name'))

# Procesar todos los archivos engine_*.json
for file in glob.glob('engine_*.json'):
    with open(file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    for articulo in data:
        part_no = str(articulo.get('PART NO.', '')).strip()
        articulo['EN_WEB'] = part_no in post_names
    with open(file, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Actualizado: {file}')
