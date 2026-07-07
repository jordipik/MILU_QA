import pandas as pd
from python_lib.engine_constants import ENGINE_FILES
from python_lib.json_io import load_engine_json
from python_lib.repo_paths import resolve_repo_dir

repo_dir = resolve_repo_dir(__file__)

for f in ENGINE_FILES:
    try:
        input_path = repo_dir / f
        if not input_path.exists():
            print(f'{f}: Not found')
            continue
        df = pd.DataFrame(load_engine_json(input_path))
        for col in df.columns:
            if hasattr(df[col], 'dt') and hasattr(df[col].dt, 'tz_localize'):
                try:
                    df[col] = df[col].dt.tz_localize(None)
                except:
                    pass
        out = str(input_path.with_suffix('.xlsx'))
        df.to_excel(out, index=False)
        print(f'{f}: Success')
    except Exception as e:
        print(f'{f}: Error - {e}')
