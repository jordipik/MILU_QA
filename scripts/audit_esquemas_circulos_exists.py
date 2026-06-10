"""
audit_esquemas_circulos_exists.py

Read-only audit: checks whether files referenced in 'esquemas_circulos'
actually exist in the physical esquemas_pos_circulos folder.

DOES NOT modify any JSON, delete files, or regenerate images.
"""

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE_DIR = REPO_ROOT / "esquemas_pos_circulos"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data" / "output" / "audit_esquemas_circulos"

# JSON search patterns (relative to REPO_ROOT), in priority order
DEFAULT_JSON_PATTERNS = [
    "engine_*.json",
    "data/output/engine_*.json",
    "data/output/rebuild/engine_rebuild_*.json",
]

# Fields to extract per record
RECORD_FIELDS = ["ID", "pn_final", "engine_model", "model_type_final",
                 "bom_final", "pos_final", "esquemas_circulos",
                 "PART NO.", "engine", "model"]

CSV_FIELDNAMES = [
    "source_json", "engine", "expected_folder",
    "id", "pn", "pn_final", "bom_final", "pos_final",
    "field", "original_value", "filename", "exists", "physical_path",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def find_json_files(repo_root: Path, engine_filter: Optional[str], extra_json: Optional[str]):
    """Return list of Path objects for all engine JSONs to audit."""
    candidates = []

    if extra_json:
        p = Path(extra_json)
        if not p.is_absolute():
            p = repo_root / p
        if p.is_file():
            candidates.append(p)
        else:
            sys.exit(f"ERROR: JSON not found: {p}")
        return candidates

    for pattern in DEFAULT_JSON_PATTERNS:
        for p in sorted(repo_root.glob(pattern)):
            # Exclude .bak, .backup, .xlsx, etc.
            if p.suffix.lower() != ".json":
                continue
            if any(x in p.name for x in [".bak", ".back", ".backup"]):
                continue
            candidates.append(p)

    if engine_filter:
        norm = engine_filter.strip()
        candidates = [p for p in candidates if norm.lower() in p.name.lower()]

    return candidates


def extract_book(record: dict, json_path: Path) -> Optional[str]:
    """Deduce the book/model name from a record, in priority order."""
    for key in ("engine_model", "engine", "model"):
        val = (record.get(key) or "").strip()
        if val:
            return val
    # From model_type_final: may be multi-value like "12V4000M53, 16V4000M73"
    mtf = (record.get("model_type_final") or "").strip()
    if mtf:
        return mtf.split(",")[0].strip()
    # From filename: engine_12V4000M53.json → 12V4000M53
    name = json_path.stem  # engine_12V4000M53
    if "_" in name:
        return name.split("_", 1)[1]
    return None


def extract_filenames(raw) -> List[str]:
    """
    Extract bare filenames from an esquemas_circulos value.
    Handles: None, "", "file.webp", "url1, url2", ["url1", "url2"]
    """
    if not raw:
        return []

    tokens = []
    if isinstance(raw, list):
        for item in raw:
            tokens.extend(str(item).split(","))
    else:
        tokens = str(raw).split(",")

    result = []
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        # URL → basename
        if token.startswith("http"):
            parsed = urlparse(token)
            token = os.path.basename(parsed.path)
        # Already a bare filename
        if token:
            result.append(token)

    return result


def build_files_index(base_dir: Path) -> Dict[str, Dict[str, str]]:
    """
    Pre-index all files in base_dir by book folder.
    Returns: { "12V4000M53-POS": { "filename.webp": "/full/path/filename.webp", ... }, ... }
    """
    index = {}
    if not base_dir.is_dir():
        return index
    for folder in base_dir.iterdir():
        if not folder.is_dir():
            continue
        files_map = {}
        for root, _dirs, files in os.walk(folder):
            for fname in files:
                files_map[fname] = str(Path(root) / fname)
        index[folder.name] = files_map
    return index


def check_exists(files_index: Dict[str, Dict[str, str]], base_dir: Path,
                 book: str, filename: str) -> Tuple[bool, str]:
    folder_key = f"{book}-POS"
    default_path = str(base_dir / folder_key / filename)
    folder_files = files_index.get(folder_key)
    if folder_files is None:
        return False, default_path
    if filename in folder_files:
        return True, folder_files[filename]
    return False, default_path


# ---------------------------------------------------------------------------
# Core audit
# ---------------------------------------------------------------------------

def audit_json(json_path: Path, base_dir: Path,
               files_index: Dict[str, Dict[str, str]]) -> List[dict]:
    try:
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        print(f"  WARNING: could not read {json_path.name}: {e}", file=sys.stderr)
        return []

    if not isinstance(data, list):
        print(f"  WARNING: {json_path.name} is not a JSON array, skipping.", file=sys.stderr)
        return []

    rows = []
    for record in data:
        if not isinstance(record, dict):
            continue

        raw = record.get("esquemas_circulos")
        filenames = extract_filenames(raw)
        if not filenames:
            continue

        book = extract_book(record, json_path)
        rec_id = record.get("ID") or record.get("id") or ""
        pn = record.get("pn_final") or record.get("PART NO.") or ""
        pn_final = record.get("pn_final") or ""
        bom_final = record.get("bom_final") or record.get("BOM-No.") or ""
        pos_final = record.get("pos_final") or record.get("POS") or ""
        engine_col = book or ""
        expected_folder = f"{book}-POS" if book else "UNKNOWN"

        for filename in filenames:
            if book:
                exists, physical_path = check_exists(files_index, base_dir, book, filename)
            else:
                exists, physical_path = False, "UNKNOWN BOOK"

            rows.append({
                "source_json": json_path.name,
                "engine": engine_col,
                "expected_folder": expected_folder,
                "id": rec_id,
                "pn": pn,
                "pn_final": pn_final,
                "bom_final": bom_final,
                "pos_final": pos_final,
                "field": "esquemas_circulos",
                "original_value": str(raw) if raw else "",
                "filename": filename,
                "exists": "YES" if exists else "NO",
                "physical_path": physical_path,
            })

    return rows


# ---------------------------------------------------------------------------
# Output writers
# ---------------------------------------------------------------------------

def write_csv(path: Path, rows: List[dict]):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES, delimiter=";")
        writer.writeheader()
        writer.writerows(rows)


