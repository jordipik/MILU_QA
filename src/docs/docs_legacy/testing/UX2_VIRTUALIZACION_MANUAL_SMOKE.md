# UX-2 - Smoke manual de virtualizacion (qa_milu)

Objetivo: validar que la virtualizacion nativa de tabla en `js/qa-table.js` funciona con dataset real, sin paginacion, y sin romper interacciones principales.

## Alcance

- Frontend: `qa_milu.html`
- Modulo principal: `js/qa-table.js`
- Modo recomendado para validar filas visibles: `Vista errores`
- Backend: solo lectura de datos para validacion visual/DOM (sin cambios de contrato)

## Precondiciones

1. Levantar servidor local:
   - `node server.js`
2. Abrir:
   - `http://localhost:3000/qa_milu.html?virtualDebug=1`
3. Estado inicial recomendado:
   - `Limpiar` filtros
   - `Paginacion: OFF`
   - `Vista errores`

## Pasos de validacion manual

1. Confirmar dataset visible
- Verificar que hay filas en `#errorViewTbody tr[data-revision-key]`.
- Verificar que `stats` muestra total filtrado > 0.

2. Confirmar virtualizacion activa
- En `#errorViewTbody` verificar:
  - numero de filas renderizadas (tr con `data-revision-key`) bajo (ventana visible + overscan)
  - existencia de filas espaciadoras `tr.virtual-spacer` con altura en px.
- Criterio: filas renderizadas << total filtrado.

3. Confirmar actualizacion de ventana al hacer scroll
- Hacer scroll vertical en `#errorViewWrap`.
- Verificar que cambian las revision keys de primera/ultima fila visible.
- Verificar ajuste de alturas en `tr.virtual-spacer` (top/bottom).

4. Confirmar estabilidad visual
- Scroll continuo, sin bloqueos ni flashes anormales.
- Cabecera sticky estable en su contenedor.
- Sin saltos bruscos no explicables por reciclado de filas.

5. Confirmar seleccion por teclado
- Con foco en la pagina, usar `ArrowDown` y `ArrowUp`.
- Verificar que la fila seleccionada (`tr.row-selected`) se mantiene visible al navegar.
- Verificar que el scroll acompana cuando la seleccion sale de la ventana actual.

6. Confirmar compatibilidad funcional minima
- Filtros (cabecera): aplican sin romper render.
- Ordenacion (click en cabecera): reordena y actualiza ventana.
- Cambio de vista `compacta/qa/errores`: no rompe UI.
- Acciones de revision: controles select por fila siguen presentes en vista errores.
- `lazy=1`: panel incremental visible y operativo (`Motores cargados: n / 9`).

## Evidencia minima esperada (checklist)

- [ ] Paginacion OFF
- [ ] Total filtrado > 0
- [ ] Filas DOM renderizadas significativamente menores que total
- [ ] `tr.virtual-spacer` presente(s)
- [ ] Primer/ultimo `data-revision-key` cambia al hacer scroll
- [ ] `row-selected` se mantiene visible con teclado
- [ ] Filtros/ordenacion operativos
- [ ] Cambio de vista operativo
- [ ] Modo lazy visible y sin regresion

## Nota sobre smoke automatizado

No se anade en esta fase un smoke Playwright ejecutable en repo para evitar introducir dependencia y runtime de navegadores en la cadena minima actual.

Alternativa recomendada (fase posterior):
- incorporar Playwright como devDependency + test smoke dedicado `tests/frontend/ux2-virtualization.spec.ts` con ejecucion opt-in.
