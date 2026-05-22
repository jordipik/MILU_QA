# Analista 02 - Color de celdas de la tabla comparativa

## Objetivo
Documentar como se decide el color de cada celda en la tabla comparativa de analista_02.

## Fuente de verdad
- Logica de clases por celda: js/analista-02.js (funcion getComparisonCellClasses).
- Estilos visuales (colores): styles/analista_02.css.

## Flujo de calculo
1. Para cada fila/campo comparado, la UI calcula clases CSS en getComparisonCellClasses(entry).
2. Las clases se agregan a cada celda (Excel, GESA, SUBST, PDF, FINAL, ERR).
3. CSS aplica color de fondo/texto segun clase.

## Regla base de comparacion
- getClassAgainstFinal(value):
  - si value vacio => sin clase
  - si value == final => compare-match
  - si value != final => compare-mismatch-soft

## Clases que se asignan en JS

### Excel
- excelClass = getClassAgainstFinal(excel) + compare-raw-sust-match (si excel == subst)

### SUBST
- substClass = getClassAgainstFinal(subst)

### GESA
- gesaClass = getClassAgainstFinal(gesa)

### PDF
- pdfClass = getClassAgainstFinal(pdf)

### FINAL
- finalClass:
  - compare-missing: si campo obligatorio (POS, PART NO., DESIGNATION) y final vacio
  - compare-match: si final tiene valor y coincide con al menos una fuente (gesa o subst o pdf)
  - compare-mismatch-soft: si final tiene valor y no coincide con ninguna fuente
  - sin clase: si final vacio y no es obligatorio

### ERR (columna de error)
- field-err: clase base
- field-err has-errors: si errCount > 0
- a2-error-cell-flash: animacion temporal cuando cambia un error en el registro actual

## Mapeo clase -> color (CSS)
- compare-match:
  - background: rgba(41,145,96,0.09)
- compare-mismatch-soft:
  - background: rgba(220,38,38,0.12)
  - color: #8b1e1e
- compare-raw-sust-match:
  - box-shadow inset verde (realce)
- compare-missing:
  - background: rgba(198,60,44,0.12)
- pdf-empty-hint:
  - patron rayado suave amarillo + color #9c7c00
- compare-final-ok:
  - background verde intenso + texto #0f5132
- compare-final-error:
  - background rojo intenso
- field-err:
  - texto gris #9ca3af
- field-err.has-errors:
  - color: var(--ko)
  - background: var(--ko-soft)

## Referencias de codigo
- js/analista-02.js: getComparisonCellClasses(entry)
- styles/analista_02.css: bloque .a2-compare-table td.compare-* y .field-err*

## Nota
La logica de color depende de clases CSS, no de pintar colores inline en JS. Si se cambia una regla en JS o una clase en CSS, cambia el resultado visual.