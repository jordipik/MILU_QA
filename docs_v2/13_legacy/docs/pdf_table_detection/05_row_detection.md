# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Row Detection - Vertical Grouping & Multi-line Handling

## Overview

Agrupar tokens verticalmente para construir filas coherentes. Cada fila representa un item de la BOM con 10-11 campos (uno por columna).

**Input**: `bodyRects[]` (tokens dentro del Ã¡rea tabular), `columns[]` (boundaries).

**Output**: `rows[]` donde cada fila tiene:
```javascript
{
    rowId: 0,                    // Sequential ID
    baselineY: 450,              // Vertical center (for sorting)
    rects: [rect1, rect2, ...],  // All tokens in this row
    grid: {                      // Assignment to columns
        pos: rect,
        part_no: rect,
        designation: [rect1, rect2],  // Multiline field
        ...
    }
}
```

## Row Grouping Algorithm

```javascript
function groupIntoRows(bodyRects, columns, tolerance = 12) {
    // 1. Sort rects by baselineY (vertical center)
    const sorted = [...bodyRects].sort((a, b) => 
        Number(a.centerY || 0) - Number(b.centerY || 0)
    );

    // 2. Cluster por Y (dynamic tolerance based on rect height)
    const rows = [];
    let currentRow = null;
    
    sorted.forEach((rect) => {
        const dynamicTol = Math.max(tolerance, Number(rect.height || 10) * 0.6);
        
        if (!currentRow) {
            currentRow = {
                rects: [rect],
                baselineY: Number(rect.centerY || 0)
            };
            return;
        }

        // Check si rect pertenece a currentRow
        const yDistance = Math.abs(Number(rect.centerY) - Number(currentRow.baselineY));
        if (yDistance <= dynamicTol) {
            currentRow.rects.push(rect);
            // Re-calculate baseline como promedio
            currentRow.baselineY = currentRow.rects.reduce(
                (sum, r) => sum + Number(r.centerY || 0), 0
            ) / currentRow.rects.length;
        } else {
            rows.push(currentRow);
            currentRow = {
                rects: [rect],
                baselineY: Number(rect.centerY || 0)
            };
        }
    });
    
    if (currentRow) rows.push(currentRow);

    // 3. Assign rects a columnas
    return rows.map((row, idx) => assignRectsToColumns(row, columns, idx));
}
```

### Dynamic Tolerance

```javascript
const dynamicTol = Math.max(tolerance, rect.height * 0.6);
```

**Rationale**: 
- Tokens grandes (height=20) se permiten desalineaciÃ³n mayor
- Tokens pequeÃ±os (height=8) requieren alineaciÃ³n cercana
- MÃ­nimo 12 px siempre

**Efecto**: Maneja multiline rows naturalmente:
```
Row with 2 baselines:
  Line1 (y=100): "PART" "NO" "ABC123"  [height=12]
  Line2 (y=115): "Continued"           [height=12]
  
  dynamicTol = max(12, 12*0.6) = 12 px
  distance = |100-115| = 15 px > 12 â†’ separate rows
  BUT if Line2 is continuation of same item, manually merged later
```

## Column Assignment

```javascript
function assignRectsToColumns(row, columns, rowId) {
    const grid = {};
    
    // Sort rects by left edge (X position)
    const sortedRects = [...row.rects].sort((a, b) => 
        Number(a.left || 0) - Number(b.left || 0)
    );

    // Para cada rect, encontrar columna por "left-edge snapping"
    sortedRects.forEach((rect) => {
        const centerX = Number(rect.centerX || 0);
        
        // Find column donde centerX cae
        let assignedKey = null;
        for (const col of columns) {
            if (centerX >= col.x1 && centerX < col.x2) {
                assignedKey = col.key;
                break;
            }
        }

        if (!assignedKey) {
            assignedKey = 'unknown';  // Rect no encaja en columna
        }

        // Agregar rect a grid (multiline fields pueden tener >1 rect)
        if (!grid[assignedKey]) {
            grid[assignedKey] = [];
        }
        grid[assignedKey].push(rect);
    });

    // Convertir grid[key][] a grid[key] (single rect si 1 elem, sino keep array)
    const normalizedGrid = {};
    for (const [key, rects] of Object.entries(grid)) {
        normalizedGrid[key] = rects.length === 1 ? rects[0] : rects;
    }

    return {
        rowId,
        baselineY: row.baselineY,
        rects: row.rects,
        grid: normalizedGrid
    };
}
```

