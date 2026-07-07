# Auditoria de Estructura JSON (engine_*.json)

Fecha: 2026-05-16
Dataset auditado: 9 engine_*.json

## Metricas base

- Filas totales: 67,884
- Claves unicas detectadas: 120
- Campo measure_final: presente 67,884 / no vacio 42,811
- Campo measurement_final: no presente (0)
- qa_revision_estado: presente/no vacio 67,884
- qa_revision_accion: presente/no vacio 67,884
- ruta_foto no vacio: 1,133
- ruta_esquemas_pos no vacio: 46,648
- sust_status no vacio: 31,779
- sust_hierarchie no vacio: 31,779

## Hallazgos estructurales

### Naming inconsistente / aliases historicos

- coexisten campos raw y finales (ej. PART NO. + pn_final, DESIGNATION + designation_final).
- alias legacy soportado en backend: measurement_final -> measure_final.
- typo historico documentado y tratado en pipelines: wheight_final.

### Campos vacios/redundantes

- muchos campos *_pdf tienen cobertura parcial y heterogenea por motor.
- campos de metadatos QA legacy aparecen con baja cobertura (qa_revision_motivo, qa_revision_confianza, etc.).
- synthetic fields no existen en engine_*.json runtime (synthetic_score/synthetic_decision/export_type = 0 presencia).

### Campos aparentemente no usados en runtime principal

- _internal_debug_record (sentinel tecnico puntual).
- variantes pdf de baja cobertura en motores donde ya existe dato final consolidado.

## Dependencias ocultas frontend/backend

- Frontend y backend dependen de fallback por aliases (fieldAdapter + mapas fallback en modulos legacy).
- PN review depende de normalizacion de PN combinando pn_final, PART NO., pn.
- Export usa campo sust_hierarchie para new/superseded, no sust_status.

## Estructura QA

- Canónicos activos:
  - qa_revision_estado: ok|pendiente
  - qa_revision_accion: importar|revisar|eliminar|copia
  - qa_revision_updated_at
- Compatibilidad legacy de input mantenida (descartar -> eliminar).

## Estructura imagenes/esquemas

- ruta_foto y exp_imagenes coexistiendo.
- ruta_esquemas_pos con cobertura alta pero referencias no resueltas contra catalogo local en auditoria actual.
- placeholders (sin_imagen/placeholder) fuertemente presentes.

## Estructura export

- No hay export_type persistido en engine rows; se deriva en pipeline/mirror.
- Campos export final viven en outputs, no en source-of-truth engine_*.json.

## Riesgos

| Riesgo | Severidad | Detalle |
|---|---|---|
| Ambiguedad por aliases y fallback | Alta | Dos lectores pueden resolver valores distintos |
| Mezcla raw/final en mismo registro | Media | Dificulta contrato unico de datos |
| Campos historicos con baja cobertura | Media | Incrementa complejidad de mantenimiento |
| Dependencia de normalizacion externa | Media | Si no corre depuracion_json.py, la calidad cae |

## Propuesta futura de reorganizacion (sin implementar)

1. Definir contrato v2 por capas:
- block_raw: campos de origen PDF/Excel
- block_final: campos canonicos finales
- block_qa: estado/accion/timestamp
- block_media: foto/esquema normalizados
- block_export_derived: solo calculado, no persistido en source

2. Congelar aliases legacy en una sola capa de compatibilidad (adapter), no en toda la app.

3. Marcar campos deprecados explicitamente en schema con plan de retiro por fases.

4. Versionar schema y exigir validacion pre-write para operaciones masivas.

Nota: esta propuesta no modifica estructura actual; es solo hoja de ruta.
