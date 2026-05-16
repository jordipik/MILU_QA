#!/usr/bin/env python3
"""Compare legacy-like export semantics vs normalized semantic rules.

This script inspects all engine rows and writes a concise report to:
- docs/export_semantic_compare.md
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
ENGINE_FILES = [
    "engine_12V4000M40A.json",
    "engine_12V4000M53.json",
    "engine_12V4000M70.json",
    "engine_16V4000M61.json",
    "engine_16V4000M73.json",
    "engine_16V4000M73L.json",
    "engine_16V4000M90.json",
    "engine_20V4000M93.json",
    "engine_20V4000M93L.json",
]
REPORT_PATH = REPO_ROOT / "docs" / "export_semantic_compare.md"


@dataclass
class RowDecision:
    pn: str
    row_id: str
    file_name: str
    semantic_type: str
    status_type: str
    hierarchy: str
    status: str
    qa_estado: str
    qa_accion: str


def text(value) -> str:
    return str(value if value is not None else "").strip()


def key(value) -> str:
    return text(value).lower()


def read_rows() -> List[Tuple[str, Dict[str, object]]]:
    rows: List[Tuple[str, Dict[str, object]]] = []
    for file_name in ENGINE_FILES:
        file_path = REPO_ROOT / file_name
        try:
            payload = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception:
            payload = []
        if not isinstance(payload, list):
            continue
        for row in payload:
            if isinstance(row, dict):
                rows.append((file_name, row))
    return rows


def get_pn(row: Dict[str, object]) -> str:
    return text(row.get("pn_final") or row.get("PART NO.") or row.get("pn"))


def semantic_type(row: Dict[str, object]) -> str:
    hierarchy = text(row.get("hierarchie_final") or row.get("sust_hierarchie") or row.get("SUST_TIPO"))
    return "Superseded" if hierarchy == "Superseded" else "New"


def legacy_status_type(row: Dict[str, object]) -> str:
    # Legacy-sensitive baseline intentionally tied to status only.
    status = text(row.get("status"))
    return "Superseded" if status == "Superseded" else "New"


def is_semantic_exportable(row: Dict[str, object]) -> bool:
    return key(row.get("qa_revision_estado")) == "ok" and key(row.get("qa_revision_accion")) == "importar"


def collect_decisions(rows: Iterable[Tuple[str, Dict[str, object]]]) -> List[RowDecision]:
    decisions: List[RowDecision] = []
    for file_name, row in rows:
        pn = get_pn(row)
        if not pn:
            continue
        decisions.append(
            RowDecision(
                pn=pn,
                row_id=text(row.get("ID")),
                file_name=file_name,
                semantic_type=semantic_type(row),
                status_type=legacy_status_type(row),
                hierarchy=text(row.get("hierarchie_final") or row.get("sust_hierarchie") or row.get("SUST_TIPO")),
                status=text(row.get("status")),
                qa_estado=text(row.get("qa_revision_estado")),
                qa_accion=text(row.get("qa_revision_accion")),
            )
        )
    return decisions


def build_report(decisions: List[RowDecision]) -> str:
    exportable = [d for d in decisions if d.qa_estado.lower() == "ok" and d.qa_accion.lower() == "importar"]

    sem_counter = Counter(d.semantic_type for d in exportable)
    status_counter = Counter(d.status_type for d in exportable)

    changed = [d for d in exportable if d.semantic_type != d.status_type]

    conflicts = [
        d
        for d in decisions
        if d.hierarchy == "Superseded" and d.status and d.status != "Superseded"
    ]

    ambiguous = [
        d
        for d in decisions
        if not d.hierarchy and not d.status
    ]

    status_superseded_non_semantic = [
        d
        for d in decisions
        if d.status == "Superseded" and d.semantic_type != "Superseded"
    ]

    lines: List[str] = []
    lines.append("# Export Semantic Compare")
    lines.append("")
    lines.append("This report compares status-based legacy classification with semantic classification.")
    lines.append("")
    lines.append("## Scope")
    lines.append(f"- Total rows with PN: {len(decisions)}")
    lines.append(f"- Exportable rows by semantic QA gate (ok/importar): {len(exportable)}")
    lines.append("")
    lines.append("## Totals (Exportable Rows)")
    lines.append(f"- Semantic New: {sem_counter.get('New', 0)}")
    lines.append(f"- Semantic Superseded: {sem_counter.get('Superseded', 0)}")
    lines.append(f"- Legacy status New: {status_counter.get('New', 0)}")
    lines.append(f"- Legacy status Superseded: {status_counter.get('Superseded', 0)}")
    lines.append("")
    lines.append("## Differences")
    lines.append(f"- Distinct records with different type (semantic vs status): {len(changed)}")
    lines.append(f"- Conflicts (hierarchy Superseded but status not Superseded): {len(conflicts)}")
    lines.append(f"- Ambiguous (no hierarchy and no status): {len(ambiguous)}")
    lines.append(f"- Legacy status impact (status Superseded but semantic not): {len(status_superseded_non_semantic)}")
    lines.append("")
    lines.append("## Sample Differences (up to 25)")
    if not changed:
        lines.append("- None")
    else:
        for item in changed[:25]:
            lines.append(
                "- "
                f"{item.file_name} | ID={item.row_id or '-'} | PN={item.pn} | "
                f"semantic={item.semantic_type} | status_based={item.status_type} | "
                f"hierarchy={item.hierarchy or '-'} | status={item.status or '-'}"
            )

    return "\n".join(lines) + "\n"


def main() -> None:
    rows = read_rows()
    decisions = collect_decisions(rows)
    report = build_report(decisions)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"OK report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
