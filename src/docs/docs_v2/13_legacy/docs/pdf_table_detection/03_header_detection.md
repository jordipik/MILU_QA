# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Header Detection - Semantic Column Identification

## Objective

Detectar automÃ¡ticamente quÃ© es cada columna usando:
1. **Geometric clustering**: Agrupar tokens horizontalmente cercanos
2. **Text normalization**: Canonizar variaciones de spelling/formatting
3. **Semantic matching**: Comparar contra lista canÃ³nica de headers
4. **Multiline fusion**: Manejar headers que ocupan >1 lÃ­nea

Output: `anchors[]` con posiciÃ³n X exacta y clasificaciÃ³n semÃ¡ntica de cada header.

## Canonical Headers

Lista de 11 headers que MILU espera en tablas BOM:

```javascript
const CANONICAL_HEADERS = [
    'POS',           // Position number
    'PART NO',       // Part number (PRIMARY key)
    'DESIGNATION',   // Description of part
    'MODEL/TYPE',    // Model or type variant
    'QTY',           // Quantity
    'UNITS',         // Unit of measurement (PC, SET, KG, etc.)
    'WEIGHT',        // Weight value
    'FN',            // Footnote reference (numeric code)
    'MEASUREMENT',   // Measurement/dimensions
    'STANDARD',      // Standard reference (ISO, DIN, etc.)
    'ARROW'          // (Optional) Visual indicator column
];
```

## Text Normalization

### normalizeHeaderToken()

```javascript
function normalizeHeaderToken(text) {
    return String(text || '')
        .toUpperCase()                       // PART NO.
        .normalize('NFD')                    // Ãœ â†’ U + Â¨
        .replace(/[\u0300-\u036f]/g, '')    // U + Â¨ â†’ U (remove diacritics)
        .replace(/[.]/g, ' ')               // PART NO. â†’ PART NO
        .replace(/[\-_]/g, ' ')             // PART-NO â†’ PART NO
        .replace(/[^A-Z0-9/\s]/g, ' ')      // Remove special chars except /
        .replace(/\s+/g, ' ')               // Collapse multiple spaces
        .trim();
}

// Examples
normalizeHeaderToken("PART NO.")        â†’ "PART NO"
normalizeHeaderToken("part-no")         â†’ "PART NO"
normalizeHeaderToken("PartNo")          â†’ "PART NO"
normalizeHeaderToken("P.A.R.T. N.O.")   â†’ "PART NO"
normalizeHeaderToken("MÃ¶del/Type")      â†’ "MODEL/TYPE"
```

### Semantic Mapping

DespuÃ©s de normalizaciÃ³n, se aplican reglas de mapeo para variantes conocidas:

```javascript
// En normalizeHeaderToken(), despuÃ©s de normalizacion base:

if (raw === 'MODEL TYPE') return 'MODEL/TYPE';
if (raw === 'MODELTYPE') return 'MODEL/TYPE';
if (raw === 'PARTNO') return 'PART NO';
if (raw === 'PART NUMBER') return 'PART NO';
if (raw === 'PARTNUMBER') return 'PART NO';
if (raw === 'QTY') return 'QTY';
if (raw === 'MEASUREMENTS') return 'MEASUREMENT';
if (raw === 'STANDARDS') return 'STANDARD';
if (raw === 'FOOTNOTE') return 'FN';
```

## Header Detection Algorithm

### Step 1: Detect Header Key from Phrase

```javascript
function detectHeaderKeyFromPhrase(phrase) {
    const normalized = normalizeHeaderToken(phrase);
    if (!normalized) return null;

    if (normalized === 'POS' || normalized === 'POSITION') 
        return 'pos';
    if (normalized.includes('PART') && normalized.includes('NO')) 
        return 'part_no';
    if (normalized.includes('DESIGNATION') || normalized.includes('DESCRIPTION')) 
        return 'designation';
    if (normalized.includes('MODEL') && normalized.includes('TYPE')) 
        return 'model_type';
    if (normalized === 'QTY' || normalized.includes('QUANTITY')) 
        return 'qty';
    if (normalized.includes('UNITS') || normalized === 'UNIT' || normalized === 'UNL') 
        return 'units';
    if (normalized.includes('WEIGHT') || normalized === 'WT' || normalized === 'WGT') 
        return 'weight';
    if (normalized === 'FN' || normalized.includes('FOOTNOTE') || normalized === 'F/N') 
        return 'fn';
    if (normalized.includes('MEASUREMENT')) 
        return 'measurement';
    if (normalized.includes('STANDARD') || normalized === 'STD') 
        return 'standard';

    return null;  // Unknown phrase
}
```

### Step 2: Detect Header Anchors

