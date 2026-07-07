import json
import csv
import collections
import pathlib
from engine_files import ENGINE_JSON_FILES

root = pathlib.Path('.')
report = []
summary = []

for name in ENGINE_JSON_FILES:
    p = root / name
    if not p.exists():
        continue
    with open(p, encoding='utf-8') as fh:
        rows = json.load(fh)

    pages = collections.defaultdict(lambda: {'rows': 0, 'with_schema': 0})
    for r in rows:
        sp = r.get('Source Page', '')
        digits = ''.join(ch for ch in str(sp) if ch.isdigit())
        if not digits:
            continue
        pg = int(digits)
        pages[pg]['rows'] += 1
        if str(r.get('esquemas', '') or '').strip():
            pages[pg]['with_schema'] += 1

    no_schema = [
        {'page': pg, 'rows': v['rows'], 'with_schema': v['with_schema']}
        for pg, v in sorted(pages.items())
        if v['with_schema'] == 0
    ]

    report.append({
        'engine_file': name,
        'total_pages': len(pages),
        'pages_without_any_esquema': len(no_schema),
        'pages': no_schema,
    })
    summary.append({
        'engine_file': name,
        'total_pages': len(pages),
        'pages_without_any_esquema': len(no_schema),
        'pages_list': ','.join(str(x['page']) for x in no_schema),
    })

out_json = root / 'tmp_pages_without_esquemas_all_engines.json'
out_csv = root / 'tmp_pages_without_esquemas_all_engines.csv'

with open(out_json, 'w', encoding='utf-8') as f:
    json.dump({'engines': report}, f, ensure_ascii=False, indent=2)

with open(out_csv, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['engine_file', 'total_pages', 'pages_without_any_esquema', 'pages_list'])
    w.writeheader()
    w.writerows(summary)

print('json', out_json)
print('csv', out_csv)
print('engines_processed', len(summary))
for s in summary:
    print(f"{s['engine_file']}: {s['pages_without_any_esquema']} -> {s['pages_list']}")
