from pathlib import Path

from python_lib.repo_paths import resolve_repo_dir, should_log_repo_resolution
from python_lib.engine_constants import ENGINE_PATTERN, PRODUCT_PATTERN, ENGINE_KEY, PRODUCT_KEY
from python_lib.json_io import load_unique_keys_from_json

# Buscar archivos desde el repo resuelto (no depende de cwd)
repo_dir = resolve_repo_dir(__file__)
if should_log_repo_resolution():
    print(f"[estadisticas_articulos] repo_dir={repo_dir}")

engine_files = sorted(repo_dir.glob(ENGINE_PATTERN))
product_files = sorted(repo_dir.glob(PRODUCT_PATTERN))

# Estadísticas por libro (engine)
engine_stats = {}
all_engine_keys = set()
for ef in engine_files:
    _, keys = load_unique_keys_from_json(ef, ENGINE_KEY)
    engine_stats[ef.name] = keys
    all_engine_keys.update(keys)

# Estadísticas web (product-export)
product_stats = {}
all_product_keys = set()
for pf in product_files:
    _, keys = load_unique_keys_from_json(pf, PRODUCT_KEY)
    product_stats[pf.name] = keys
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