```javascript
function detectHeaderAnchors(tableLines, tableTopY, windowPx = 90, geomScale = 1) {
    // 1. Filtrar lÃ­neas cercanas a tableTopY (Â± 90px)
    const candidateLines = tableLines.filter(
        (line) => Number(line.cy || 0) <= (Number(tableTopY) + windowPx)
    );

    // 2. Para cada lÃ­nea, construir clusters (words agrupados por gap < 26px)
    // 3. Para cada cluster, intentar matchar contra header keys
    // 4. Multi-word candidates: combinar 2-3 clusters adjacentes
    //    (ej: "PART" + "NO" = "PART NO")
    // 5. Scoring: single-cluster = score 1.0, 2-cluster = 1.15, 3-cluster = 1.3
    // 6. Confidence = 'high' si score >= 1.2, else 'medium'
    
    // 4. Deduplication: por key, guardar anchor con score mÃ¡ximo
    // 5. Return: anchors[] ordenados por x1
}
```

### Step 3: Merge PART NO + Handling

**Problema OCR comÃºn**: "PART NO." aparece como 1 bloque Ãºnico en lugar de 2 columnas separadas.

**SoluciÃ³n**: Detectar esta fusiÃ³n en etapas posteriores de column detection (no en header detection).

## Multiline Headers

Algunos PDFs tienen headers en mÃºltiples lÃ­neas:

```
Row 1:  POS  PART        DESIGNATION  MODEL  QTY  UNITS  WEIGHT  FN  MEASUREMENT  STANDARD
Row 2:       NO.                       TYPE

Output headers:
- POS at [x1=50, x2=80]
- PART NO at [x1=80, x2=130]  (fusionado de 2 lÃ­neas)
- DESIGNATION at [x1=130, x2=220]
... etc
```

**ImplementaciÃ³n** (experimental):

```javascript
// En detectHeaderAnchors(), se detectan lÃ­neas con â‰¥2 headers
if (localHits.length >= 2) {
    headerLines.push(line);  // Marcar como probable header line
}

// Las lÃ­neas marcadas se usan en downstream para validaciÃ³n
```

## ARROW Column Detection

La primera columna (opcional) puede ser "ARROW" - un pequeÃ±o indicador visual.

```javascript
// En detectHeaderKeyFromPhrase()
if (
    !key
    && i === 0  // EstÃ¡ en primera posiciÃ³n
    && !normalizedPhrase  // EstÃ¡ vacÃ­o/unrecognizable
    && String(item.phrase || '').trim()  // Pero tiene texto
    && Number(item.right - item.left) <= geomPx(28, geomScale)  // Es muy estrecho
) {
    key = 'arrow';
}
```

**CaracterÃ­sticas**:
- Siempre en posiciÃ³n 0 (leftmost)
- Muy estrecho (< 28 px)
- Optional (puede no estar presente)
- No es un "header" semÃ¡ntico, solo un placeholder

## Confidence Scoring

Cada anchor tiene un confidence level:

| Confidence | Score Range | Meaning |
| --- | --- | --- |
| `high` | score â‰¥ 1.2 | Multi-word match (2-3 clusters fused) o exact match |
| `medium` | score < 1.2 | Single-word match, podrÃ­a ser OCR artifact |
| `low` | N/A | No se usa en detectHeaderAnchors(), solo en fallbacks |

**Uso**:

```javascript
if (anchor.confidence === 'high') {
    // Usar posiciÃ³n X como boundary "hard" en column detection
    snapTolerance = 4;  // Tight snapping window
} else if (anchor.confidence === 'medium') {
    // PosiciÃ³n X es "flexible"
    snapTolerance = 12;  // Loose snapping window
}
```

## Known Issues & Limitations

### Issue 1: OCR Blue Text

**Problema**: Algunos PDFs tienen headers en color azul que OCR interpreta diferente.

**Manifestation**:
- Headers missing en detecciÃ³n
- Colors artifacts en detecciÃ³n de text

**Current status**: Detected pero no fully handled. Flag: `PDF_FEATURE_BLUE_TEXT_PANEL_ENABLED = false` (disabled por performance)

### Issue 2: Split Headers (PART NO across lines)

**Problema**: "PART" en una lÃ­nea, "NO" en otra lÃ­nea debajo.

**Current solution**: 
- `groupIntoLines()` usa dynamic tolerance basado en altura del token
- Tokens ligeramente desalineados Y se agrupan juntos
- Luego `buildClusters()` los fusiona

**Limitation**: Si gap vertical > (height * 0.55), se crean lÃ­neas separadas. Headers se detectan por lÃ­nea, posible duplication.

### Issue 3: Ambiguous Headers

**Problema**: "FN" podrÃ­a ser "First Name", "Footnote", o "Function Number".

**Solution**: Usar contexto de canonicidad. Si "FN" aparece en posiciÃ³n 8-9 (despuÃ©s QTY, UNITS, WEIGHT), es probablemente "Footnote".

