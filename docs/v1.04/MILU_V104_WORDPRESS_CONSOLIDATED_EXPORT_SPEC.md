# MILU_V104_WORDPRESS_CONSOLIDATED_EXPORT_SPEC

Fecha: 2026-06-04

## Especificación funcional del nuevo export consolidado

## 1) Input

- Todos los engine_*.json

## 2) Agrupación

- Agrupar por PN normalizado

## 3) Selección de principal

- Orden estable por:
  - engine/libro
  - source_page
  - pos
  - ID
- Primera fila = principal

## 4) Estado funcional

- principal = ok / Importar
- hermanos = ok / Copia

## 5) Salida WordPress

- Exactamente una fila por PN normalizado

## 6) Contenido de fila consolidada

### Valores canónicos del principal (cuando aplique)

- pn
- designation principal
- campos únicos por PN

### Valores consolidados por PN

- GESA/SUST consolidados
- engines/libros/páginas acumulados
- BOM/FG acumulados cuando aportan contexto
- fotos acumuladas
- esquemas acumulados
- esquemas_pos acumulados
- categorías acumuladas

## 7) Regla exp_imagenes

Construcción obligatoria:

1. foto principal, si existe
2. fotos adicionales únicas
3. esquemas_pos únicos de todos los hermanos
4. fallback sin_imagen solo cuando no exista ninguna alternativa real

## 8) Regla exp_categorias

Acumular en una lista única ordenada:

- model_type
- fg_code
- engine/libro si aplica al filtro visual

## 9) Superseded

- Consolidar por PN, no por fila individual.
- Evitar duplicados por variaciones de formato del mismo PN.

## 10) Validaciones obligatorias

1. PN único en import WordPress
2. cero duplicados
3. assets de hermanos incluidos
4. GESA/SUST incluidos aunque estén en copia
5. esquema_pos presente cuando hay esquema y POS encontrado

## 11) Métricas de aceptación mínimas

- PN duplicados en WordPress: 0
- PN con pérdida de assets por no consolidación: 0
- PN con pérdida de esquema_pos de hermanos: 0
- PN con pérdida de GESA/SUST de hermanos: 0
