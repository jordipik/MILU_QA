import argparse
import json
from pathlib import Path

import pandas as pd

from python_lib.json_io import save_json
from python_lib.repo_paths import resolve_repo_dir

DEFAULT_EXCEL_FILE = 'product-export-2026-03-29-11-07.xlsx'
DEFAULT_JSON_FILE = 'product-export-2026-03-29-11-07.json'


def parse_args():
    parser = argparse.ArgumentParser(description='Convierte un Excel a JSON')
    parser.add_argument('--excel', default=DEFAULT_EXCEL_FILE, help='Ruta al archivo Excel de entrada')
    parser.add_argument('--json', dest='json_file', default=DEFAULT_JSON_FILE, help='Ruta al archivo JSON de salida')
    return parser.parse_args()

def main():
    args = parse_args()
    repo_dir = resolve_repo_dir(__file__)

    excel_path = Path(args.excel)
    if not excel_path.is_absolute():
        excel_path = repo_dir / excel_path

    json_path = Path(args.json_file)
    if not json_path.is_absolute():
        json_path = repo_dir / json_path

    df = pd.read_excel(excel_path)
    records = json.loads(df.to_json(orient='records', force_ascii=False))
    save_json(json_path, records)
    print(f'Archivo convertido: {json_path}')

if __name__ == '__main__':
    main()
