#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Filtra els registres d'un CSV nou que tenen algun canvi respecte a un CSV antic.

Per defecte:
- compara per Id
- ignora fecha_version, perquè si no canviaria tot el fitxer
- exporta:
  1) CSV amb les files noves canviades
  2) CSV detallat amb camp, valor antic i valor nou
  3) TXT resum

Exemple:
python3 scripts/filter_changed_csv_rows.py \
  --new data/output/wordpress/milu_wp_new_import.csv \
  --old data/output/wordpress/milu_wp_new_import_old.csv \
  --out data/output/wordpress/changed_rows.csv
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Iterable

import pandas as pd


DEFAULT_IGNORE_COLUMNS = ["fecha_version"]


def detect_separator(path: Path) -> str:
    sample = path.read_text(encoding="utf-8-sig", errors="replace")[:8192]
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ";"


def read_csv(path: Path) -> tuple[pd.DataFrame, str]:
    sep = detect_separator(path)
    df = pd.read_csv(
        path,
        sep=sep,
        dtype=str,
        encoding="utf-8-sig",
        keep_default_na=False,
    )
    return df, sep


def normalize_columns_arg(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(",") if part.strip()]


def build_changed_outputs(
    new_df: pd.DataFrame,
    old_df: pd.DataFrame,
    key: str,
    ignore_columns: Iterable[str],
) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    if key not in new_df.columns:
        raise ValueError(f"La clau '{key}' no existeix al CSV nou")
    if key not in old_df.columns:
        raise ValueError(f"La clau '{key}' no existeix al CSV antic")

    if new_df[key].duplicated().any():
        duplicated = new_df.loc[new_df[key].duplicated(), key].head(10).tolist()
        raise ValueError(f"El CSV nou té claus duplicades a '{key}': {duplicated}")
    if old_df[key].duplicated().any():
        duplicated = old_df.loc[old_df[key].duplicated(), key].head(10).tolist()
        raise ValueError(f"El CSV antic té claus duplicades a '{key}': {duplicated}")

    ignore = set(ignore_columns)
    common_columns = [c for c in new_df.columns if c in old_df.columns]
    compare_columns = [c for c in common_columns if c != key and c not in ignore]

    merged = new_df.merge(
        old_df,
        on=key,
        how="outer",
        suffixes=("_new", "_old"),
        indicator=True,
    )

    changed_keys: set[str] = set()
    detail_rows: list[dict] = []

    # Registres nous
    for row in merged.loc[merged["_merge"] == "left_only"].to_dict("records"):
        changed_keys.add(row[key])
        detail_rows.append(
            {
                key: row[key],
                "change_type": "new_record",
                "column": "",
                "old_value": "",
                "new_value": "",
            }
        )

    # Registres eliminats
    for row in merged.loc[merged["_merge"] == "right_only"].to_dict("records"):
        changed_keys.add(row[key])
        detail_rows.append(
            {
                key: row[key],
                "change_type": "deleted_record",
                "column": "",
                "old_value": "",
                "new_value": "",
            }
        )

    both = merged["_merge"] == "both"
    changed_by_column: dict[str, int] = {}

    for col in compare_columns:
        new_col = f"{col}_new"
        old_col = f"{col}_old"
        diff_mask = both & (merged[new_col].fillna("") != merged[old_col].fillna(""))
        count = int(diff_mask.sum())
        if count:
            changed_by_column[col] = count

        for row in merged.loc[diff_mask, [key, old_col, new_col]].to_dict("records"):
            changed_keys.add(row[key])
            detail_rows.append(
                {
                    key: row[key],
                    "change_type": "changed_field",
                    "column": col,
                    "old_value": row[old_col],
                    "new_value": row[new_col],
                }
            )

    changed_new_rows = new_df[new_df[key].isin(changed_keys)].copy()

    # Els eliminats no existeixen al CSV nou, per tant els afegim al detall però no a changed_new_rows.
    deleted_keys = set(merged.loc[merged["_merge"] == "right_only", key].tolist())

    summary = {
        "new_rows": int(len(new_df)),
        "old_rows": int(len(old_df)),
        "matched_rows": int((merged["_merge"] == "both").sum()),
        "new_records": int((merged["_merge"] == "left_only").sum()),
        "deleted_records": int((merged["_merge"] == "right_only").sum()),
        "changed_or_new_rows_exported": int(len(changed_new_rows)),
        "changed_or_deleted_keys_total": int(len(changed_keys | deleted_keys)),
        "ignored_columns": sorted(ignore),
        "changed_by_column": changed_by_column,
    }

    details_df = pd.DataFrame(
        detail_rows,
        columns=[key, "change_type", "column", "old_value", "new_value"],
    )

    return changed_new_rows, details_df, summary


def write_summary(path: Path, summary: dict) -> None:
    lines = [
        "CSV comparison summary",
        "======================",
        "",
        f"New rows: {summary['new_rows']}",
        f"Old rows: {summary['old_rows']}",
        f"Matched rows: {summary['matched_rows']}",
        f"New records: {summary['new_records']}",
        f"Deleted records: {summary['deleted_records']}",
        f"Changed/new rows exported: {summary['changed_or_new_rows_exported']}",
        f"Changed/deleted keys total: {summary['changed_or_deleted_keys_total']}",
        f"Ignored columns: {', '.join(summary['ignored_columns']) or '(none)'}",
        "",
        "Changed fields by column:",
    ]

    changed_by_column = summary["changed_by_column"]
    if changed_by_column:
        for col, count in sorted(changed_by_column.items(), key=lambda item: (-item[1], item[0])):
            lines.append(f"- {col}: {count}")
    else:
        lines.append("- No field changes")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--new", required=True, help="CSV nou")
    parser.add_argument("--old", required=True, help="CSV antic")
    parser.add_argument("--out", required=True, help="CSV sortida amb files noves canviades")
    parser.add_argument("--key", default="Id", help="Columna clau per comparar. Per defecte: Id")
    parser.add_argument(
        "--ignore-columns",
        default=",".join(DEFAULT_IGNORE_COLUMNS),
        help="Columnes a ignorar separades per coma. Per defecte: fecha_version",
    )
    parser.add_argument(
        "--details-out",
        default=None,
        help="CSV detallat de diferències. Per defecte: <out>_details.csv",
    )
    parser.add_argument(
        "--summary-out",
        default=None,
        help="TXT resum. Per defecte: <out>_summary.txt",
    )
    args = parser.parse_args()

    new_path = Path(args.new)
    old_path = Path(args.old)
    out_path = Path(args.out)
    details_path = Path(args.details_out) if args.details_out else out_path.with_name(out_path.stem + "_details.csv")
    summary_path = Path(args.summary_out) if args.summary_out else out_path.with_name(out_path.stem + "_summary.txt")

    ignore_columns = normalize_columns_arg(args.ignore_columns)

    new_df, sep = read_csv(new_path)
    old_df, _ = read_csv(old_path)

    changed_rows, details_df, summary = build_changed_outputs(
        new_df=new_df,
        old_df=old_df,
        key=args.key,
        ignore_columns=ignore_columns,
    )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    details_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)

    changed_rows.to_csv(out_path, sep=sep, index=False, encoding="utf-8-sig")
    details_df.to_csv(details_path, sep=sep, index=False, encoding="utf-8-sig")
    write_summary(summary_path, summary)

    print(f"OK changed rows: {len(changed_rows)} -> {out_path}")
    print(f"OK details: {len(details_df)} -> {details_path}")
    print(f"OK summary -> {summary_path}")


if __name__ == "__main__":
    main()
