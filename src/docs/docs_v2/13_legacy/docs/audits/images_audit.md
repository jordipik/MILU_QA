# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Auditoria Sistema Imagenes y Esquemas

Fecha: 2026-05-16
Scope: engine_*.json, fotos_articulos/, fotos_motores/, esquemas/, esquemas_pos_circulos/, qa_imagenes.html, analytics_images.html.

## Metricas calculadas

- total_rows: 67,884
- rows_without_image: 20,893
- rows_only_placeholder_image: 20,892
- rows_without_schema: 21,236
- image_refs_total (normalizadas): 49,722
- missing_image_references: 47,458
- duplicated_image_filenames_referenced: 131
- orphan_image_files (catalogo local no referenciado): 68
- schema_refs_total: 47,457
- missing_schema_references: 47,457
- orphan_schema_files: 15
- image_files_catalogued (fotos_articulos+fotos_motores): 136
- schema_files_catalogued (esquemas+esquemas_pos_circulos): 15

## Interpretacion tecnica

- El sistema tiene cobertura funcional para detectar placeholders y faltantes.
- El nivel de referencias no resolubles indica desalineacion fuerte entre rutas persistidas y catalogo local de ficheros.
- El estado "solo placeholder" casi coincide con "sin imagen", lo que sugiere fallback dominante.

## Hallazgos por capa

### Runtime QA imagenes

- qa_imagenes.html usa pipeline modular y tabla virtual.
- Carga multiples fuentes (audit json + inventory + exports + engine files).
- Contiene utilidades que referencian vistas no existentes actualmente (qa_web, milu_qa).

### Analytics imagenes

- /db/analytics/images y drilldowns /images/missing, /images/placeholders operativos.
- Permite ranking por motores con faltantes/placeholders.

### Datos multimedia

- Catalogo local de imagenes reducido (136) frente a referencias de filas (>49k refs).
- Catalogo local de esquemas (15) no alinea con referencias de ruta_esquemas_pos.

## Riesgos

| Riesgo | Severidad | Impacto |
|---|---|---|
| Rutas rotas masivas | Alta | Export/QA visual inconsistente, errores en publicaciÃ³n |
| Dependencia de placeholders | Alta | Calidad de catÃ¡logo degradada |
| Orfandad de archivos locales | Media | Mantenimiento manual confuso |
| Duplicados de nombre | Media | Ambiguedad de resoluciÃ³n de recurso |

## Recomendaciones

1. Normalizar estrategia de ruta persistida (basename canonico + resolver unico).
2. Generar inventario reconciliado por corrida (referenciado/existente/huerfano/duplicado).
3. Definir SLA interno de completitud media por motor para gate de export.
4. Eliminar referencias a vistas obsoletas en utilidades QA imagenes.

