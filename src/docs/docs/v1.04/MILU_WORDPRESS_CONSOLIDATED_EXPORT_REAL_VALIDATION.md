# MILU V1.04 - Validacion real del export consolidado

## Alcance y restricciones

Validacion ejecutada con datos reales del repositorio, cumpliendo:

- No se modificaron archivos `engine_*.json`.
- No se tocaron endpoints.
- No se altero el contrato de columnas (30 columnas exactas).

## Ejecucion en modo seguro

Se ejecuto el exportador en `dry-run` y se guardo snapshot temporal:

- `docs/v1.04/tmp/milu_wp_consolidated_dryrun_payload.json`
- `docs/v1.04/tmp/milu_wp_real_validation_metrics.json`

Comando usado para export seguro:

```bash
node -e "const exp=require('./scripts/export_wordpress_milu.js'); exp.run({dryRun:true, writeAuditMirror:false});"
```

## Comparacion export anterior vs export nuevo (dry-run)

Base anterior:

- `data/output/wordpress/milu_wp_new_import.json`
- `data/output/wordpress/milu_wp_superseded_import.json`

Nuevo (temporal):

- `importRows` + `supersededRows` del payload dry-run.

Resultados:

- Filas totales: 8631 -> 8631
- Filas New: 5501 -> 5501
- Filas Superseded: 3130 -> 3130
- PN unicos: 8631 -> 8631
- Duplicados por PN normalizado (nuevo): 0
- Contrato columnas: 30/30 intacto
- Orden exacto de columnas: intacto (igual al canonical de `MILU_New_v506.json`)

## KPIs obligatorios

Estado global: CUMPLE

1. Duplicados WordPress por PN = 0: CUMPLE
2. Contrato 30 columnas intacto: CUMPLE
3. Copia no genera fila: CUMPLE (violaciones: 0)
4. Copia si aporta assets/categorias/paginas/modelos: CUMPLE
   - PNs con mejora por Copia (conteo):
     - assets: 4614
     - categorias: 2054
     - paginas: 5041
     - modelos: 3673
5. `exp_imagenes` aumenta o se mantiene, sin perdida de assets reales: CUMPLE
   - Comparacion normalizada por basename de asset (para equivalencia `filename` vs URL)
   - Decreased: 0
6. `PAG` aumenta o se mantiene por PN: CUMPLE
   - same: 3590
   - increased: 5041
   - decreased: 0
7. `model_type` aumenta o se mantiene por PN: CUMPLE
   - same: 4977
   - increased: 3654
   - decreased: 0
8. `esquema_general` aumenta o se mantiene por PN: CUMPLE
   - same: 570
   - increased: 8061
   - decreased: 0

## Auditoria de casos concretos

1. PN duplicado anterior: `Z=KKN19/19-25.019`
   - old duplicates: 0
   - new duplicates: 0
   - Nota: el caso no aparece como duplicado en la baseline actual del workspace.

2. PN con principal sin `esquema_pos` pero hermano con `esquema_pos`
   - Caso encontrado: `700425000158`
   - old `exp_imagenes`: vacio
   - new `exp_imagenes`: incluye assets reales de hermanos (webp)

3. PN con multiples paginas
   - Caso: `136M52010/1`
   - `PAG`: `221, 231, 252, 257, 589, 733, 1460, 1844`

4. PN con multiples `model_type`
   - Caso: `136M52010/1`
   - `model_type`: `12VM40A, 12VM70, 16VM61, 16VM90, 20VM93L`

5. PN con assets > 10 para confirmar cap
   - Caso: `000000000403`
   - `exp_imagenes`: 10 elementos (cap aplicado)

6. PN sin ningun asset para confirmar fallback
   - Caso: `135M27020/1`
   - `exp_imagenes`: `https://milu-naval.mystagingwebsite.com/wp-content/uploads/2026/01/sin_imagen.jpeg`

## Pruebas automatizadas

Comando solicitado (literal) y resultado:

```bash
node --test wordpress-export-contract.test.js wordpress-export-consolidation.test.js
```

- Resultado: FAIL (paths no encontrados desde raiz)

Comando correcto en este repo:

```bash
node --test tests/wordpress-export-contract.test.js tests/wordpress-export-consolidation.test.js
```

- Resultado: PASS (13/13)

## Criterio de aceptacion del patch

No aceptar hasta cumplir todo:

- tests pasen
- columnas coincidan
- no haya duplicados PN normalizado
- no haya perdida de assets

Veredicto final: APTO PARA ACEPTACION

- Tests: PASS
- Columnas/orden: PASS
- Duplicados PN: PASS
- Perdida de assets reales: PASS

## Ajuste tecnico aplicado durante esta validacion

Para cumplir estrictamente no perdida de assets reales frente a baseline anterior, se ajusto `deriveExpImagenes(...)` para incluir tambien `ruta_foto` en la consolidacion, ademas de `filename_foto` y `ruta_esquemas_pos`.
