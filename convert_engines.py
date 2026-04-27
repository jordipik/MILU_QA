import pandas as pd
import os

files = [
    'engine_12V4000M40A.json',
    'engine_12V4000M53.json',
    'engine_12V4000M70.json',
    'engine_16V4000M61.json',
    'engine_16V4000M73.json',
    'engine_16V4000M73L.json',
    'engine_16V4000M90.json',
    'engine_20V4000M93.json',
    'engine_20V4000M93L.json'
]

for f in files:
    try:
        if not os.path.exists(f):
            print(f'{f}: Not found')
            continue
        df = pd.read_json(f)
        for col in df.columns:
            if hasattr(df[col], 'dt') and hasattr(df[col].dt, 'tz_localize'):
                try:
                    df[col] = df[col].dt.tz_localize(None)
                except:
                    pass
        out = f.replace('.json', '.xlsx')
        df.to_excel(out, index=False)
        print(f'{f}: Success')
    except Exception as e:
        print(f'{f}: Error - {e}')