**Workaround**: No hay validaciÃ³n contextual actual. Se asume "FN" siempre = "Footnote" si matches `fn` regex.

## Column Schema

Cada header canonicizado tiene metadata:

```javascript
const COLUMN_SCHEMA = {
    pos: { 
        key: 'pos', 
        label: 'POS', 
        color: '#2563eb'  // Blue para overlay
    },
    part_no: { 
        key: 'part_no', 
        label: 'PART NO.', 
        color: '#dc2626'  // Red
    },
    designation: { 
        key: 'designation', 
        label: 'DESIGNATION', 
        color: '#0891b2'  // Cyan
    },
    // ... etc
};
```

Usada para:
- RenderizaciÃ³n de overlays (colores)
- Labels en paneles UI
- CanonicizaciÃ³n de nombres en output JSON

## Integration with Column Detection

Headers detectados se usan como "anchors" en column boundary detection:

```javascript
// En refineVerticalBoundaries()
const anchorsByKey = new Map(...);  // Headers detectados

// Merge con template
const columns = mergeAnchorsIntoTemplate(templateColumns, anchors);
// â†’ Centra template columns segÃºn posiciÃ³n de anchors detectados
```

## Practical Examples

### Example 1: Clean Header

```
Input text line: "POS PART NO. DESIGNATION MODEL/TYPE QTY UNITS WEIGHT FN MEASUREMENT STANDARD"

detectHeaderAnchors() output:
[
    { key: 'pos', x1: 50, x2: 80, confidence: 'high', text: 'POS' },
    { key: 'part_no', x1: 80, x2: 140, confidence: 'high', text: 'PART NO.' },
    { key: 'designation', x1: 140, x2: 270, confidence: 'high', text: 'DESIGNATION' },
    { key: 'model_type', x1: 270, x2: 360, confidence: 'medium', text: 'MODEL/TYPE' },
    { key: 'qty', x1: 360, x2: 400, confidence: 'high', text: 'QTY' },
    { key: 'units', x1: 400, x2: 450, confidence: 'medium', text: 'UNITS' },
    { key: 'weight', x1: 450, x2: 520, confidence: 'high', text: 'WEIGHT' },
    { key: 'fn', x1: 520, x2: 555, confidence: 'high', text: 'FN' },
    { key: 'measurement', x1: 555, x2: 680, confidence: 'high', text: 'MEASUREMENT' },
    { key: 'standard', x1: 680, x2: 750, confidence: 'medium', text: 'STANDARD' }
]
```

### Example 2: Fused PART NO

```
Input: "POS PARTNUMBER DESIGNATION..." (OCR fusionÃ³ "PART NUMBER")

detectHeaderKeyFromPhrase("PARTNUMBER"):
â†’ normalizeHeaderToken("PARTNUMBER") = "PARTNUMBER"
â†’ if (raw === 'PARTNUMBER') return 'PART NO'
â†’ Detectado como 'part_no'

Output:
{ key: 'part_no', x1: 80, x2: 140, confidence: 'high', text: 'PARTNUMBER' }
```

### Example 3: Multiline Header

```
Input lines:
Line 1 (cy=100): "POS  PART      DESIGNATION  MODEL  QTY  UNITS  WEIGHT  FN  MEASUREMENT  STANDARD"
Line 2 (cy=115): "      NO.                    TYPE"

detectHeaderAnchors():
- Busca ambas lÃ­neas en windowPx=90px range
- Encuentra clusters en Line1: [POS], [PART], [DESIGNATION], ...
- Encuentra clusters en Line2: [NO.], [TYPE]
- Fusiona PART + NO. = "PART NO" â†’ parte_no
- Fusiona MODEL + TYPE = "MODEL/TYPE" â†’ model_type
- Confidence = 'high' por multicluster match

Output: 10 headers correctamente detectados
```

## Debugging & Visualization

En `analista-02.js`, flag para debug:

```javascript
const PDF_FEATURE_HEADERS_ENABLED = true;  // Enable/disable detection

const PDF_HEADER_DEBUG_ENABLED = false;  // Enable detailed logging
// Set en pdf-viewer.js para verbose header detection logs
```

Cuando habilitado, `window.getHeaderDetectionDebug()` retorna:

```javascript
[
    { stage: 'cluster-detection', data: { line: 0, clusters: 5 }, timestamp: 1234567890 },
    { stage: 'key-match', data: { cluster: 'PART NO', key: 'part_no' }, timestamp: 1234567891 },
    ...
]
```

---

**VÃ©ase tambiÃ©n:**
- [00_overview.md](00_overview.md) - Pipeline completo
- [04_column_detection.md](04_column_detection.md) - CÃ³mo anchors se usan en column detection
- [06_semantic_classification.md](06_semantic_classification.md) - Validaciones posteriores

**Ãšltima actualizaciÃ³n**: Mayo 17, 2026

