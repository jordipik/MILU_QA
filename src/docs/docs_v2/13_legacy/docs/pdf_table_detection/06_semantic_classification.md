# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Semantic Classification - Validation & Override Rules

## Overview

DespuÃ©s de construir el grid de filas/columnas, aplicar validaciones semÃ¡nticas y overrides para corregir errores de asignaciÃ³n geomÃ©trica mediante lÃ³gica de negocio.

**Examples of semantic override**:
- Token "AB" en columna `weight` â†’ reclasificar a `fn` (porque AB es vÃ¡lido FN code)
- Token "EM" en columna `weight` â†’ reclasificar a `fn` (porque EM es vÃ¡lido FN code)
- Token all-digits en `designation` â†’ validar contra part number patterns

## FN Whitelist Override

**Problem**: FN (Footnote) es una columna estrecha que contiene codes cortos (2-3 chars, tÃ­picamente letras + nÃºmeros). Si estÃ¡ mal detectada geomÃ©tricamente, codes pueden asignarse a columna adyacente (ej: `weight`).

**Solution**: Lista canÃ³nica de vÃ¡lidos FN codes que se reconocen en CUALQUIER columna:

```javascript
const FN_WHITELIST = [
    'AB', 'EM', 'CD', 'EF',  // Common naval BOM codes
    // ... mÃ¡s cÃ³digos segÃºn catalog GESA
];

function semanticOverrideForFn(row) {
    const fnCodes = new Set(FN_WHITELIST);
    
    // Scan todas las columnas buscando tokens que matchen FN whitelist
    for (const [colKey, rect] of Object.entries(row.grid)) {
        if (colKey === 'fn') continue;  // Ya en lugar correcto
        
        const text = normalizeHeaderToken(String(rect?.text || ''));
        if (fnCodes.has(text)) {
            // Mover rect de colKey a 'fn'
            if (!row.grid.fn) {
                row.grid.fn = [];
            }
            if (!Array.isArray(row.grid.fn)) {
                row.grid.fn = [row.grid.fn];
            }
            row.grid.fn.push(rect);
            
            // Remover de original
            if (Array.isArray(row.grid[colKey])) {
                row.grid[colKey] = row.grid[colKey].filter(r => r !== rect);
                if (row.grid[colKey].length === 0) delete row.grid[colKey];
            } else {
                delete row.grid[colKey];
            }
            
            row.warnings.push({
                type: 'semantic-override',
                message: `FN code '${text}' moved from ${colKey} to fn`
            });
        }
    }
}
```

## Part Number Validation

**Rule**: VÃ¡lidos part numbers tienen patterns especÃ­ficos:

```javascript
function isLikelyPartNumber(text) {
    const t = normalizeHeaderToken(text);
    if (!t) return false;
    if (t.length < 6) return false;  // Too short
    
    const hasDigit = /\d/.test(t);
    const hasLetter = /[A-Z]/.test(t);
    
    // Must have digits AND (letters OR length >= 8)
    return hasDigit && (hasLetter || t.length >= 8);
}

// Examples:
isLikelyPartNumber("ABC123")     â†’ true
isLikelyPartNumber("123456")     â†’ true
isLikelyPartNumber("A1B2C3D4")   â†’ true
isLikelyPartNumber("ABC")        â†’ false  (length < 6)
isLikelyPartNumber("1234")       â†’ false  (no letters, length < 8)
isLikelyPartNumber("ABCD")       â†’ false  (no digits, length < 8)
```

## Measurement Normalization

**Problem**: Medidas pueden estar en mÃºltiples formatos:
- `A 55 X 5` (espacio separado)
- `A  55   X  5` (mÃºltiples espacios)
- `55x5` (sin espacios)
- `55 x 5` (minÃºsculas)

**Solution**: Normalizar a formato canÃ³nico (single spaces):

```javascript
function normalizeMeasurement(text) {
    return String(text || '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, ' ')  // Multiple spaces â†’ single space
        .replace(/\s*x\s*/gi, ' X ')  // "x" â†’ " X " (normalized)
        .trim();
}

// Examples:
normalizeMeasurement("A  55   X  5")   â†’ "A 55 X 5"
normalizeMeasurement("A55x5")          â†’ "A 55 X 5"
normalizeMeasurement("55 x 5")         â†’ "55 X 5"
```

## Nullable Fields

Algunos campos pueden estar legitimamente vacÃ­os en ciertas filas:

```javascript
const NULLABLE_FIELDS = ['model_type', 'fn', 'measurement', 'standard'];
const REQUIRED_FIELDS = ['pos', 'part_no', 'designation', 'qty', 'measurement', 'standard'];
```

**Validation**:

```javascript
function validateRequiredFields(row) {
    const warnings = [];
    
    for (const fieldKey of REQUIRED_FIELDS) {
        const value = row.grid[fieldKey];
        const isEmpty = !value || (Array.isArray(value) && value.length === 0);
        
        if (isEmpty) {
            warnings.push({
                code: `${fieldKey.toUpperCase()}_MISSING`,
                severity: 'error'
            });
        }
    }
    
    return warnings;
}
```

## Unit Token Validation

**Whitelist de vÃ¡lidos unit tokens**:

```javascript
const VALID_UNITS = ['PC', 'PCS', 'SET', 'KG', 'G', 'LB', 'M', 'MM', 'IN', 'FT'];

function isValidUnitToken(text) {
    return VALID_UNITS.includes(normalizeHeaderToken(text));
}
```

**AplicaciÃ³n**: Si token en `units` column no es vÃ¡lido, marcar como warning.

## Multiline Field Reconstruction

