# MILU V1 - Plan de trabajo y validacion

## 1. Objetivo
Cerrar MILU V1 de forma ordenada, priorizando estabilidad, trazabilidad y export final.

## 2. Estado actual
Validaciones ya realizadas:

| Item | Estado |
|---|---|
| Boton IMPORTAR PDF del modal | Validado |
| recomputeCopyBookBtn | Validado |
| runApplyBookPreviewToEngines() | Validado |
| Endpoint POST /api/pdf-preview/apply-to-engine | Validado |
| Ejecucion de apply_book_preview_to_engine.py --write --overwrite | Validada |
| No uso de /copy-pdf-to-pdf-all-books ni /recompute-pdf-auto en ese boton | Confirmado |
| Logs frontend/backend | Revisados |
| not_found_rows | Revisado |
| Tabla no-match en modal | Revisada |
| Filtros y export CSV | Validados |
| Selector "Todos los libros" en errores | Validado |

## 3. Decisiones tomadas
- Los casos not_found se aceptan temporalmente y se revisaran en una fase futura.
- No se va a rehacer el matching ahora.
- No se van a anadir nuevas features.
- Prioridad actual: cerrar flujo, validar y exportar.

## 4. Plan por fases

### Fase 1 - IMPORT PDF
Estado: completada / validada.

Validacion:
- Pulsar IMPORTAR PDF.
- Revisar consola.
- Comprobar endpoint oficial.
- Comprobar rows_changed / fields_changed / ambiguous / not_found.
- Comprobar tabla no-match.

### Fase 2 - DOCUMENTACION
Estado: en curso.

Validacion:
- Actualizar MILU_V1_MASTER_PIPELINE.md.
- Actualizar SCRIPT_MAP.md.
- Actualizar pipeline_global.md.
- Actualizar import_pdf_flow.md.
- Actualizar apply_book_preview_to_engine.md.
- Confirmar que no quedan referencias confusas al flujo legacy.

### Fase 3 - CALCULO FINAL
Estado: pendiente.

Objetivo:
Congelar que endpoint/script sera oficial para calcular campos *_final.

Validacion:
- Identificar /copy-pdf-to-final-all-books.
- Identificar /calculate-final-fields.
- Documentar cual queda oficial y cual legacy.
- Ejecutar prueba en un libro.
- Comparar antes/despues en registro concreto.

### Fase 4 - ERRORES
Estado: pendiente.

Objetivo:
Validar recompute de errores para registro, libro y todos los libros.

Validacion:
- Ejecutar scope registro.
- Ejecutar scope libro.
- Ejecutar scope todos.
- Comprobar *_error, total_error, has_error.
- Documentar reglas principales.

### Fase 5 - QA REVISION
Estado: pendiente.

Objetivo:
Validar qa_revision_estado y qa_revision_accion.

Validacion:
- Ejecutar recalcular estados.
- Comprobar ok/importar.
- Comprobar ok/eliminar.
- Comprobar pendiente/revisar.
- Confirmar aplicacion a engines.

### Fase 6 - EXPORT WORDPRESS
Estado: pendiente.

Objetivo:
Generar export final New/Superseded.

Validacion:
- Ejecutar /export/run-wordpress.
- Revisar outputs en data/output/wordpress/.
- Contar New.
- Contar Superseded.
- Revisar imagenes.
- Revisar esquemas.
- Revisar descartados.

## 5. Checklist imprimible
- [ ] Documentacion actualizada
- [ ] IMPORT PDF validado
- [ ] Calculo final validado
- [ ] Errores validados
- [ ] QA revision validado
- [ ] Export WordPress generado
- [ ] Backup realizado
- [ ] Commit realizado

## 6. Reglas de trabajo
- No tocar matching ahora.
- No abrir features nuevas.
- No modificar logica sin validacion antes/despues.
- Cada fase debe terminar con resumen.
- Cada cambio debe indicar archivos tocados.
- Cada validacion debe tener evidencia: consola, endpoint, conteos o diff.

## 7. Formato
Documento claro, compacto y facil de imprimir.
Uso de titulos, tablas pequenas y checklist.
No extender contenido fuera de lo necesario para cerrar V1.
