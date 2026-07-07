#!/usr/bin/env python3

import argparse
import json
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


REPORT_PATH = Path('docs/v1.04/FG_FGS_FILL_MISSING_DRYRUN_REPORT.md')
DEFAULT_CATALOG_PATH = Path('data/catalogs/FG_FGS_CATALOG.json')
DEFAULT_FG_CATALOG_PATH = Path('EXCEL_FG-FGS.json')


def text(value):
    return '' if value is None else str(value).strip()


def normalize_spaces(value):
    return re.sub(r'\s+', ' ', text(value))


def normalize_bom(value):
    return normalize_spaces(value).upper()


def normalize_engine_token(value):
    raw = text(value)
    if not raw:
        return ''
    if raw.upper() == 'ALL':
        return 'ALL'
    match = re.match(r'^(?:engine_)?(.+?)(?:\.json)?$', raw, re.IGNORECASE)
    return text(match.group(1) if match else raw)


def normalize_engine_model_for_lookup(value):
    raw = text(value)
    if not raw:
        return ''
    raw = re.sub(r'^engine_', '', raw, flags=re.IGNORECASE)
    raw = re.sub(r'\.json$', '', raw, flags=re.IGNORECASE)
    return raw.upper()


def extract_fg_code_from_final(value):
    raw = text(value)
    if not raw:
        return None
    match = re.match(r'^(\d+)', raw)
    if not match:
        return None
    return int(match.group(1))


def read_json_array(file_path, label):
    data = json.loads(file_path.read_text(encoding='utf-8-sig'))
    if not isinstance(data, list):
        raise ValueError(f'{label} no contiene un array JSON.')
    return data


def write_json_array(file_path, rows):
    file_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def load_engine_file_list(repo_root):
    engine_files_path = repo_root / 'engine_files.js'
    source = engine_files_path.read_text(encoding='utf8')
    files = re.findall(r"'((?:engine_)[^']+\.json)'", source)
    if not files:
        raise ValueError('No se pudieron resolver los engine_*.json desde engine_files.js.')
    return files


def resolve_engine_files(repo_root, engine_value):
    known_files = load_engine_file_list(repo_root)
    engine_token = normalize_engine_token(engine_value)
    if engine_token == 'ALL':
        return known_files
    if not engine_token:
        raise ValueError('Debe indicar --engine <modelo|ALL>.')
    engine_file = f'engine_{engine_token}.json'
    if engine_file not in known_files:
        raise ValueError(f'No existe el engine solicitado: {engine_file}')
    return [engine_file]


def resolve_path(repo_root, supplied_path, default_path):
    supplied = text(supplied_path)
    if supplied:
        path = Path(supplied)
        return path if path.is_absolute() else repo_root / path
    return repo_root / default_path


def build_fg_master_index(rows):
    index = {}
    for row in rows:
        model = normalize_engine_model_for_lookup(row.get('model'))
        code_value = row.get('code')
        try:
            code = int(code_value)
        except (TypeError, ValueError):
            continue
        if not model:
            continue
        index[f'{model}::{code}'] = {
            'description': text(row.get('description')) or None,
            'code_description': normalize_spaces(row.get('FG_Descripcion')) or None,
        }
    return index


def build_catalog_from_current_final(repo_root):
    grouped = defaultdict(Counter)
    engines_by_bom_fg = defaultdict(lambda: defaultdict(set))

    for engine_file in load_engine_file_list(repo_root):
        rows = read_json_array(repo_root / engine_file, engine_file)
        engine_token = normalize_engine_token(engine_file)
        for row in rows:
            bom = normalize_bom(row.get('bom_final'))
            fg = normalize_spaces(row.get('fg_fgs_final'))
            if not bom or not fg:
                continue
            grouped[bom][fg] += 1
            engines_by_bom_fg[bom][fg].add(engine_token)

    entries = {}
    conflicts = {}
    for bom, counter in grouped.items():
        if len(counter) == 1:
            fg, occurrences = counter.most_common(1)[0]
            entries[bom] = {
                'fg_fgs_final': fg,
                'occurrences': occurrences,
                'engines': sorted(engines_by_bom_fg[bom][fg]),
            }
            continue
        conflicts[bom] = [
            {
                'fg_fgs_final': fg,
                'occurrences': occurrences,
                'engines': sorted(engines_by_bom_fg[bom][fg]),
            }
            for fg, occurrences in counter.most_common()
        ]

    return {
        'generated_at': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'source': 'derived-current-final',
        'entries': entries,
        'conflicts': conflicts,
    }


