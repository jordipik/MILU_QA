"""
engine_helpers.py — helpers de normalización y cálculo de errores para registros engine.

AR-3: extrae funciones idénticas que estaban duplicadas en depuracion_json.py
y add_final_fields.py.
"""
from __future__ import annotations

import re
import unicodedata

from python_lib.engine_constants import NAN_LIKE_TOKENS, STANDARD_TOKEN_RE


# ---------------------------------------------------------------------------
# Normalización de valores para comparación QA
# ---------------------------------------------------------------------------

def normalize_compare_value(value) -> str:
    """Normaliza un valor para comparación QA: colapsa espacios, minúsculas y sin acentos."""
    text = " ".join(str(value or "").strip().split())
    if not text or text == "-":
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


def is_compare_match(left, right) -> bool:
    """Devuelve True si ambos valores normalizados son iguales y no están vacíos."""
    nl = normalize_compare_value(left)
    nr = normalize_compare_value(right)
    return bool(nl and nr and nl == nr)


# ---------------------------------------------------------------------------
# Normalización de espacios en estructuras anidadas
# ---------------------------------------------------------------------------

def collapse_spaces_in_structure(value):
    """Colapsa múltiples espacios en strings; elimina NaN-like tokens y strings vacíos."""
    if isinstance(value, str):
        cleaned = " ".join(value.split())
        if not cleaned:
            return None
        if cleaned.lower() in NAN_LIKE_TOKENS:
            return None
        return cleaned
    if isinstance(value, list):
        return [collapse_spaces_in_structure(item) for item in value]
    if isinstance(value, dict):
        return {k: collapse_spaces_in_structure(v) for k, v in value.items()}
    return value


# ---------------------------------------------------------------------------
# Separación de medida y normativa en textos mixtos
# ---------------------------------------------------------------------------

def split_measurement_and_standard(raw_value):
    """
    Separa un texto mezclado medida/norma en dos valores:
      - medida (ej: "M 10 X 25")
      - norma  (ej: "DIN933")
    Devuelve (measurement, standard) donde cualquiera puede ser None.
    """
    text = " ".join(str(raw_value or "").strip().split())
    if not text:
        return None, None

    matches = list(STANDARD_TOKEN_RE.finditer(text))
    if not matches:
        return text, None

    standards: list[str] = []
    for match in matches:
        token = " ".join(match.group(0).strip().split())
        if not token:
            continue
        token_upper = token.upper()
        if token_upper not in standards:
            standards.append(token_upper)

    measurement_text = STANDARD_TOKEN_RE.sub(" ", text)
    measurement_text = re.sub(r"\s*[,;/]\s*", " ", measurement_text)
    measurement_text = " ".join(measurement_text.split())

    measurement = measurement_text or None
    standard = " ".join(standards) if standards else None
    return measurement, standard


# ---------------------------------------------------------------------------
# Cálculo de flags de error por registro
# ---------------------------------------------------------------------------

def calc_record_errors(record: dict) -> dict:
    """
    Calcula flags de error por campo y total_error.
    Modifica el registro in-place y lo devuelve.
    Alineado con los checks QA activos.
    """
    pos_final = record.get("pos_final")
    pos_pdf = record.get("pos_pdf") or record.get("POS")

    pn_final = record.get("pn_final")
    pn_pdf = record.get("pn_pdf") or record.get("PART NO.")

    designation_final = record.get("designation_final")
    designation_pdf = record.get("designation_pdf") or record.get("DESIGNATION")
    designation_gesa = record.get("designation_gesa")

    weight_final = record.get("weight_final")
    weight_pdf = record.get("weight_pdf") or record.get("WEIGHT")
    weight_gesa = record.get("weight_gesa")
    units = record.get("units")
    weight_gesa_with_units = None
    if weight_gesa is not None and str(weight_gesa).strip() != "":
        weight_gesa_with_units = f"{weight_gesa} {str(units or '').strip()}".strip()
    weight_all_empty = all(
        normalize_compare_value(v) == ""
        for v in [weight_final, weight_pdf, weight_gesa_with_units]
    )

    measurement_final = record.get("measure_final")
    measurement_pdf = record.get("measure_pdf") or record.get("MEASUREMENT / STANDARD")
    measurement_gesa = record.get("dimensions_gesa") or record.get("measure_gesa")
    measurement_all_empty = all(
        normalize_compare_value(v) == ""
        for v in [measurement_final, measurement_pdf, measurement_gesa]
    )

    norma_final = record.get("norma_final") or record.get("norma")
    norma_pdf = record.get("norma_pdf") or record.get("norma_raw") or record.get("norma")
    norma_gesa = record.get("norma_gesa") or record.get("norma")
    norma_all_empty = all(
        normalize_compare_value(v) == ""
        for v in [norma_final, norma_pdf, norma_gesa]
    )

    bom_final = record.get("BOM-No.")
    bom_pdf = record.get("bom_pdf")

    pos_error = int(
        normalize_compare_value(pos_final) == ""
        or not is_compare_match(pos_final, pos_pdf)
    )
    pn_error = int(
        normalize_compare_value(pn_final) == ""
        or not is_compare_match(pn_final, pn_pdf)
    )
    designation_error = int(
        normalize_compare_value(designation_final) == ""
        or (
            not is_compare_match(designation_final, designation_pdf)
            and not is_compare_match(designation_final, designation_gesa)
        )
    )
    weight_error = int(
        (not weight_all_empty)
        and not is_compare_match(weight_final, weight_pdf)
        and not is_compare_match(weight_final, weight_gesa_with_units)
    )
    measurement_error = int(
        (not measurement_all_empty)
        and not is_compare_match(measurement_final, measurement_pdf)
        and not is_compare_match(measurement_final, measurement_gesa)
    )
    norma_error = int(
        (not norma_all_empty)
        and not is_compare_match(norma_final, norma_pdf)
        and not is_compare_match(norma_final, norma_gesa)
    )
    bom_error = int(
        normalize_compare_value(bom_pdf) != ""
        and not is_compare_match(bom_final, bom_pdf)
    )

    record["pos_error"] = pos_error
    record["pn_error"] = pn_error
    record["designation_error"] = designation_error
    record["weight_error"] = weight_error
    record["measurement_error"] = measurement_error
    record["norma_error"] = norma_error
    record["bom_error"] = bom_error

    total_error = (
        pos_error + pn_error + designation_error
        + weight_error + measurement_error + norma_error + bom_error
    )
    record["total_error"] = total_error
    record["has_error"] = total_error > 0

    return record
