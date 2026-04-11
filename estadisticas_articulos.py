import os
import json
from glob import glob

# Configuración de patrones de archivos
ENGINE_PATTERN = 'engine_*.json'
PRODUCT_PATTERN = 'product-export-*.json'

# Campos clave
ENGINE_KEY = 'PART NO.'
PRODUCT_KEY = 'post_name'

# Función para cargar artículos únicos de un archivo JSON

def load_unique_keys_from_json(filepath, key):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # Si el archivo es una lista de dicts
    if isinstance(data, list):
        return set(item.get(key) for item in data if key in item)
    # Si el archivo es un dict con una lista dentro
    elif isinstance(data, dict):
        # Buscar la primera lista de dicts
        for v in data.values():
            if isinstance(v, list):
                return set(item.get(key) for item in v if key in item)
    return set()

# Buscar archivos
engine_files = glob(ENGINE_PATTERN)
product_files = glob(PRODUCT_PATTERN)

# Estadísticas por libro (engine)
engine_stats = {}
all_engine_keys = set()
for ef in engine_files:
    keys = load_unique_keys_from_json(ef, ENGINE_KEY)
    engine_stats[ef] = keys
    all_engine_keys.update(keys)

# Estadísticas web (product-export)
product_stats = {}
all_product_keys = set()
for pf in product_files:
    keys = load_unique_keys_from_json(pf, PRODUCT_KEY)
    product_stats[pf] = keys
    all_product_keys.update(keys)

# Cálculos
print('--- Estadísticas de libros (engine_*.json) ---')
for fname, keys in engine_stats.items():
    print(f'{fname}: {len(keys)} artículos únicos')
print(f'Total artículos únicos en todos los libros: {len(all_engine_keys)}')

print('\n--- Estadísticas de web (product-export-*.json) ---')
for fname, keys in product_stats.items():
    print(f'{fname}: {len(keys)} artículos únicos')
print(f'Total artículos únicos en la web: {len(all_product_keys)}')

# Cruces
in_web_and_books = all_product_keys & all_engine_keys
in_web_not_in_books = all_product_keys - all_engine_keys
in_books_not_in_web = all_engine_keys - all_product_keys

print(f'\nArtículos en la web y en los libros: {len(in_web_and_books)}')
print(f'Artículos en la web pero NO en los libros: {len(in_web_not_in_books)}')
print(f'Artículos en los libros pero NO en la web: {len(in_books_not_in_web)}')

# Si tienes archivos para Gesa, New, Superseded, puedes añadirlos aquí de forma similar
# Ejemplo:
# gesa_keys = load_unique_keys_from_json('gesa.json', '...')
# print(f'Artículos en Gesa: {len(gesa_keys)}')

# Puedes modificar los patrones y claves según tus necesidades
