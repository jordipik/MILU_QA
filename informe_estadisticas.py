import os
import json
from glob import glob

ENGINE_PATTERN = 'engine_*.json'
PRODUCT_PATTERN = 'product-export-*.json'
ENGINE_KEY = 'PART NO.'
PRODUCT_KEY = 'post_name'

REPORT_FILE = 'informe_estadisticas.txt'

def load_unique_keys_from_json(filepath, key):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    if isinstance(data, list):
        total = len(data)
        keys = set(item.get(key) for item in data if key in item)
        return total, keys
    elif isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                total = len(v)
                keys = set(item.get(key) for item in v if key in item)
                return total, keys
    return 0, set()

def main():
    engine_files = glob(ENGINE_PATTERN)
    product_files = glob(PRODUCT_PATTERN)

    engine_stats = {}
    all_engine_keys = set()
    total_engine_records = 0
    for ef in engine_files:
        total, keys = load_unique_keys_from_json(ef, ENGINE_KEY)
        engine_stats[ef] = {'total': total, 'unique': len(keys)}
        all_engine_keys.update(keys)
        total_engine_records += total

    product_stats = {}
    all_product_keys = set()
    total_product_records = 0
    for pf in product_files:
        total, keys = load_unique_keys_from_json(pf, PRODUCT_KEY)
        product_stats[pf] = {'total': total, 'unique': len(keys)}
        all_product_keys.update(keys)
        total_product_records += total

    in_web_and_books = all_product_keys & all_engine_keys
    in_web_not_in_books = all_product_keys - all_engine_keys
    in_books_not_in_web = all_engine_keys - all_product_keys

    with open(REPORT_FILE, 'w', encoding='utf-8') as report:
        report.write('INFORME DE ESTADÍSTICAS DE ARTÍCULOS\n')
        report.write('='*50 + '\n\n')
        report.write('Detalle por libro (engine_*.json):\n')
        report.write('  Archivo'.ljust(32) + 'Únicos'.rjust(10) + 'Totales'.rjust(12) + '\n')
        report.write('-'*54 + '\n')
        for fname, stats in engine_stats.items():
            report.write(f'- {fname.ljust(28)} {str(stats["unique"]).rjust(7)}   {str(stats["total"]).rjust(8)}\n')
        report.write('-'*54 + '\n')
        report.write(f'Total artículos únicos en todos los libros: {len(all_engine_keys)}\n')
        report.write(f'Total registros en todos los libros: {total_engine_records}\n')
        report.write('\n')
        report.write('Detalle por archivo de web (product-export-*.json):\n')
        report.write('  Archivo'.ljust(32) + 'Únicos'.rjust(10) + 'Totales'.rjust(12) + '\n')
        report.write('-'*54 + '\n')
        for fname, stats in product_stats.items():
            report.write(f'- {fname.ljust(28)} {str(stats["unique"]).rjust(7)}   {str(stats["total"]).rjust(8)}\n')
        report.write('-'*54 + '\n')
        report.write(f'Total artículos únicos en la web: {len(all_product_keys)}\n')
        report.write(f'Total registros en la web: {total_product_records}\n')
        report.write('\n')
        report.write('CRUCES ENTRE LIBROS Y WEB\n')
        report.write('-'*40 + '\n')
        report.write(f'Artículos en la web y en los libros: {len(in_web_and_books)}\n')
        report.write(f'Artículos en la web pero NO en los libros: {len(in_web_not_in_books)}\n')
        report.write(f'Artículos en los libros pero NO en la web: {len(in_books_not_in_web)}\n')
        report.write('\n')
        report.write('FIN DEL INFORME\n')

if __name__ == '__main__':
    main()
