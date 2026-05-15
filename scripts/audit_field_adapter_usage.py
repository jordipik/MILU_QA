#!/usr/bin/env python3
"""Audit direct legacy field reads vs fieldAdapter usage.

Generates:
- data/field_adapter_usage_audit.json
- docs/field_adapter_usage_audit.md
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
REPORT_JSON_PATH = REPO_ROOT / "data" / "field_adapter_usage_audit.json"
REPORT_MD_PATH = REPO_ROOT / "docs" / "field_adapter_usage_audit.md"

INCLUDE_EXTENSIONS = {".js", ".mjs", ".cjs", ".html"}
EXCLUDE_DIR_NAMES = {
    ".git",
    ".venv",
    "node_modules",
    "Copia_seguridad_v1.01",
    "dist",
    "esquemas",
    "esquemas_pos_circulos",
    "json_originales",
    "zz_old",
    "fotos_articulos",
    "fotos_motores",
    "__pycache__",
}

IGNORE_PATH_HINTS = (
    "tests/",
    "docs/",
    "data/field_registry.json",
    "scripts/refactor_json_fields.py",
    "scripts/compare_normalized_engines.py",
    "scripts/audit_field_adapter_usage.py",
)

ADAPTED_ZONES = [
    {
        "zone": "MILU QA tabla compacta",
        "files": ["js/qa-table.js"],
        "status": "integrated-read-only",
    },
    {
        "zone": "PN Review",
        "files": ["js/pn-review.js", "js/pn-review-embedded.js"],
        "status": "integrated-read-only",
    },
    {
        "zone": "qa_articulos / vista analisis",
        "files": ["js/qa-analista-registro.js", "js/qa-articulos-fields.js"],
        "status": "integrated-read-only",
    },
    {
        "zone": "Export Preview / listados New-Superseded",
        "files": ["js/export-wordpress.js", "js/export-preview-fields.js"],
        "status": "integrated-read-only",
    },
]

LEGACY_FIELD_PATTERNS: Dict[str, List[str]] = {
    "PART NO.": [
        r"\b[A-Za-z_$][\w$]*\s*\[\s*['\"]PART\s+NO\.['\"]\s*\]",
    ],
    "Source Page": [
        r"\b[A-Za-z_$][\w$]*\s*\[\s*['\"]Source\s+Page['\"]\s*\]",
    ],
    "DESIGNATION": [
        r"\b[A-Za-z_$][\w$]*\s*\[\s*['\"]DESIGNATION['\"]\s*\]",
    ],
    "status": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*status\b",
    ],
    "sust_status": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*sust_status\b",
    ],
    "sust_hierarchie": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*sust_hierarchie\b",
    ],
    "gesa": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*gesa\b",
    ],
    "normalizado": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*normalizado\b",
    ],
    "dimensions_gesa": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*dimensions_gesa\b",
    ],
    "units": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*units\b",
    ],
    "page4": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*page4\b",
    ],
    "pages": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*pages\b",
    ],
    "book_set": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*book_set\b",
    ],
    "exp_imagenes": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*exp_imagenes\b",
    ],
    "PAG": [
        r"\b[A-Za-z_$][\w$]*\s*\[\s*['\"]PAG['\"]\s*\]",
    ],
    "filename_foto": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*filename_foto\b",
    ],
    "pn_new": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*pn_new\b",
    ],
    "new_part_number": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*new_part_number\b",
    ],
    "sust_new_part_number": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*sust_new_part_number\b",
    ],
    "sust_superseded_list": [
        r"\b[A-Za-z_$][\w$]*\s*(?:\?\.|\.)\s*sust_superseded_list\b",
    ],
}


@dataclass
class Match:
    file: str
    line: int
    field: str
    risk: str
    snippet: str
    rationale: str


def should_scan(path: Path) -> bool:
    if path.suffix.lower() not in INCLUDE_EXTENSIONS:
        return False
    parts = set(path.parts)
    return parts.isdisjoint(EXCLUDE_DIR_NAMES)


def is_ignore_path(rel_path: str) -> bool:
    lower = rel_path.lower()
    if "/legacy/" in f"/{lower}":
        return True
    if lower.startswith("scripts/") and any(token in lower for token in ("compare", "compar", "migr", "migration", "registry")):
        return True
    return any(hint in lower for hint in IGNORE_PATH_HINTS)


def classify_risk(rel_path: str, line: str) -> Tuple[str, str]:
    lower_path = rel_path.lower()
    lower_line = line.lower()

    if is_ignore_path(rel_path):
        return "IGNORE", "tests/docs/registry/migrador/comparador"

    high_path_hints = (
        "server.js",
        "app.js",
        "apply_revision",
        "apply-bulk-revision",
        "save-json",
        "qa_revision",
        "synthetic",
        "generate_synthetic",
        "export_wordpress_milu",
    )
    if any(h in lower_path for h in high_path_hints):
        return "HIGH", "backend/write/export/qa-state/synthetic area"

    if any(token in lower_line for token in ("/save-json", "/apply-revision", "qa_revision_estado", "qa_revision_accion")):
        return "HIGH", "qa state or write endpoint logic"

    medium_path_hints = (
        "preview",
        "qa_milu",
        "qa_lista",
        "analista",
        "pn-review",
        "export-",
        "filtro",
        "filter",
        "counter",
        "count",
    )
    if any(h in lower_path for h in medium_path_hints):
        return "MEDIUM", "filters/counts/preview/read behavior"

    if any(token in lower_line for token in ("filter(", "reduce(", "count", "counter", "preview")):
        return "MEDIUM", "filters/counts/preview logic"

    return "LOW", "visual read/non-critical"


def iter_source_files() -> Iterable[Path]:
    for path in REPO_ROOT.rglob("*"):
        if path.is_file() and should_scan(path):
            yield path


def compile_patterns() -> Dict[str, List[re.Pattern[str]]]:
    return {
        field: [re.compile(p) for p in patterns]
        for field, patterns in LEGACY_FIELD_PATTERNS.items()
    }


def collect_matches() -> Tuple[List[Match], Dict[str, int]]:
    compiled = compile_patterns()
    matches: List[Match] = []
    stats = {"files_scanned": 0, "files_with_matches": 0}

    for file_path in iter_source_files():
        rel_path = file_path.relative_to(REPO_ROOT).as_posix()
        stats["files_scanned"] += 1

        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = file_path.read_text(encoding="latin-1")

        file_has_match = False
        for idx, raw_line in enumerate(content.splitlines(), start=1):
            line = raw_line.strip()
            for field, regexes in compiled.items():
                if any(regex.search(raw_line) for regex in regexes):
                    risk, rationale = classify_risk(rel_path, raw_line)
                    matches.append(
                        Match(
                            file=rel_path,
                            line=idx,
                            field=field,
                            risk=risk,
                            snippet=line[:220],
                            rationale=rationale,
                        )
                    )
                    file_has_match = True

        if file_has_match:
            stats["files_with_matches"] += 1

    return matches, stats


def to_top(counter: Counter, limit: int = 15) -> List[Dict[str, int]]:
    return [{"name": name, "count": count} for name, count in counter.most_common(limit)]


def build_pending_zones(matches: List[Match]) -> List[Dict[str, str]]:
    adapted_files = {f for zone in ADAPTED_ZONES for f in zone["files"]}
    pending = {}
    for m in matches:
        if m.risk == "IGNORE":
            continue
        if m.file in adapted_files:
            continue
        if m.risk in ("MEDIUM", "HIGH"):
            pending[m.file] = m.risk

    out = [
        {"file": file, "risk": risk}
        for file, risk in sorted(pending.items(), key=lambda item: (item[1], item[0]))
    ]
    return out[:25]


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def build_markdown_report(payload: dict) -> str:
    summary = payload["summary"]
    files = payload["top_files"]
    fields = payload["top_legacy_fields"]

    def md_list(items: List[Dict[str, object]], key: str = "name") -> str:
        if not items:
            return "- Sin datos"
        return "\n".join(f"- {item[key]}: {item['count']}" for item in items)

    adapted = "\n".join(
        f"- {zone['zone']}: {', '.join(zone['files'])}" for zone in payload["adapted_zones"]
    )
    pending = payload["pending_zones"]
    pending_md = "\n".join(
        f"- {item['file']} ({item['risk']})" for item in pending[:20]
    ) if pending else "- Sin pendientes MEDIUM/HIGH detectados"

    high_examples = [m for m in payload["matches"] if m["risk"] == "HIGH"][:20]
    high_examples_md = (
        "\n".join(
            f"- {m['file']}:{m['line']} -> {m['field']} ({m['rationale']})"
            for m in high_examples
        )
        if high_examples
        else "- No se detectaron matches HIGH fuera de IGNORE"
    )

    recommendations_md = "\n".join(f"- {item}" for item in payload["recommendations"])

    return f"""# Field Adapter Usage Audit

