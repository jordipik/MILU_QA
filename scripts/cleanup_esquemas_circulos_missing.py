"""
cleanup_esquemas_circulos_missing.py

Removes invalid references from the 'esquemas_circulos' field in engine JSON files.
Only removes filenames that are confirmed missing by the audit CSV.

READ/WRITE: modifies engine JSON files. Creates backup first.
Does NOT touch: esquemas, ruta_esquemas_pos, exp_imagenes, filename_foto, or any other field.
"""

import argparse
import csv
import json
import os
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_AUDIT_CSV = REPO_ROOT / "data" / "output" / "audit_esquemas_circulos" / "audit_esquemas_circulos_missing.csv"
DEFAULT_BACKUP_DIR = REPO_ROOT / "data" / "backup" / "audit_cleanup_esquemas_circulos"
DEFAULT_REPORT_DIR = REPO_ROOT / "data" / "output" / "audit_esquemas_circulos"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_basename(value: str) -> str:
    """Extract bare filename from a value (URL or bare name)."""
    v = value.strip()
    if v.startswith("http"):
        return os.path.basename(urlparse(v).path)
    return os.path.basename(v)


def split_field(value) -> list:
    """Split a comma-separated esquemas_circulos string into a list of stripped tokens."""
    if not value:
        return []
    if isinstance(value, list):
        return [t.strip() for t in value if str(t).strip()]
    return [t.strip() for t in str(value).split(",") if t.strip()]


def remove_filenames_from_field(current_value, filenames_to_remove: set) -> tuple:
    """
    Remove specific filenames from an esquemas_circulos field value.
    Returns (new_value, removed_count).
    new_value is "" if all references removed, else comma-joined remaining.
    """
    tokens = split_field(current_value)
    kept = []
    removed = 0
    for token in tokens:
        basename = extract_basename(token)
        if basename in filenames_to_remove:
            removed += 1
        else:
            kept.append(token)

    if not kept:
        return "", removed
    # Preserve original separator style (", " with space)
    return ", ".join(kept), removed


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def load_audit_csv(csv_path: Path) -> dict:
    """
    Load missing audit CSV.
    Returns: { source_json_stem: { record_id: [filenames_to_remove] } }
    """
    if not csv_path.is_file():
        sys.exit(f"ERROR: audit CSV not found: {csv_path}")

    mapping = defaultdict(lambda: defaultdict(set))
    with open(csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            source = row.get("source_json", "").strip()
            record_id = row.get("id", "").strip()
            filename = row.get("filename", "").strip()
            if source and record_id and filename:
                # stem: "engine_12V4000M53.json" → key by full name
                mapping[source][record_id].add(filename)

    return {src: dict(ids) for src, ids in mapping.items()}


def backup_engine_json(json_path: Path, backup_dir: Path) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = backup_dir / f"{json_path.name}.bak.{ts}"
    shutil.copy2(json_path, dest)
    return dest


def process_engine_json(json_path: Path, id_to_filenames: dict,
                        dry_run: bool = False) -> dict:
    """
    Load JSON, remove missing filenames from esquemas_circulos, optionally save.
    Returns report dict.
    """
    with open(json_path, encoding="utf-8") as f:
        records = json.load(f)

    if not isinstance(records, list):
        return {"error": f"{json_path.name} is not a JSON array"}

    records_updated = 0
    references_removed = 0
    remaining_missing = 0
    changes = []

    # Build index by ID for fast lookup
    for record in records:
        if not isinstance(record, dict):
            continue
        rec_id = record.get("ID") or record.get("id") or ""
        if rec_id not in id_to_filenames:
            continue

        filenames_to_remove = id_to_filenames[rec_id]
        current = record.get("esquemas_circulos")

        new_value, removed = remove_filenames_from_field(current, filenames_to_remove)

        if removed == 0:
            # Nothing matched — already cleaned or field changed
            remaining_missing += len(filenames_to_remove)
            continue

        references_removed += removed
        records_updated += 1

        # Remaining in field after cleanup
        still_in_field = split_field(new_value)
        still_missing = [f for f in still_in_field
                         if extract_basename(f) in filenames_to_remove]
        remaining_missing += len(still_missing)

        changes.append({
            "id": rec_id,
            "pn_final": record.get("pn_final", ""),
            "pos_final": record.get("pos_final", ""),
            "before": str(current) if current else "",
            "after": new_value,
            "removed_count": removed,
        })

        if not dry_run:
            record["esquemas_circulos"] = new_value if new_value else ""

    if not dry_run and records_updated > 0:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=2)

    return {
        "json_file": json_path.name,
        "records_updated": records_updated,
        "references_removed": references_removed,
        "remaining_missing": remaining_missing,
        "changes": changes,
        "dry_run": dry_run,
    }


