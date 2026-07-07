# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Auditoria Performance

Fecha: 2026-05-16

## Resumen ejecutivo

El sistema es usable en local, pero su performance depende de:

- Volumen alto de JSON cargado en cliente.
- Operaciones de tabla/filtros sobre dataset grande.
- Agregados analytics sobre mirror DB.

## Evidencia cuantitativa

### Carga de motores (frontend)

Benchmark parse local de 9 engine_*.json:

- Total: 67,884 filas / 213.71 MB
- Parse total: 1,445.4 ms (Node, referencia minima)
- Archivos mas pesados:
  - engine_20V4000M93.json: 45.72 MB, 280.3 ms
  - engine_16V4000M73.json: 39.62 MB, 299.5 ms
  - engine_16V4000M73L.json: 34.69 MB, 232.2 ms

Nota: en browser real, red + parse + render elevan este costo.

### Frontend QA

- Virtualizacion implementada en qa-table.js (umbral >120 filas + overscan).
- Paginacion y auto page-size presentes.
- Riesgo principal: inicializacion y logica concentrada en qa-milu.js/analista-02.js.

### Analytics

- Smoke muestra latencias mas altas en vistas pesadas (overview/images/pn-conflicts/search) pero dentro de rango usable para herramienta interna.
- Cache TTL activa en /db/analytics reduce recalculo repetido.

## Cuellos de botella detectados

| Area | Riesgo | Tipo |
|---|---|---|
| Carga inicial de motores | Alto | I/O + parse + hydration |
| Modulos monoliticos con muchos listeners | Medio | CPU UI + mantenibilidad |
| Consultas agregadas analytics pesadas | Medio | DB CPU |
| Resolucion de rutas multimedia no reconciliada | Medio | Reintentos/errores en render |

## Operaciones O(n^2) / recalculos

- No se detecta un hotspot O(n^2) critico confirmado en este corte.
- Si hay mÃºltiples pasadas/fallbacks por campos en modulos legacy (PN review y analista), elevando costo de mantenimiento y CPU.

## Recomendaciones

1. Activar por defecto carga incremental de motores en QA para sesiones no globales.
2. Separar orquestacion de eventos de qa-milu.js/analista-02.js en modulos pequeÃ±os.
3. AÃ±adir medicion de tiempos por fase UI (load/filter/render/save).
4. Definir budget de latencia para endpoints analytics clave y alertas de regresion.
5. AÃ±adir reconciliacion previa de media para reducir errores de render y operaciones redundantes.

