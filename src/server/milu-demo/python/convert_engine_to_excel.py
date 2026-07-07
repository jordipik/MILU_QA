import argparse
from pathlib import Path

import pandas as pd

from python_lib.json_io import load_engine_json
from python_lib.repo_paths import resolve_repo_dir


def parse_args():
    parser = argparse.ArgumentParser(description='Exporta un engine JSON a Excel')
    parser.add_argument('engine_file', nargs='?', default='engine_16V4000M73L.json')
    parser.add_argument('--output', default=None, help='Ruta de salida .xlsx (opcional)')
    return parser.parse_args()

def main():
    args = parse_args()
    repo_dir = resolve_repo_dir(__file__)

    engine_path = Path(args.engine_file)
    if not engine_path.is_absolute():
        engine_path = repo_dir / engine_path

    if not engine_path.exists():
        print(f'Archivo no encontrado: {engine_path}')
        raise SystemExit(1)

    data = load_engine_json(engine_path)

    df = pd.DataFrame(data)

    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = repo_dir / output_path
    else:
        output_path = engine_path.with_suffix('.xlsx')

    df.to_excel(output_path, index=False)
    print(f'Exportado: {output_path} ({len(df)} filas, {len(df.columns)} columnas)')

if __name__ == '__main__':
    main()
