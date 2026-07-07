"""
engine_constants.py — constantes compartidas entre scripts Python de MILU.

AR-3: centraliza constantes que estaban duplicadas en depuracion_json.py,
add_final_fields.py e importar_json.py.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Lista canónica de archivos engine (9 motores)
# ---------------------------------------------------------------------------
ENGINE_FILES: list[str] = [
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

# ---------------------------------------------------------------------------
# Campos que se sincronizan desde la revisión QA/GESA hacia los registros
# ---------------------------------------------------------------------------
FIELDS_TO_SYNC_FROM_QA: list[str] = [
    "designation_gesa",
    "dimensions_gesa",
    "weight_gesa",
    "units",
]

# ---------------------------------------------------------------------------
# URL de imagen placeholder (sin imagen)
# ---------------------------------------------------------------------------
DEFAULT_EXP_IMAGENES: str = (
    "https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg"
)

# ---------------------------------------------------------------------------
# Regex para detectar tokens de normativa en textos de medidas
# ---------------------------------------------------------------------------
STANDARD_TOKEN_RE = re.compile(
    r"\b(?:DIN|ISO|EN|UNE|SAE|ASTM|ANSI|BS|JIS|VSM|NF|NFE|NEN|UNI|SMS|GOST|MTN|MMN)"
    r"\s*[-/]?\s*[A-Z0-9.:-]{0,20}\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Fragmentos de encabezados de PDF que deben descartarse del dataset final
# ---------------------------------------------------------------------------
BLOCKED_ARTICLE_FRAGMENTS: list[str] = [
    "gmbh",
    "mtu f",
    "mbh",
    "tu frie",
    "edrichsh",
    "edrichshafen gm",
]

# ---------------------------------------------------------------------------
# Tokens que representan valores nulos/vacíos en textos importados
# ---------------------------------------------------------------------------
NAN_LIKE_TOKENS: frozenset[str] = frozenset({"nan", "none", "null", "nat"})

# ---------------------------------------------------------------------------
# Patrones de glob y claves para scripts de estadísticas
# ---------------------------------------------------------------------------
ENGINE_PATTERN: str = "engine_*.json"
PRODUCT_PATTERN: str = "product-export-*.json"
ENGINE_KEY: str = "PART NO."
PRODUCT_KEY: str = "post_name"