### Left-Edge Snapping Strategy

**Key principle**: Un rect se asigna a columna donde su **centerX** cae.

```
Columns:
  POS:     [50-90]
  PART NO: [90-150]
  DESIGNATION: [150-350]

Rects:
  Rect1: left=55, width=20, centerX=65  â†’ falls in POS [50-90] â†’ grid.pos = Rect1
  Rect2: left=100, width=40, centerX=120 â†’ falls in PART NO [90-150] â†’ grid.part_no = Rect2
  Rect3: left=155, width=100, centerX=205 â†’ falls in DESIGNATION [150-350] â†’ grid.designation = Rect3
```

### Multiline Field Handling

Si un campo tiene mÃºltiples lÃ­neas (ej: DESIGNATION largo):

```
Row 1, y=100: "PART", "ABC123", "Engine Block", "5", "PC", "12.5kg", ...
Row 2, y=115: "Continued Description", "NA", ...

Durante groupIntoRows():
  Rect1 (PART): centerY=100, asignado a Row1
  Rect2 (ABC123): centerY=100, asignado a Row1
  Rect3 (Engine...): centerY=100, asignado a Row1
  Rect4 (Continued): centerY=115, distancia a Row1 baseline = 15px > 12px
    â†’ Crea Row2

Post-processing (manual merge or heuristic):
  Si Row2 no tiene POS/PART NO, probablemente es continuaciÃ³n de Row1
  â†’ Merge rects de Row2 a Row1, update grid
```

## Row ID Assignment

```javascript
return rows.map((row, idx) => ({
    rowId: idx,  // 0, 1, 2, ...
    ...
}));
```

Sequential assignment. Usado para:
- Referencia Ãºnica de fila en debug/export
- Tracking en QA system
- Sort order en output

## Metadata per Row

Cada row tambiÃ©n puede tener:

```javascript
{
    rowId: 0,
    baselineY: 450,
    rects: [...],
    grid: {...},
    
    // Optional metadata (added by downstream stages)
    warnings: [],        // Validation warnings
    confidence: 0.85,    // Overall row confidence
    sources: {           // Which field came from where
        pos: 'pdf',
        part_no: 'pdf',
        designation: 'ocr-uncertain'
    }
}
```

## Integration with Column Detection

AsignaciÃ³n depende de `columns[]` boundaries. Si columnas estÃ¡n mal alineadas, la asignaciÃ³n falla:

```
Bad column alignment:
  POS:     [50-120]    â† too wide, incluye PART NO
  PART NO: [120-200]   â† too narrow

Resultado:
  grid.pos = [rect1, rect2]  â† ambos tokens asignados a POS
  grid.part_no = []          â† vacÃ­o
```

â†’ ValidaciÃ³n downstream detecta grid.part_no vacÃ­o â†’ warning PART_NO_MISSING.

## Edge Cases

### Case 1: Very Narrow Rows

```
Single-line row muy comprimido:
  "1" "ABC-123" "Block" "5" "PC"...

Rects muy juntos verticalmente. dynamicTol puede ser < 8px.
Resultado: Probable que cada rect sea su propia row (overclustering).

Workaround: Post-process para fusionar rows adjacentes que tienen rects muy cercanos.
```

### Case 2: Missing Intermediate Columns

