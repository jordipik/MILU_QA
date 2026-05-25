"""Extract full issue lists for book_preview -> engine matching.

Generates a complete, non-truncated report of problematic records:
- not_found: no engine candidate for (source_page, pos_pdf)
- ambiguous: multiple candidates and tie-break by pn_pdf is not unique
- problem: malformed preview data or missing engine file

Usage:
  python extract_book_preview_issues.py
  python extract_book_preview_issues.py --only 12V4000M40A 12V4000M53
  python extract_book_preview_issues.py --output reports/book_preview_issues_full.json
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from apply_book_preview_to_engine import _norm, build_engine_index, select_engine_row


REPO_ROOT = Path(__file__).resolve().parent
PREVIEW_RE = re.compile(r"^book_preview_(.+)\.json$", re.IGNORECASE)


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _discover(previews_dir: Path, only: list[str] | None) -> list[tuple[str, Path, Path]]:
    only_set = {x.strip() for x in only} if only else None
    out: list[tuple[str, Path, Path]] = []
    for preview in sorted(previews_dir.glob("book_preview_*.json")):
        m = PREVIEW_RE.match(preview.name)
        if not m:
            continue
        model = m.group(1)
        if only_set and model not in only_set:
            continue
        out.append((model, preview, REPO_ROOT / f"engine_{model}.json"))
    return out


def _add_issue(
    issues: list[dict[str, Any]],
    *,
    model: str,
    issue_type: str,
    reason: str,
    page: Any = None,
    pos: Any = None,
    pn_pdf: Any = None,
    page_index: int | None = None,
    row_index: int | None = None,
    candidate_count: int | None = None,
) -> None:
    issues.append(
        {
            "model": model,
            "issue_type": issue_type,
            "reason": reason,
            "page": page,
            "pos": pos,
            "pn_pdf": pn_pdf,
            "page_index": page_index,
            "row_index": row_index,
            "candidate_count": candidate_count,
        }
    )


def analyze_one(model: str, preview_path: Path, engine_path: Path) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    preview_rows = 0

    if not engine_path.exists():
        _add_issue(
            issues,
            model=model,
            issue_type="problem",
            reason="missing_engine_file",
        )
        return {"model": model, "preview_rows": 0, "issues": issues}

    preview = _load_json(preview_path)
    engine_rows = _load_json(engine_path)
    if not isinstance(engine_rows, list):
        _add_issue(
            issues,
            model=model,
            issue_type="problem",
            reason="engine_not_list",
        )
        return {"model": model, "preview_rows": 0, "issues": issues}

    pages = preview.get("pages", []) if isinstance(preview, dict) else []
    if not isinstance(pages, list):
        _add_issue(
            issues,
            model=model,
            issue_type="problem",
            reason="preview_pages_not_list",
        )
        return {"model": model, "preview_rows": 0, "issues": issues}

    idx = build_engine_index(engine_rows)

    for page_index, page_block in enumerate(pages):
        if not isinstance(page_block, dict):
            _add_issue(
                issues,
                model=model,
                issue_type="problem",
                reason="invalid_page_block",
                page_index=page_index,
            )
            continue

        raw_page = page_block.get("source_page")
        try:
            page_num = int(raw_page)
        except (TypeError, ValueError):
            _add_issue(
                issues,
                model=model,
                issue_type="problem",
                reason="invalid_source_page",
                page=raw_page,
                page_index=page_index,
            )
            continue

        rows = page_block.get("rows", [])
        if not isinstance(rows, list):
            _add_issue(
                issues,
                model=model,
                issue_type="problem",
                reason="page_rows_not_list",
                page=page_num,
                page_index=page_index,
            )
            continue

        for row_index, row in enumerate(rows):
            preview_rows += 1
            if not isinstance(row, dict):
                _add_issue(
                    issues,
                    model=model,
                    issue_type="problem",
                    reason="invalid_row",
                    page=page_num,
                    page_index=page_index,
                    row_index=row_index,
                )
                continue

            pos = _norm(row.get("pos_pdf"))
            pn_pdf = _norm(row.get("pn_pdf"))
            if not pos:
                _add_issue(
                    issues,
                    model=model,
                    issue_type="problem",
                    reason="missing_pos_pdf",
                    page=page_num,
                    pn_pdf=pn_pdf,
                    page_index=page_index,
                    row_index=row_index,
                )
                continue

            engine_i, status = select_engine_row(idx, engine_rows, page_num, pos, pn_pdf)
            if status == "not-found":
                candidate_count = len(idx.get((page_num, pos), []))
                _add_issue(
                    issues,
                    model=model,
                    issue_type="not_found",
                    reason="no_candidate_for_page_pos",
                    page=page_num,
                    pos=pos,
                    pn_pdf=pn_pdf,
                    page_index=page_index,
                    row_index=row_index,
                    candidate_count=candidate_count,
                )
            elif status == "ambiguous" or engine_i is None:
                candidate_count = len(idx.get((page_num, pos), []))
                _add_issue(
                    issues,
                    model=model,
                    issue_type="ambiguous",
                    reason="multiple_candidates_no_unique_pn_tiebreak",
                    page=page_num,
                    pos=pos,
                    pn_pdf=pn_pdf,
                    page_index=page_index,
                    row_index=row_index,
                    candidate_count=candidate_count,
                )

    return {"model": model, "preview_rows": preview_rows, "issues": issues}


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    all_issues = [it for r in results for it in r["issues"]]
    totals = {
        "models": len(results),
        "preview_rows": sum(r["preview_rows"] for r in results),
        "issues_total": len(all_issues),
        "not_found": sum(1 for x in all_issues if x["issue_type"] == "not_found"),
        "ambiguous": sum(1 for x in all_issues if x["issue_type"] == "ambiguous"),
        "problem": sum(1 for x in all_issues if x["issue_type"] == "problem"),
    }
    by_model: dict[str, dict[str, int]] = {}
    for r in results:
        model = r["model"]
        issues = r["issues"]
        by_model[model] = {
            "preview_rows": r["preview_rows"],
            "issues_total": len(issues),
            "not_found": sum(1 for x in issues if x["issue_type"] == "not_found"),
            "ambiguous": sum(1 for x in issues if x["issue_type"] == "ambiguous"),
            "problem": sum(1 for x in issues if x["issue_type"] == "problem"),
        }
    return {"totals": totals, "by_model": by_model, "issues": all_issues}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--previews-dir", default="data/01-engine_preview", help="Folder with book_preview_*.json")
    parser.add_argument("--only", nargs="*", help="Optional model filters")
    parser.add_argument("--output", default=None, help="Output JSON report path")
    args = parser.parse_args()

    previews_dir = Path(args.previews_dir)
    if not previews_dir.is_absolute():
        previews_dir = REPO_ROOT / previews_dir
    previews_dir = previews_dir.resolve()

    if not previews_dir.is_dir():
        print(f"[ERROR] Invalid previews folder: {previews_dir}")
        return 2

    targets = _discover(previews_dir, args.only)
    if not targets:
        print(f"[WARN] No book_preview_*.json found in {previews_dir}")
        return 0

    results = [analyze_one(model, preview, engine) for model, preview, engine in targets]
    report = summarize(results)
    report["generated_at"] = datetime.now().isoformat(timespec="seconds")
    report["previews_dir"] = str(previews_dir)

    if args.output:
        output_path = Path(args.output)
        if not output_path.is_absolute():
            output_path = REPO_ROOT / output_path
    else:
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_path = REPO_ROOT / "reports" / f"book_preview_issues_full_{stamp}.json"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.write("\n")

    t = report["totals"]
    print("=" * 70)
    print(f"Models analyzed : {t['models']}")
    print(f"Preview rows    : {t['preview_rows']}")
    print(f"Issues total    : {t['issues_total']}")
    print(f"  not_found     : {t['not_found']}")
    print(f"  ambiguous     : {t['ambiguous']}")
    print(f"  problem       : {t['problem']}")
    print(f"Report          : {output_path}")
    print("=" * 70)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