def load_catalog(repo_root, catalog_path):
    if catalog_path.exists():
        data = json.loads(catalog_path.read_text(encoding='utf-8-sig'))
        if not isinstance(data, dict):
            raise ValueError(f'Catalogo invalido: {catalog_path}')
        entries = {
            normalize_bom(bom): text(item.get('fg_fgs_final'))
            for bom, item in data.get('entries', {}).items()
            if normalize_bom(bom) and text(item.get('fg_fgs_final'))
        }
        conflicts = {
            normalize_bom(bom): [entry for entry in values if text(entry.get('fg_fgs_final'))]
            for bom, values in data.get('conflicts', {}).items()
            if normalize_bom(bom)
        }
        return {
            'path': str(catalog_path),
            'mode': 'file',
            'entries': entries,
            'conflicts': conflicts,
            'raw': data,
        }

    transient = build_catalog_from_current_final(repo_root)
    entries = {
        bom: item['fg_fgs_final']
        for bom, item in transient['entries'].items()
        if text(item.get('fg_fgs_final'))
    }
    return {
        'path': str(catalog_path),
        'mode': transient['source'],
        'entries': entries,
        'conflicts': transient['conflicts'],
        'raw': transient,
    }


def normalize_fg_fgs_final_format(value):
    raw = normalize_spaces(value)
    if not raw:
        return ''

    # Canonical format: NNN-SS (example: 208 05 -> 208-05)
    m = re.match(r'^(\d{1,3})\D+(\d{1,2})$', raw)
    if m:
        left = f'{int(m.group(1)):03d}'
        right = f'{int(m.group(2)):02d}'
        return f'{left}-{right}'

    m = re.match(r'^(\d{3})-(\d{2})$', raw)
    if m:
        return raw

    return raw


def build_local_pn_index(rows):
    index = defaultdict(list)
    for row in rows:
        pn_key = normalize_bom(row.get('pn_final') or row.get('PART NO.'))
        if not pn_key:
            continue
        index[pn_key].append(row)
    return index


def resolve_fg_from_bom_via_local_pn(rows_by_pn, start_bom_key, max_hops=2):
    current_key = normalize_bom(start_bom_key)
    visited = set()

    for hop in range(max_hops):
        if not current_key or current_key in visited:
            break
        visited.add(current_key)

        candidate_rows = rows_by_pn.get(current_key) or []
        for candidate in candidate_rows:
            fg = normalize_fg_fgs_final_format(candidate.get('fg_fgs_final'))
            if fg:
                return {
                    'fg_fgs_final': fg,
                    'hop': hop + 1,
                    'source_id': text(candidate.get('ID')),
                }

        # No recursive search: advance at most one BOM->PN jump per iteration,
        # capped by max_hops=2.
        next_key = ''
        for candidate in candidate_rows:
            candidate_bom = normalize_bom(candidate.get('bom_final'))
            if candidate_bom and candidate_bom not in visited:
                next_key = candidate_bom
                break
        current_key = next_key

    return None


def derive_fg_values(row, next_fg_fgs_final, fg_master_index, fallback_engine):
    fg_code = extract_fg_code_from_final(next_fg_fgs_final)
    engine_model = normalize_engine_model_for_lookup(row.get('engine_model') or row.get('model') or fallback_engine)
    lookup = fg_master_index.get(f'{engine_model}::{fg_code}') if fg_code is not None and engine_model else None
    return {
        'fg_fgs_final': next_fg_fgs_final,
        'fg_code': fg_code,
        'fgs_description': lookup.get('description') if lookup else None,
        'fgs_code_description': lookup.get('code_description') if lookup else None,
    }


def add_example(bucket, payload, limit=10):
    if len(bucket) < limit:
        bucket.append(payload)