# ---------------------------------------------------------------------------
# Report writers
# ---------------------------------------------------------------------------

def write_report(report_dir: Path, engine_reports: list):
    report_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")

    total_updated = sum(r["records_updated"] for r in engine_reports)
    total_removed = sum(r["references_removed"] for r in engine_reports)
    total_remaining = sum(r["remaining_missing"] for r in engine_reports)

    summary = {
        "generated_at": ts,
        "records_updated": total_updated,
        "references_removed": total_removed,
        "remaining_missing": total_remaining,
        "engines": engine_reports,
    }

    json_path = report_dir / "cleanup_esquemas_circulos_report.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    txt_path = report_dir / "cleanup_esquemas_circulos_report.txt"
    lines = [
        "CLEANUP ESQUEMAS_CIRCULOS",
        "=" * 40,
        f"records_updated    : {total_updated}",
        f"references_removed : {total_removed}",
        f"remaining_missing  : {total_remaining}",
        "",
    ]
    for r in engine_reports:
        lines.append(f"[{r['json_file']}]")
        lines.append(f"  records_updated    : {r['records_updated']}")
        lines.append(f"  references_removed : {r['references_removed']}")
        lines.append(f"  remaining_missing  : {r['remaining_missing']}")
        if r.get("backup"):
            lines.append(f"  backup             : {r['backup']}")
        if r.get("dry_run"):
            lines.append("  ** DRY RUN — no changes written **")
        for ch in r.get("changes", []):
            lines.append(f"    {ch['id']} (POS {ch['pos_final']}): [{ch['before']}] → [{ch['after']}]")
        lines.append("")

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return json_path, txt_path


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Remove invalid esquemas_circulos references confirmed by audit CSV."
    )
    parser.add_argument(
        "--audit-csv",
        default=str(DEFAULT_AUDIT_CSV),
        help="Path to audit_esquemas_circulos_missing.csv",
    )
    parser.add_argument(
        "--backup-dir",
        default=str(DEFAULT_BACKUP_DIR),
        help=f"Backup directory (default: {DEFAULT_BACKUP_DIR})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Simulate changes without writing to any JSON.",
    )
    args = parser.parse_args()

    audit_csv = Path(args.audit_csv)
    backup_dir = Path(args.backup_dir)

    print("CLEANUP ESQUEMAS_CIRCULOS")
    if args.dry_run:
        print("** DRY RUN — no files will be modified **")
    print()

    mapping = load_audit_csv(audit_csv)
    print(f"Audit CSV  : {audit_csv.name}")
    print(f"Engines    : {list(mapping.keys())}")
    print()

    engine_reports = []

    for source_json_name, id_to_filenames in mapping.items():
        json_path = REPO_ROOT / source_json_name
        if not json_path.is_file():
            print(f"  WARNING: {source_json_name} not found at {json_path}, skipping.")
            continue

        print(f"Processing : {source_json_name}")
        print(f"  Records to update : {len(id_to_filenames)}")

        backup_path = None
        if not args.dry_run:
            backup_path = backup_engine_json(json_path, backup_dir)
            print(f"  Backup created    : {backup_path.relative_to(REPO_ROOT)}")

        report = process_engine_json(json_path, id_to_filenames, dry_run=args.dry_run)
        report["backup"] = str(backup_path.relative_to(REPO_ROOT)) if backup_path else None

        print(f"  records_updated   : {report['records_updated']}")
        print(f"  references_removed: {report['references_removed']}")
        print(f"  remaining_missing : {report['remaining_missing']}")
        engine_reports.append(report)

    json_report, txt_report = write_report(DEFAULT_REPORT_DIR, engine_reports)

    print()
    print("Report:")
    print(f"  - {json_report.relative_to(REPO_ROOT)}")
    print(f"  - {txt_report.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