Si un campo tiene mÃºltiples rects (ej: DESIGNATION en 2 lÃ­neas), reconstruir texto:

```javascript
function reconstructMultilineField(rects) {
    if (!Array.isArray(rects)) return String(rects?.text || '');
    
    // Sort by X (left-to-right, dentro de la misma lÃ­nea)
    const sorted = [...rects].sort((a, b) => {
        const dy = Number(b.centerY || 0) - Number(a.centerY || 0);
        if (Math.abs(dy) > 2) return dy;  // Different lines: sort by Y first
        return Number(a.left || 0) - Number(b.left || 0);  // Same line: sort by X
    });
    
    return sorted
        .map(r => String(r.text || '').trim())
        .filter(Boolean)
        .join(' ');
}
```

## Text Cleaning

Remover caracteres especiales, artefactos OCR:

```javascript
function cleanOcrArtifacts(text) {
    return String(text || '')
        .replace(/[|]/g, 'I')    // | â†’ I (OCR confusion)
        .replace(/[0O]/g, '0')   // Normalize 0/O (context-dependent, risky)
        .replace(/\s+/g, ' ')    // Collapse spaces
        .trim();
}
```

**Caution**: Cleaning demasiado agresivo puede cambiar el significado. Aplicar selectivamente.

## Blue Text Special Handling

Algunos PDFs tienen text en color azul que requiere tratamiento especial:

```javascript
// En state.js o qa-milu.js
const blueTexts = getPdfExperimentalBlueTexts();  // Array de rects with blue color

// En semantic classification:
blueTexts.forEach(rect => {
    // Marcar como "ocr-uncertain" en sources
    row.sources[columnKey] = 'ocr-uncertain-blue';
});
```

**Current status**: Detectado pero no classificado automÃ¡ticamente (requires manual validation).

## Confidence Scoring

Cada row puede tener confidence score global:

```javascript
function calculateRowConfidence(row, warnings) {
    let score = 1.0;
    
    // Penalty por warnings
    warnings.forEach(w => {
        if (w.severity === 'error') score -= 0.3;
        else if (w.severity === 'warning') score -= 0.1;
    });
    
    // Bonus si todos required fields presentes
    const REQUIRED = ['pos', 'part_no', 'designation', 'qty', 'measurement'];
    const filled = REQUIRED.filter(k => row.grid[k]).length;
    const fillRatio = filled / REQUIRED.length;
    score = score * (0.5 + (fillRatio * 0.5));  // 50-100% del score base
    
    return Math.max(0, Math.min(1, score));
}
```

## Integration Flow

```
parse() in pdf-table-parser.js:

1. buildTableGrid()  â†’ rows[] con grid sin validaciÃ³n semÃ¡ntica
2. rows.forEach(row => {
     semanticOverrideForFn(row);
     const warnings = validateRequiredFields(row);
     row.warnings = warnings;
     row.confidence = calculateRowConfidence(row, warnings);
   });
3. return rows[]  â†’ con semantic validation aplicada
```

## Practical Examples

### Example 1: FN Override

```
Grid before semantic processing:
  row.grid = {
      pos: Rect("1"),
      part_no: Rect("ABC-123"),
      designation: Rect("Engine"),
      qty: Rect("5"),
      units: Rect("PC"),
      weight: Rect("AB"),  â† should be FN
      measurement: Rect("A 55 X 5"),
      standard: Rect("ISO 1234")
  }

semanticOverrideForFn():
  text = normalizeHeaderToken("AB") = "AB"
  "AB" in FN_WHITELIST? YES
  Move Rect("AB") from weight to fn
  
Grid after:
  row.grid = {
      pos: Rect("1"),
      part_no: Rect("ABC-123"),
      designation: Rect("Engine"),
      qty: Rect("5"),
      units: Rect("PC"),
      weight: undefined,   â† now empty
      fn: Rect("AB"),      â† moved here
      measurement: Rect("A 55 X 5"),
      standard: Rect("ISO 1234")
  }
  
  row.warnings = [
      { type: 'semantic-override', message: "FN code 'AB' moved from weight to fn" }
  ]
```

### Example 2: Measurement Normalization

```
Grid:
  row.grid.measurement = Rect("A  55   X  5")

normalizeMeasurement():
  Input: "A  55   X  5"
  Output: "A 55 X 5"
  
  row.grid.measurement.text = "A 55 X 5"  â† normalized
  row.sources.measurement = "pdf-normalized"
```

### Example 3: Required Field Validation

```
Grid:
  row.grid = {
      pos: Rect("1"),
      part_no: Rect("ABC-123"),
      designation: Rect("Engine"),
      qty: Rect("5"),
      // measurement: missing
      // standard: missing
      units: Rect("PC"),
      weight: Rect("12.5kg"),
      fn: Rect("AB")
  }

validateRequiredFields():
  REQUIRED_FIELDS = ['pos', 'part_no', 'designation', 'qty', 'measurement', 'standard']
  
  Checking:
    pos: âœ“ present
    part_no: âœ“ present
    designation: âœ“ present
    qty: âœ“ present
    measurement: âœ— MISSING
    standard: âœ— MISSING
  
  row.warnings = [
      { code: 'MEASUREMENT_MISSING', severity: 'error' },
      { code: 'STANDARD_MISSING', severity: 'error' }
  ]
```

---

**VÃ©ase tambiÃ©n:**
- [05_row_detection.md](05_row_detection.md) - Row grid construction
- [06_semantic_classification.md](06_semantic_classification.md) - Este documento
- [09_known_issues.md](09_known_issues.md) - Known semantic issues

**Ãšltima actualizaciÃ³n**: Mayo 17, 2026