def write_summary_json(path: Path, summary: dict):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)


def write_summary_txt(path: Path, summary: dict):
    lines = [
        "AUDIT ESQUEMAS_CIRCULOS",
        "=" * 40,
        f"Total referencias revisadas : {summary['total_references_checked']}",
        f"Existentes                  : {summary['existing_count']}",
        f"Faltantes                   : {summary['missing_count']}",
        "",
        "Faltantes por motor:",
    ]
    for engine, count in sorted(summary["missing_by_engine"].items()):
        lines.append(f"  {engine}: {count}")

    lines += ["", "Existentes por motor:"]
    for engine, count in sorted(summary["existing_by_engine"].items()):
        lines.append(f"  {engine}: {count}")

    lines += ["", "Top 10 archivos faltantes:"]
    for item in summary["top_missing_files"][:10]:
        lines.append(f"  [{item['count']:3d}x] {item['filename']}")

    lines += ["", "Top 10 PN con referencias faltantes:"]
    for item in summary["top_missing_pn"][:10]:
        lines.append(f"  [{item['count']:3d}x] {item['pn']}")

    lines += ["", "Output:"]
    for f in summary["output_files"]:
        lines.append(f"  - {f}")

    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")


def build_summary(all_rows: List[dict], output_files: List[str]) -> dict:
    missing = [r for r in all_rows if r["exists"] == "NO"]
    existing = [r for r in all_rows if r["exists"] == "YES"]

    missing_by_engine = defaultdict(int)
    existing_by_engine = defaultdict(int)
    missing_files_count = defaultdict(int)
    missing_pn_count = defaultdict(int)

    for r in missing:
        missing_by_engine[r["engine"]] += 1
        missing_files_count[r["filename"]] += 1
        if r["pn"]:
            missing_pn_count[r["pn"]] += 1

    for r in existing:
        existing_by_engine[r["engine"]] += 1

    top_missing_files = sorted(
        [{"filename": k, "count": v} for k, v in missing_files_count.items()],
        key=lambda x: -x["count"]
    )
    top_missing_pn = sorted(
        [{"pn": k, "count": v} for k, v in missing_pn_count.items()],
        key=lambda x: -x["count"]
    )

    return {
        "total_references_checked": len(all_rows),
        "existing_count": len(existing),
        "missing_count": len(missing),
        "missing_by_engine": dict(missing_by_engine),
        "existing_by_engine": dict(existing_by_engine),
        "top_missing_files": top_missing_files,
        "top_missing_pn": top_missing_pn,
        "output_files": output_files,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Read-only audit of esquemas_circulos physical existence."
    )
    parser.add_argument("--engine", help="Filter by engine model (e.g. 12V4000M53)")
    parser.add_argument("--json", dest="json_file", help="Audit a single JSON file")
    parser.add_argument(
        "--base-dir",
        default=str(DEFAULT_BASE_DIR),
        help=f"Base folder for esquemas_pos_circulos (default: {DEFAULT_BASE_DIR})",
    )
    args = parser.parse_args()

    base_dir = Path(args.base_dir)
    if not base_dir.is_dir():
        sys.exit(f"ERROR: base-dir not found: {base_dir}")

    json_files = find_json_files(REPO_ROOT, args.engine, args.json_file)
    if not json_files:
        sys.exit("ERROR: no engine JSON files found.")

    print(f"AUDIT ESQUEMAS_CIRCULOS")
    print(f"Base dir  : {base_dir}")
    print(f"JSON files: {len(json_files)}")
    for p in json_files:
        print(f"  - {p.relative_to(REPO_ROOT)}")
    print()

    print("Indexing physical files...", end=" ", flush=True)
    files_index = build_files_index(base_dir)
    total_indexed = sum(len(v) for v in files_index.values())
    print(f"{total_indexed} files across {len(files_index)} folders")
    print()

    all_rows = []
    for json_path in json_files:
        rows = audit_json(json_path, base_dir, files_index)
        print(f"  {json_path.name}: {len(rows)} references found")
        all_rows.extend(rows)

    missing_rows = [r for r in all_rows if r["exists"] == "NO"]
    existing_rows = [r for r in all_rows if r["exists"] == "YES"]

    DEFAULT_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    out_missing = DEFAULT_OUTPUT_DIR / "audit_esquemas_circulos_missing.csv"
    out_existing = DEFAULT_OUTPUT_DIR / "audit_esquemas_circulos_existing.csv"
    out_summary_json = DEFAULT_OUTPUT_DIR / "audit_esquemas_circulos_summary.json"
    out_summary_txt = DEFAULT_OUTPUT_DIR / "audit_esquemas_circulos_summary.txt"

    write_csv(out_missing, missing_rows)
    write_csv(out_existing, existing_rows)

    output_files = [
        str(out_missing.relative_to(REPO_ROOT)),
        str(out_existing.relative_to(REPO_ROOT)),
        str(out_summary_json.relative_to(REPO_ROOT)),
        str(out_summary_txt.relative_to(REPO_ROOT)),
    ]

    summary = build_summary(all_rows, output_files)
    write_summary_json(out_summary_json, summary)
    write_summary_txt(out_summary_txt, summary)

    print()
    print("AUDIT ESQUEMAS_CIRCULOS")
    print(f"Total referencias revisadas : {summary['total_references_checked']}")
    print(f"Existentes                  : {summary['existing_count']}")
    print(f"Faltantes                   : {summary['missing_count']}")
    print("Output:")
    for f in output_files:
        print(f"  - {f}")


if __name__ == "__main__":
    main()