Fecha: {summary['generated_at']}

## Resumen global

- Archivos escaneados: {summary['files_scanned']}
- Archivos con accesos legacy directos: {summary['files_with_matches']}
- Total de accesos legacy detectados: {summary['matches_total']}
- LOW: {summary['risk_counts'].get('LOW', 0)}
- MEDIUM: {summary['risk_counts'].get('MEDIUM', 0)}
- HIGH: {summary['risk_counts'].get('HIGH', 0)}
- IGNORE: {summary['risk_counts'].get('IGNORE', 0)}

## Archivos con mas accesos legacy

{md_list(files)}

## Campos legacy mas usados

{md_list(fields)}

## Zonas ya adaptadas

{adapted}

## Zonas pendientes

{pending_md}

## Riesgos HIGH (muestra)

{high_examples_md}

## Recomendaciones

{recommendations_md}

## Propuesta de siguiente fase

1. Cerrar todos los HIGH en lectura y clasificacion QA antes de habilitar escritura compatible.
2. Reducir MEDIUM en preview/filtros para evitar divergencias de conteo por aliases legacy.
3. Cuando HIGH llegue a cero (salvo IGNORE), iniciar fase de escritura compatible en un endpoint acotado con tests de no regresion.
"""


def main() -> None:
    matches, stats = collect_matches()

    risk_counts = Counter(m.risk for m in matches)
    file_counts = Counter(m.file for m in matches if m.risk != "IGNORE")
    field_counts = Counter(m.field for m in matches if m.risk != "IGNORE")

    matches_by_file = defaultdict(list)
    for m in matches:
        matches_by_file[m.file].append(m)

    pending_zones = build_pending_zones(matches)

    recommendations = [
        "Mantener la regla adapter-first para toda nueva lectura en UI.",
        "Tratar como bloqueo de fase cualquier acceso HIGH fuera de categorias IGNORE.",
        "Anadir tests focalizados por zona antes de tocar escritura.",
        "No migrar exportadores reales ni endpoints de escritura hasta estabilizar lectura MEDIUM/HIGH.",
    ]

    payload = {
        "generated_at": datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        "summary": {
            "generated_at": str(date.today()),
            "files_scanned": stats["files_scanned"],
            "files_with_matches": stats["files_with_matches"],
            "matches_total": len(matches),
            "risk_counts": dict(sorted(risk_counts.items())),
        },
        "legacy_fields_catalog": sorted(LEGACY_FIELD_PATTERNS.keys()),
        "top_files": to_top(file_counts),
        "top_legacy_fields": to_top(field_counts),
        "adapted_zones": ADAPTED_ZONES,
        "pending_zones": pending_zones,
        "recommendations": recommendations,
        "matches": [m.__dict__ for m in matches],
        "matches_by_file": {
            key: [item.__dict__ for item in values]
            for key, values in sorted(matches_by_file.items(), key=lambda item: item[0])
        },
    }

    write_json(REPORT_JSON_PATH, payload)
    write_text(REPORT_MD_PATH, build_markdown_report(payload))

    print("[audit_field_adapter_usage] JSON:", REPORT_JSON_PATH.relative_to(REPO_ROOT))
    print("[audit_field_adapter_usage] MD:", REPORT_MD_PATH.relative_to(REPO_ROOT))
    print("[audit_field_adapter_usage] Matches:", len(matches))


if __name__ == "__main__":
    main()
