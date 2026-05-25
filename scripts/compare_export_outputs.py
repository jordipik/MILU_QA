#!/usr/bin/env python3
"""Compare legacy and semantic export outputs and write docs/export_output_compare.md.

Supports explicit JSON paths and classifies findings as:
- OK equivalentes
- Diferencias esperadas
- Diferencias criticas
- Legacy baseline no encontrado
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

REPO_ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = REPO_ROOT / "docs" / "export_output_compare.md"
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


def text(value) -> str:
    return str(value if value is not None else "").strip()


def key(value) -> str:
    return text(value).lower()


def load_json_array(file_path: Path):
    if not file_path.exists():
        return None
    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except Exception:
        return []
    return payload if isinstance(payload, list) else []


def export_type(row: Dict[str, object]) -> str:
    hierarchy = text(
        row.get("hierarchie_final")
        or row.get("sust_hierarchie")
        or row.get("SUST_TIPO")
    )
    return "Superseded" if hierarchy == "Superseded" else "New"


def row_pn(row: Dict[str, object]) -> str:
    return text(row.get("sku") or row.get("pn") or row.get("pn_final") or row.get("PART NO."))


def row_designation(row: Dict[str, object]) -> str:
    return text(row.get("designation_final") or row.get("designation") or row.get("DESIGNATION"))


def row_qa_estado(row: Dict[str, object]) -> str:
    return text(row.get("qa_revision_estado"))


def row_qa_accion(row: Dict[str, object]) -> str:
    return text(row.get("qa_revision_accion"))


def row_ruta_foto(row: Dict[str, object]) -> str:
    return text(row.get("ruta_foto") or row.get("filename_foto"))


def row_ruta_esquemas(row: Dict[str, object]) -> str:
    return text(row.get("ruta_esquemas_pos") or row.get("exp_imagenes"))


def normalized_designation(value: str) -> str:
    return " ".join(text(value).lower().split())


def to_row_summary(engine_file: str, row: Dict[str, object]) -> Dict[str, str]:
    return {
        "engine_file": engine_file,
        "id": text(row.get("ID")),
        "source_page": text(row.get("source_page") or row.get("Source Page") or row.get("page4")),
        "designation_final": text(row.get("designation_final")),
        "designation_gesa": text(row.get("designation_gesa")),
        "designation_excel": text(row.get("designation_excel")),
        "designation_pdf": text(row.get("designation_pdf")),
        "qa_revision_estado": text(row.get("qa_revision_estado")),
        "qa_revision_accion": text(row.get("qa_revision_accion")),
        "hierarchie_final": text(row.get("hierarchie_final")),
        "sust_hierarchie": text(row.get("sust_hierarchie")),
        "status": text(row.get("status")),
        "new_pn_final": text(row.get("new_pn_final")),
        "sust_new_part_number": text(row.get("sust_new_part_number")),
    }


def load_engine_index() -> Dict[str, List[Dict[str, str]]]:
    index: Dict[str, List[Dict[str, str]]] = {}
    for file_name in ENGINE_FILES:
        file_path = REPO_ROOT / file_name
        rows = load_json_array(file_path) or []
        for row in rows:
            if not isinstance(row, dict):
                continue
            summary = to_row_summary(file_name, row)
            pn_candidates = {
                text(row.get("pn_final")),
                text(row.get("PART NO.")),
                text(row.get("pn")),
            }
            for pn in pn_candidates:
                if not pn:
                    continue
                index.setdefault(pn, []).append(summary)
    return index


def is_import_row(summary: Dict[str, str]) -> bool:
    return key(summary.get("qa_revision_estado")) == "ok" and key(summary.get("qa_revision_accion")) == "importar"


def classify_pn_presence_diff(pn: str, side: str, engine_index: Dict[str, List[Dict[str, str]]]):
    rows = engine_index.get(pn, [])
    if not rows:
        return "DATA_INCONSISTENCY", False, "PN no encontrado en engine_*.json actuales"

    has_import = any(is_import_row(r) for r in rows)
    if side == "legacy_only" and not has_import:
        return "BASELINE_STALE", True, "legacy exportaba PN sin fila qa ok/importar en datos actuales"
    if side == "semantic_only" and has_import:
        return "BASELINE_STALE", True, "semantic exporta PN con fila qa ok/importar en datos actuales"

    return "DATA_INCONSISTENCY", False, "estado qa/import no consistente entre baseline y datos actuales"


def designation_candidates(rows: List[Dict[str, str]]) -> set[str]:
    candidates: set[str] = set()
    for row in rows:
        for field_name in ("designation_final", "designation_gesa", "designation_excel", "designation_pdf"):
            value = normalized_designation(row.get(field_name, ""))
            if value:
                candidates.add(value)
    return candidates


def classify_designation_diff(
    pn: str,
    legacy_designation: str,
    semantic_designation: str,
    engine_index: Dict[str, List[Dict[str, str]]],
):
    rows = engine_index.get(pn, [])
    if not rows:
        return "DATA_INCONSISTENCY", False, "PN no encontrado en engine_*.json actuales"

    import_rows = [r for r in rows if is_import_row(r)]
    if not import_rows:
        return "DATA_INCONSISTENCY", False, "sin filas qa ok/importar para validar designacion"

    import_designations = designation_candidates(import_rows)
    legacy_norm = normalized_designation(legacy_designation)
    semantic_norm = normalized_designation(semantic_designation)

    semantic_matches_import = semantic_norm in import_designations
    legacy_matches_import = legacy_norm in import_designations

    if semantic_matches_import and not legacy_matches_import:
        return "BASELINE_STALE", True, "semantic alinea designacion con fila qa ok/importar; legacy mezcla filas copia"
    if semantic_matches_import and legacy_matches_import:
        return "DATA_INCONSISTENCY", False, "ambas designaciones existen en filas qa ok/importar; revisar consolidacion"
    if not semantic_matches_import and legacy_matches_import:
        return "EXPORT_MAPPING_BUG", False, "legacy alinea con fila qa ok/importar y semantic no"

    return "DATA_INCONSISTENCY", False, "ninguna designacion coincide con filas qa ok/importar"


@dataclass
class CompareResult:
    title: str
    baseline_missing: bool = False
    ok_equivalentes: List[str] = field(default_factory=list)
    diferencias_esperadas: List[str] = field(default_factory=list)
    diferencias_criticas: List[str] = field(default_factory=list)


@dataclass
class ComparePaths:
    legacy_new: Path
    semantic_new: Path
    legacy_superseded: Path
    semantic_superseded: Path
    legacy_synthetic_new: Path | None = None
    semantic_synthetic_new: Path | None = None
    legacy_synthetic_superseded: Path | None = None
    semantic_synthetic_superseded: Path | None = None


def compare_export_pair(title: str, legacy_rows, semantic_rows, engine_index: Dict[str, List[Dict[str, str]]]) -> CompareResult:
    result = CompareResult(title=title)

    if legacy_rows is None:
        result.baseline_missing = True
        result.diferencias_esperadas.append("Legacy baseline no encontrado")
        return result

    legacy_by_pn = {row_pn(r): r for r in legacy_rows if row_pn(r)}
    semantic_by_pn = {row_pn(r): r for r in semantic_rows if row_pn(r)}

    legacy_pn = set(legacy_by_pn)
    semantic_pn = set(semantic_by_pn)

    if legacy_pn == semantic_pn:
        result.ok_equivalentes.append(f"PN equivalentes: {len(legacy_pn)}")
    else:
        only_legacy = sorted(legacy_pn - semantic_pn)
        only_semantic = sorted(semantic_pn - legacy_pn)
        expected_pn_diffs = 0
        critical_pn_diffs = 0

        for pn in only_legacy:
            cause, expected, reason = classify_pn_presence_diff(pn, "legacy_only", engine_index)
            line = f"PN solo legacy={pn} ({cause}) - {reason}"
            if expected:
                expected_pn_diffs += 1
                result.diferencias_esperadas.append(line)
            else:
                critical_pn_diffs += 1
                result.diferencias_criticas.append(line)

        for pn in only_semantic:
            cause, expected, reason = classify_pn_presence_diff(pn, "semantic_only", engine_index)
            line = f"PN solo semantic={pn} ({cause}) - {reason}"
            if expected:
                expected_pn_diffs += 1
                result.diferencias_esperadas.append(line)
            else:
                critical_pn_diffs += 1
                result.diferencias_criticas.append(line)

        result.ok_equivalentes.append(
            f"PN comparados con trazabilidad: solo legacy={len(only_legacy)} solo semantic={len(only_semantic)} "
            f"| esperados={expected_pn_diffs} | criticos={critical_pn_diffs}"
        )

    if len(legacy_rows) == len(semantic_rows):
        result.ok_equivalentes.append(f"Numero de registros equivalente: {len(legacy_rows)}")
    else:
        result.diferencias_criticas.append(
            f"Numero de registros distinto | legacy={len(legacy_rows)} semantic={len(semantic_rows)}"
        )

    legacy_types = Counter(export_type(r) for r in legacy_rows)
    semantic_types = Counter(export_type(r) for r in semantic_rows)
    if legacy_types == semantic_types:
        result.ok_equivalentes.append(
            f"Clasificacion New/Superseded equivalente: New={legacy_types.get('New', 0)} Superseded={legacy_types.get('Superseded', 0)}"
        )
    else:
        result.diferencias_criticas.append(
            "Clasificacion New/Superseded distinta "
            f"| legacy New={legacy_types.get('New', 0)} Superseded={legacy_types.get('Superseded', 0)} "
            f"| semantic New={semantic_types.get('New', 0)} Superseded={semantic_types.get('Superseded', 0)}"
        )

    shared = sorted(legacy_pn & semantic_pn)
    critical_fields = [
        ("designation", row_designation),
        ("qa_revision_estado", row_qa_estado),
        ("qa_revision_accion", row_qa_accion),
        ("ruta_foto", row_ruta_foto),
        ("ruta_esquemas_pos", row_ruta_esquemas),
        ("tipo", export_type),
    ]

    field_diff_counts = Counter()
    designation_expected = 0
    designation_critical = 0
    for pn in shared:
        left = legacy_by_pn[pn]
        right = semantic_by_pn[pn]
        for field_name, getter in critical_fields:
            if key(getter(left)) != key(getter(right)):
                if field_name != "designation":
                    field_diff_counts[field_name] += 1
                    continue

                cause, expected, reason = classify_designation_diff(
                    pn,
                    row_designation(left),
                    row_designation(right),
                    engine_index,
                )
                line = (
                    f"designation PN={pn} ({cause}) - {reason} "
                    f"| legacy='{row_designation(left)}' | semantic='{row_designation(right)}'"
                )
                if expected:
                    designation_expected += 1
                    result.diferencias_esperadas.append(line)
                else:
                    designation_critical += 1
                    result.diferencias_criticas.append(line)

    if designation_expected or designation_critical:
        result.ok_equivalentes.append(
            f"designation con trazabilidad: esperadas={designation_expected} | criticas={designation_critical}"
        )

    if not field_diff_counts:
        result.ok_equivalentes.append("Campos criticos equivalentes: designation, qa_revision_estado, qa_revision_accion, ruta_foto, ruta_esquemas_pos, tipo")
    else:
        for field_name, count in sorted(field_diff_counts.items()):
            if field_name in {"ruta_foto", "ruta_esquemas_pos"}:
                result.diferencias_esperadas.append(f"{field_name} con diferencias en {count} PN (normalizacion de rutas o merge legacy)")
            else:
                result.diferencias_criticas.append(f"{field_name} con diferencias en {count} PN")

    return result


def compare_synthetic_pair(title: str, legacy_rows, semantic_rows) -> CompareResult:
    result = CompareResult(title=title)

    if legacy_rows is None:
        result.baseline_missing = True
        result.diferencias_esperadas.append("Legacy baseline no encontrado")
        return result

    # Synthetic legacy sources may be historical exports (v506) with schema variations.
    legacy_pn = [text(r.get("pn") or r.get("PART NO.") or r.get("pn_final")) for r in legacy_rows]
    semantic_pn = [text(r.get("pn") or r.get("PART NO.") or r.get("pn_final")) for r in semantic_rows]

    legacy_count = Counter([p for p in legacy_pn if p])
    semantic_count = Counter([p for p in semantic_pn if p])

    if legacy_count == semantic_count:
        result.ok_equivalentes.append(f"Synthetic grouping equivalente: {len(legacy_count)} PN")
    else:
        only_legacy = set(legacy_count) - set(semantic_count)
        only_semantic = set(semantic_count) - set(legacy_count)
        result.diferencias_esperadas.append(
            "Synthetic baseline con esquema/origen diferente: "
            f"solo legacy={len(only_legacy)} solo semantic={len(only_semantic)}"
        )

    return result


def to_markdown(results: List[CompareResult], paths: ComparePaths) -> str:
    lines: List[str] = []
    lines.append("# Export Output Compare")
    lines.append("")
    lines.append("## Baselines")
    lines.append(f"- legacy_new: {paths.legacy_new}")
    lines.append(f"- semantic_new: {paths.semantic_new}")
    lines.append(f"- legacy_superseded: {paths.legacy_superseded}")
    lines.append(f"- semantic_superseded: {paths.semantic_superseded}")
    if paths.legacy_synthetic_new and paths.semantic_synthetic_new:
        lines.append(f"- legacy_synthetic_new: {paths.legacy_synthetic_new}")
        lines.append(f"- semantic_synthetic_new: {paths.semantic_synthetic_new}")
    if paths.legacy_synthetic_superseded and paths.semantic_synthetic_superseded:
        lines.append(f"- legacy_synthetic_superseded: {paths.legacy_synthetic_superseded}")
        lines.append(f"- semantic_synthetic_superseded: {paths.semantic_synthetic_superseded}")

    for result in results:
        lines.append("")
        lines.append(f"## {result.title}")
        if result.baseline_missing:
            lines.append("- Legacy baseline no encontrado")
        lines.append("- OK equivalentes:")
        if result.ok_equivalentes:
            lines.extend([f"  - {item}" for item in result.ok_equivalentes])
        else:
            lines.append("  - Ninguno")

        lines.append("- Diferencias esperadas:")
        if result.diferencias_esperadas:
            lines.extend([f"  - {item}" for item in result.diferencias_esperadas])
        else:
            lines.append("  - Ninguna")

        lines.append("- Diferencias criticas:")
        if result.diferencias_criticas:
            lines.extend([f"  - {item}" for item in result.diferencias_criticas])
        else:
            lines.append("  - Ninguna")

    return "\n".join(lines) + "\n"


def parse_args() -> ComparePaths:
    parser = argparse.ArgumentParser()

    parser.add_argument("--legacy-new", type=str)
    parser.add_argument("--semantic-new", type=str)
    parser.add_argument("--legacy-superseded", type=str)
    parser.add_argument("--semantic-superseded", type=str)

    parser.add_argument("--legacy-dir", type=str, default=str(REPO_ROOT / "data" / "output" / "wordpress_legacy"))
    parser.add_argument("--semantic-dir", type=str, default=str(REPO_ROOT / "data" / "05-wordpress"))

    parser.add_argument("--legacy-synthetic-new", type=str)
    parser.add_argument("--semantic-synthetic-new", type=str)
    parser.add_argument("--legacy-synthetic-superseded", type=str)
    parser.add_argument("--semantic-synthetic-superseded", type=str)

    args = parser.parse_args()

    legacy_dir = Path(args.legacy_dir)
    semantic_dir = Path(args.semantic_dir)

    legacy_new = Path(args.legacy_new) if args.legacy_new else legacy_dir / "milu_wp_import.json"
    semantic_new = Path(args.semantic_new) if args.semantic_new else semantic_dir / "milu_wp_import.json"
    legacy_sup = Path(args.legacy_superseded) if args.legacy_superseded else legacy_dir / "milu_wp_superseded.json"
    semantic_sup = Path(args.semantic_superseded) if args.semantic_superseded else semantic_dir / "milu_wp_superseded.json"

    return ComparePaths(
        legacy_new=legacy_new,
        semantic_new=semantic_new,
        legacy_superseded=legacy_sup,
        semantic_superseded=semantic_sup,
        legacy_synthetic_new=Path(args.legacy_synthetic_new) if args.legacy_synthetic_new else None,
        semantic_synthetic_new=Path(args.semantic_synthetic_new) if args.semantic_synthetic_new else None,
        legacy_synthetic_superseded=Path(args.legacy_synthetic_superseded) if args.legacy_synthetic_superseded else None,
        semantic_synthetic_superseded=Path(args.semantic_synthetic_superseded) if args.semantic_synthetic_superseded else None,
    )


def main() -> None:
    paths = parse_args()
    engine_index = load_engine_index()

    legacy_new_rows = load_json_array(paths.legacy_new)
    semantic_new_rows = load_json_array(paths.semantic_new) or []
    legacy_sup_rows = load_json_array(paths.legacy_superseded)
    semantic_sup_rows = load_json_array(paths.semantic_superseded) or []

    results: List[CompareResult] = []
    results.append(compare_export_pair("WordPress New", legacy_new_rows, semantic_new_rows, engine_index))
    results.append(compare_export_pair("WordPress Superseded", legacy_sup_rows, semantic_sup_rows, engine_index))

    if paths.legacy_synthetic_new and paths.semantic_synthetic_new:
        legacy_syn_new_rows = load_json_array(paths.legacy_synthetic_new)
        semantic_syn_new_rows = load_json_array(paths.semantic_synthetic_new) or []
        results.append(compare_synthetic_pair("Synthetic New", legacy_syn_new_rows, semantic_syn_new_rows))

    if paths.legacy_synthetic_superseded and paths.semantic_synthetic_superseded:
        legacy_syn_sup_rows = load_json_array(paths.legacy_synthetic_superseded)
        semantic_syn_sup_rows = load_json_array(paths.semantic_synthetic_superseded) or []
        results.append(compare_synthetic_pair("Synthetic Superseded", legacy_syn_sup_rows, semantic_syn_sup_rows))

    report = to_markdown(results, paths)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"OK report: {REPORT_PATH}")


if __name__ == "__main__":
    main()
