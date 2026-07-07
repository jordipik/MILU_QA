from pathlib import Path

from python_lib.repo_paths import resolve_repo_dir, should_log_repo_resolution
from python_lib.engine_constants import ENGINE_PATTERN, PRODUCT_PATTERN, ENGINE_KEY, PRODUCT_KEY
from python_lib.json_io import load_unique_keys_from_json

REPORT_FILE = 'informe_estadisticas.txt'

def main():
    repo_dir = resolve_repo_dir(__file__)
    if should_log_repo_resolution():
        print(f"[informe_estadisticas] repo_dir={repo_dir}")

    engine_files = sorted(repo_dir.glob(ENGINE_PATTERN))
    product_files = sorted(repo_dir.glob(PRODUCT_PATTERN))

    engine_stats = {}
    all_engine_keys = set()
    total_engine_records = 0
    for ef in engine_files:
        total, keys = load_unique_keys_from_json(ef, ENGINE_KEY)
        engine_stats[ef.name] = {'total': total, 'unique': len(keys)}
        all_engine_keys.update(keys)
        total_engine_records += total

    product_stats = {}
    all_product_keys = set()
    total_product_records = 0
    for pf in product_files:
        total, keys = load_unique_keys_from_json(pf, PRODUCT_KEY)
        product_stats[pf.name] = {'total': total, 'unique': len(keys)}
        all_product_keys.update(keys)
        total_product_records += total

    in_web_and_books = all_product_keys & all_engine_keys
    in_web_not_in_books = all_product_keys - all_engine_keys
    in_books_not_in_web = all_engine_keys - all_product_keys

    report_path = repo_dir / REPORT_FILE
    with open(report_path, 'w', encoding='utf-8') as report:
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

    print(f'Informe generado: {report_path}')

if __name__ == '__main__':
    main()