def apply_updates(row, next_values):
    changed = False
    for key, value in next_values.items():
        if row.get(key) != value:
            row[key] = value
            changed = True
    return changed


def make_engine_summary(engine_file):
    return {
        'engine': normalize_engine_token(engine_file),
        'file': engine_file,
        'processed': 0,
        'empty_fg_fgs_final': 0,
        'with_bom': 0,
        'without_bom': 0,
        'bom_found': 0,
        'bom_not_found': 0,
        'resolved_via_local_pn': 0,
        'fillable': 0,
        'untouched_existing': 0,
        'bom_conflict_rows': 0,
        'proposed_changes': 0,
        'write_changes': 0,
        'examples_fillable': [],
        'examples_bom_not_found': [],
        'examples_bom_conflict': [],
        'book_breakdown': {},
    }


def process_engine_file(repo_root, engine_file, catalog, fg_master_index, write=False, backup=False):
    engine_path = repo_root / engine_file
    rows = read_json_array(engine_path, engine_file)
    rows_by_pn = build_local_pn_index(rows)
    summary = make_engine_summary(engine_file)
    fallback_engine = normalize_engine_token(engine_file)
    book_counter = Counter()

    for row in rows:
        summary['processed'] += 1
        current_fg = text(row.get('fg_fgs_final'))
        if current_fg:
            summary['untouched_existing'] += 1
            continue

        summary['empty_fg_fgs_final'] += 1
        bom_raw = normalize_spaces(row.get('bom_final'))
        if not bom_raw:
            summary['without_bom'] += 1
            add_example(summary['examples_bom_not_found'], {
                'id': text(row.get('ID')),
                'pn_final': text(row.get('pn_final') or row.get('PART NO.')),
                'status': 'NO_BOM',
            })
            continue

        summary['with_bom'] += 1
        bom_key = normalize_bom(bom_raw)

        if bom_key in catalog['conflicts']:
            summary['bom_conflict_rows'] += 1
            add_example(summary['examples_bom_conflict'], {
                'id': text(row.get('ID')),
                'pn_final': text(row.get('pn_final') or row.get('PART NO.')),
                'bom_final': bom_raw,
                'conflicting_fg_fgs': [entry['fg_fgs_final'] for entry in catalog['conflicts'][bom_key]],
            })
            continue

        mapped_fg = catalog['entries'].get(bom_key)
        if not mapped_fg:
            local_pn_hit = resolve_fg_from_bom_via_local_pn(rows_by_pn, bom_key, max_hops=2)
            if local_pn_hit:
                mapped_fg = local_pn_hit['fg_fgs_final']
                summary['resolved_via_local_pn'] += 1
            else:
                summary['bom_not_found'] += 1
                add_example(summary['examples_bom_not_found'], {
                    'id': text(row.get('ID')),
                    'pn_final': text(row.get('pn_final') or row.get('PART NO.')),
                    'bom_final': bom_raw,
                    'status': 'BOM_NOT_FOUND',
                })
                continue

        summary['bom_found'] += 1
        summary['fillable'] += 1
        summary['proposed_changes'] += 1
        book_counter[text(row.get('book_set')) or summary['engine']] += 1

        next_values = derive_fg_values(row, mapped_fg, fg_master_index, fallback_engine)
        add_example(summary['examples_fillable'], {
            'id': text(row.get('ID')),
            'pn_final': text(row.get('pn_final') or row.get('PART NO.')),
            'bom_final': bom_raw,
            'next_fg_fgs_final': next_values['fg_fgs_final'],
            'next_fg_code': next_values['fg_code'],
            'next_fgs_description': next_values['fgs_description'],
            'next_fgs_code_description': next_values['fgs_code_description'],
        })

        if write and apply_updates(row, next_values):
            summary['write_changes'] += 1

    if write and summary['write_changes'] > 0:
        if backup:
            backup_path = Path(f'{engine_path}.bak.{datetime.now().strftime("%Y%m%d-%H%M%S")}')
            shutil.copy2(engine_path, backup_path)
            summary['backup_path'] = str(backup_path)
        write_json_array(engine_path, rows)

    summary['book_breakdown'] = dict(sorted(book_counter.items()))
    return summary


