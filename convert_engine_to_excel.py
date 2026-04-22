import pandas as pd
import json
import sys
import os

def main():
    engine_file = sys.argv[1] if len(sys.argv) > 1 else 'engine_16V4000M73L.json'

    if not os.path.exists(engine_file):
        print(f'Archivo no encontrado: {engine_file}')
        sys.exit(1)

    with open(engine_file, encoding='utf-8') as f:
        data = json.load(f)

    df = pd.DataFrame(data)

    output_file = os.path.splitext(engine_file)[0] + '.xlsx'
    df.to_excel(output_file, index=False)
    print(f'Exportado: {output_file} ({len(df)} filas, {len(df.columns)} columnas)')

if __name__ == '__main__':
    main()
