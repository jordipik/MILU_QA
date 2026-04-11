import pandas as pd

excel_file = 'product-export-2026-03-29-11-07.xlsx'
json_file = 'product-export-2026-03-29-11-07.json'

def main():
    df = pd.read_excel(excel_file)
    df.to_json(json_file, orient='records', force_ascii=False, indent=2)
    print(f'Archivo convertido: {json_file}')

if __name__ == '__main__':
    main()