def build_report(summary, report_path):
    totals = summary['totals']
    current_coverage = 0.0
    projected_coverage = 0.0
    if totals['processed'] > 0:
        current_coverage = ((totals['processed'] - totals['empty_fg_fgs_final']) / totals['processed']) * 100.0
        projected_coverage = ((totals['processed'] - totals['empty_fg_fgs_final'] + totals['fillable']) / totals['processed']) * 100.0

    lines = [
        '# FG/FGS Fill Missing Dry-Run Report',
        '',
        f'Generated at: {summary["generated_at"]}',
        f'Mode: {summary["mode"]}',
        f'Engine scope: {summary["engine_scope"]}',
        f'Catalog source: {summary["catalog_source"]}',
        f'Catalog path: {summary["catalog_path"]}',
        f'FG catalog path: {summary["fg_catalog_path"]}',
        '',
        '## Totals',
        '',
        f'- registros procesados: {totals["processed"]}',
        f'- registros con fg_fgs_final vacío: {totals["empty_fg_fgs_final"]}',
        f'- registros con BOM: {totals["with_bom"]}',
        f'- registros sin BOM: {totals["without_bom"]}',
        f'- BOM encontrados: {totals["bom_found"]}',
        f'- BOM no encontrados: {totals["bom_not_found"]}',
        f'- resueltos por fallback local BOM->PN (max 2 hops): {totals["resolved_via_local_pn"]}',
        f'- registros rellenables: {totals["fillable"]}',
        f'- registros que no se tocarían porque ya tenían valor: {totals["untouched_existing"]}',
        f'- conflictos BOM → FG/FGS (filas afectadas): {totals["bom_conflict_rows"]}',
        f'- conflictos BOM → FG/FGS (BOMs únicos del catálogo): {summary["catalog_conflicts"]}',
        '',
        '## Coverage Estimate',
        '',
        f'- cobertura actual estimada: {current_coverage:.2f}%',
        f'- cobertura nueva estimada: {projected_coverage:.2f}%',
        f'- incremento estimado: {projected_coverage - current_coverage:.2f} puntos',
        '',
        '## Safety Checks',
        '',
        '- Solo propone cambios en registros con fg_fgs_final vacío: YES',
        '- No propone sobrescribir valores existentes: YES',
        '- Si no hay BOM o no hay match, deja vacío: YES',
        '',
        '## Cambios propuestos por libro',
        '',
    ]

    if summary['book_breakdown_total']:
        for book_name, count in sorted(summary['book_breakdown_total'].items()):
            lines.append(f'- {book_name}: {count}')
    else:
        lines.append('- No hay cambios propuestos.')

    lines.extend(['', '## Muestras rellenables', ''])
    if summary['sample_fillable']:
        for example in summary['sample_fillable']:
            lines.append(
                f'- {example["engine"]} | ID {example["id"]} | PN {example["pn_final"]} | BOM {example["bom_final"]} -> FG/FGS {example["next_fg_fgs_final"]}'
            )
    else:
        lines.append('- No hay muestras rellenables.')

    lines.extend(['', '## Muestras BOM_NOT_FOUND', ''])
    if summary['sample_bom_not_found']:
        for example in summary['sample_bom_not_found']:
            lines.append(
                f'- {example["engine"]} | ID {example["id"]} | PN {example["pn_final"]} | BOM {example.get("bom_final", "(empty)")} | {example["status"]}'
            )
    else:
        lines.append('- No hay muestras BOM_NOT_FOUND.')

    lines.extend(['', '## Muestras de conflicto', ''])
    if summary['sample_conflicts']:
        for example in summary['sample_conflicts']:
            lines.append(
                f'- {example["engine"]} | ID {example["id"]} | PN {example["pn_final"]} | BOM {example["bom_final"]} | conflicts: {", ".join(example["conflicting_fg_fgs"])}'
            )
    else:
        lines.append('- No hay muestras de conflicto.')

    lines.extend(['', '## Decision', '', '- No ejecutar `--write` hasta aprobar este reporte.'])
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text('\n'.join(lines) + '\n', encoding='utf8')