```
Row: "1", [gap], "ABC-123", [gap], "Engine", ...
      â†‘ POS              â†‘ PART_NO            â†‘ DESIGNATION

Si gap es grande, centerX de ABC-123 puede caer en otro rango.
â†’ grid.pos = [Rect1]
â†’ grid.part_no = []      â† missing
â†’ grid.unknown = [Rect2] â† asignado a unknown si X estÃ¡ fuera
```

Solution: Semantic post-processing clasifica tokens "desconocidos" por content type.

### Case 3: Out-of-Order Rects

```
Algunos PDFs tienen OCR que produce rects en X-order mala:

Rects en PDF order: [100, 200, 150, 300]  (no sorted)

assignRectsToColumns():
  Primero ordena por left: [100, 150, 200, 300]
  Luego asigna a columnas
  Resultado: Correcto a pesar de PDF input disorder
```

## Practical Example

```
PDF body rects (unsorted by Y):
  Rect1: left=65, centerY=100, text="1"
  Rect2: left=105, centerY=100, text="ABC-123"
  Rect3: left=200, centerY=100, text="Engine Block"
  Rect4: left=70, centerY=115, text="Sub-item"
  Rect5: left=520, centerY=100, text="12.5kg"
  Rect6: left=600, centerY=100, text="ISO 1234"

Columns:
  pos: [50-90]
  part_no: [90-150]
  designation: [150-350]
  ...
  weight: [500-550]
  standard: [550-700]

groupIntoRows(rects, columns, 12):

Step 1: Sort by centerY
  [Rect1(y=100), Rect2(y=100), Rect3(y=100), Rect5(y=100), Rect6(y=100), Rect4(y=115)]

Step 2: Cluster
  Row1 (baselineY=100):
    currentRow = [Rect1]
    Rect2: yDist = 0 <= 12 â†’ add to Row1
    Rect3: yDist = 0 <= 12 â†’ add to Row1
    Rect5: yDist = 0 <= 12 â†’ add to Row1
    Rect6: yDist = 0 <= 12 â†’ add to Row1
    Rect4: yDist = 15 > 12 â†’ new row
  
  Row2 (baselineY=115):
    currentRow = [Rect4]
    (end)

Step 3: Assign to columns
  Row1 rects sorted by X: [Rect1(65), Rect2(105), Rect3(200), Rect5(520), Rect6(600)]
  
  Rect1 centerX=65: in [50-90] â†’ grid.pos = Rect1
  Rect2 centerX=105: in [90-150] â†’ grid.part_no = Rect2
  Rect3 centerX=200: in [150-350] â†’ grid.designation = Rect3
  Rect5 centerX=520: in [500-550] â†’ grid.weight = Rect5
  Rect6 centerX=600: in [550-700] â†’ grid.standard = Rect6

Result:
  rows[0] = {
      rowId: 0,
      baselineY: 100,
      rects: [Rect1, Rect2, Rect3, Rect5, Rect6],
      grid: {
          pos: Rect1,
          part_no: Rect2,
          designation: Rect3,
          weight: Rect5,
          standard: Rect6,
          // model_type, qty, units, fn, measurement: undefined
      }
  }

  rows[1] = {
      rowId: 1,
      baselineY: 115,
      rects: [Rect4],
      grid: {
          // All empty (single rect doesn't map well to full row)
      }
  }
```

## Parameters

| ParÃ¡metro | Valor | DescripciÃ³n |
| --- | --- | --- |
| `tolerance` | 12 px | Base tolerance para Y clustering |
| `height factor` | 0.6 | Multiplicador de altura del token para dynamic tolerance |

Ajustar en `groupIntoRows()` si hay problemas de overclustering o underclustering.

---

**VÃ©ase tambiÃ©n:**
- [04_column_detection.md](04_column_detection.md) - Boundaries que alimentan assignment
- [06_semantic_classification.md](06_semantic_classification.md) - ValidaciÃ³n post-assignment
- [09_known_issues.md](09_known_issues.md) - Row detection issues

**Ãšltima actualizaciÃ³n**: Mayo 17, 2026

