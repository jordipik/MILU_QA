# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

> **PROPUESTA — PENDIENTE DE VALIDAR**
>
> Propuesta UX basada en mockups de Figma. No implementada.
>
> Movido a `docs/proposals/` el 2026-05-12. **No representa el estado actual del código.**

---

# 06 - Future Versions: Review Flow vs Figma

Fecha: 2026-04-19
Referencia visual: figma_node_1_463.png
Referencia funcional QA: docs/05_qa_errors_checks.md

## Resumen de opinion
El diseno de Figma encaja muy bien con un flujo de revision secuencial (un registro activo al centro, historial de revisados a la izquierda y contexto PDF a la derecha).

La arquitectura actual de QA (qa_errors + qa_errors_active) va en la direccion correcta para rendimiento y consistencia. Es una buena base para evolucionar UX sin rehacer backend.

## Lo que esta muy bien del enfoque actual
1. Desacople de calculo de errores y render de tabla.
2. Estado activo de checks con firma (signature), util para coherencia UI.
3. Posibilidad de flujo operador: revisar -> marcar -> avanzar.

## Riesgos a vigilar (futuras versiones)
1. Persistencia de qa_errors_active en disco por cada cambio de checks puede generar escrituras innecesarias si hay muchos usuarios/iteraciones.
2. Riesgo de desalineacion entre "orden de navegacion" y "orden visual" si no se explicita en UI.
3. Si la izquierda muestra solo revisados de sesion, se necesita indicador claro del progreso global (ej. 125/540).

## Recomendaciones concretas para roadmap
1. Definir dos listas explicitas en frontend:
- queueRows: todos los pendientes segun filtros/checks activos (fuente de navegacion)
- reviewedRows: revisados en sesion (fuente de tabla izquierda)

2. Mostrar progreso operacional fijo arriba:
- Pendientes
- Revisados sesion
- Total filtrado

3. Separar acciones rapidas por semantica:
- OK (estado revisado)
- KO (estado en revision o descartado segun regla)
- Import/Revisar/Eliminar como accion de negocio

4. Mantener consistencia de seleccion sin re-render completo cuando sea posible.

5. Considerar modo "solo memoria" para checks activos (sin persistir qa_errors_active) y dejar persistencia solo para acciones explicitas de usuario.

## Criterios de aceptacion sugeridos para version futura
1. Al abrir QA, seleccionar primer pendiente automaticamente.
2. Al pulsar OK/KO, avanzar al siguiente pendiente sin saltos.
3. El registro recien revisado aparece arriba a la izquierda.
4. El panel central conserva foco y scroll estable.
5. El PDF y la ficha reflejan siempre el registro seleccionado.

## Plan UX detallado para futuras versiones

### 1) Orden de navegacion vs lista visible

Definiciones:
1. Orden de navegacion:
- Secuencia real por la que el sistema resuelve el siguiente registro al pulsar OK/KO.
- Debe ser estable y predecible segun filtros y orden activo.

2. Lista visible:
- Conjunto que se muestra en la columna izquierda.
- Puede ser solo revisados de sesion y no tiene que coincidir con todos los registros del alcance.

Regla operativa:
1. Navegacion y visualizacion son dos capas distintas.
2. El boton siguiente siempre usa la cola de pendientes, no la lista visible.

Copy sugerido en interfaz:
1. "Navegacion: el boton Siguiente recorre todos los pendientes segun filtros y checks activos."
2. "Lista izquierda: solo revisados en esta sesion."

Comportamiento esperado al pulsar OK/KO:
1. El registro actual sale de pendientes.
2. Entra en revisados y aparece arriba en la izquierda.
3. Se carga automaticamente el siguiente pendiente.

### 2) Progreso global visible

Objetivo:
1. Evitar perdida de contexto cuando el volumen es alto.
2. Mantener visible cuanto se ha hecho y cuanto falta.

Metricas minimas:
1. Total alcance: registros dentro de filtros/checks actuales.
2. Pendientes: registros sin decision en el flujo actual.
3. Revisados: registros ya procesados.
4. Cobertura: porcentaje revisados / total alcance.

Formula:
1. progreso_pct = (revisados / total_alcance) * 100

Cabecera recomendada (siempre visible):
1. Barra de progreso con porcentaje.
2. Contadores: pendientes, revisados y total.
3. Texto de alcance activo (filtros/checks aplicados).

Buenas practicas:
1. Diferenciar revisados de sesion y revisados historicos.
2. Recalcular y avisar cuando cambien filtros o checks.
3. Mostrar siempre numerador y denominador (ej. 200/540), no solo valor absoluto.

Copy sugerido:
1. "Progreso global: 200/540 (37%)"
2. "Pendientes en cola: 340 | Lista izquierda: revisados de sesion"
3. Tooltip en Siguiente: "Avanza por la cola de pendientes segun filtros y checks activos."

## Nota
Este documento es de analisis/roadmap. No implica cambios implementados en runtime.