def parse_args(argv):
    parser = argparse.ArgumentParser(description='Fill missing fg_fgs_final by bom_final without overwriting existing values.')
    parser.add_argument('--engine', default='ALL', help='12V4000M40A | ALL')
    parser.add_argument('--dry-run', action='store_true', help='Run without writing engine files')
    parser.add_argument('--write', action='store_true', help='Write changes to engine files')
    parser.add_argument('--backup', action='store_true', help='Create backup files before writing')
    parser.add_argument('--catalog', default=str(DEFAULT_CATALOG_PATH), help='BOM → FG/FGS catalog path')
    parser.add_argument('--fg-catalog', default=str(DEFAULT_FG_CATALOG_PATH), help='FG catalog path')
    args = parser.parse_args(argv)
    if args.write and args.dry_run:
        raise ValueError('Use either --dry-run or --write, not both.')
    if not args.write:
        args.dry_run = True
    return args


def main(argv=None):
    args = parse_args(sys.argv[1:] if argv is None else argv)
    repo_root = Path(__file__).resolve().parent.parent
    catalog_path = resolve_path(repo_root, args.catalog, DEFAULT_CATALOG_PATH)
    fg_catalog_path = resolve_path(repo_root, args.fg_catalog, DEFAULT_FG_CATALOG_PATH)
    if not fg_catalog_path.exists():
        raise FileNotFoundError(f'No existe el FG catalog: {fg_catalog_path}')

    fg_master_rows = read_json_array(fg_catalog_path, fg_catalog_path.name)
    fg_master_index = build_fg_master_index(fg_master_rows)
    engine_files = resolve_engine_files(repo_root, args.engine)
    catalog = load_catalog(repo_root, catalog_path)

    totals = {
        'processed': 0,
        'empty_fg_fgs_final': 0,
        'with_bom': 0,
        'without_bom': 0,
        'bom_found': 0,
        'bom_not_found': 0,
        'resolved_via_local_pn': 0,
        'fillable': 0,
        'untouched_existing': 0,
        'bom_conflict_rows': 0,
    }
    engine_summaries = []
    book_breakdown_total = Counter()
    sample_fillable = []
    sample_bom_not_found = []
    sample_conflicts = []

    for engine_file in engine_files:
        engine_summary = process_engine_file(
            repo_root=repo_root,
            engine_file=engine_file,
            catalog=catalog,
            fg_master_index=fg_master_index,
            write=args.write,
            backup=args.backup,
        )
        engine_summaries.append(engine_summary)
        for key in totals:
            totals[key] += engine_summary[key]
        book_breakdown_total.update(engine_summary['book_breakdown'])
        for example in engine_summary['examples_fillable']:
            add_example(sample_fillable, {'engine': engine_summary['engine'], **example}, limit=20)
        for example in engine_summary['examples_bom_not_found']:
            add_example(sample_bom_not_found, {'engine': engine_summary['engine'], **example}, limit=20)
        for example in engine_summary['examples_bom_conflict']:
            add_example(sample_conflicts, {'engine': engine_summary['engine'], **example}, limit=20)

    summary = {
        'generated_at': datetime.utcnow().isoformat(timespec='seconds') + 'Z',
        'mode': 'WRITE' if args.write else 'DRY-RUN',
        'engine_scope': normalize_engine_token(args.engine) or 'ALL',
        'catalog_source': catalog['mode'],
        'catalog_path': str(catalog_path),
        'fg_catalog_path': str(fg_catalog_path),
        'catalog_entries': len(catalog['entries']),
        'catalog_conflicts': len(catalog['conflicts']),
        'totals': totals,
        'engines': engine_summaries,
        'book_breakdown_total': dict(sorted(book_breakdown_total.items())),
        'sample_fillable': sample_fillable,
        'sample_bom_not_found': sample_bom_not_found,
        'sample_conflicts': sample_conflicts,
    }

    build_report(summary, repo_root / REPORT_PATH)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f'FILL_MISSING_FG_FGS_BY_BOM_FAILED: {error}', file=sys.stderr)
        raise SystemExit(1)