# LEGACY DOCUMENT

⚠️ Documento histórico. Puede estar obsoleto.
Consultar docs_v2 para versión actual.

# Contrato de imÃ¡genes y esquemas

> **CONTRATO MILU â€” v1** Â· Fase: CONTRATOS + ESTABILIDAD Â· No modifica cÃ³digo ni datos.
>
> Reglas oficiales para el manejo de imÃ¡genes (`exp_imagenes`, `ruta_foto`) y esquemas (`esquemas`, `ruta_esquemas_pos`).

## 1. Campos persistidos

| Campo | Tipo | Notas |
|---|---|---|
| `exp_imagenes` | string (CSV/multilÃ­nea) o array | **Fuente primaria** del export y de la UI de imÃ¡genes. |
| `ruta_foto` | string (URL) o null | Imagen principal del artÃ­culo. **Fallback** si `exp_imagenes` no aporta nada Ãºtil. |
| `filename_foto` | string o null | Basename del archivo en [fotos_articulos/](../../fotos_articulos/). |
| `esquemas` | string (PNG) | Esquema base del despiece. |
| `esquemas_circulos` | string | Esquema con cÃ­rculos POS marcados. |
| `esquemas_circulos_all` | string (WebP) | Variante consolidada. |
| `ruta_esquemas_pos` | string (URL/path) | Esquema asociado al `pos` concreto de la fila. |

Las carpetas fÃ­sicas son `fotos_articulos/`, `fotos_motores/`, `esquemas/`, `esquemas_pos_circulos/`. **No editar contenido manualmente.**

## 2. Prioridad de `exp_imagenes` (origen del valor)

Orden conceptual al construir/refrescar `exp_imagenes`:

1. `ruta_foto` (si existe y es URL vÃ¡lida).
2. `ruta_esquemas_pos` (si no hay `ruta_foto`).
3. `placeholder` / `sin_imagen` (cuando no hay nada disponible).

El valor canÃ³nico de placeholder en disco es `"sin_imagen.jpeg"`.

> **Nota**: `exp_imagenes` puede contener varias entradas separadas. El parseo se hace con `parseImagesFromValue` y de-dup con `uniq` ([server.js L163-L168](../../server.js)).

## 3. CategorÃ­as visuales (calculadas en runtime, NO persistir)

Estados que la UI deriva combinando los campos anteriores:

| Estado visual | CondiciÃ³n |
|---|---|
| **imagen real** | `exp_imagenes` contiene un nombre/URL real (â‰  placeholder) y el archivo existe. |
| **solo esquema** | No hay imagen real, pero existe `esquemas` / `ruta_esquemas_pos`. |
| **placeholder** | `exp_imagenes` contiene `sin_imagen*`. |
| **ruta rota** | `exp_imagenes` o `ruta_foto` apunta a un archivo que no existe en disco. |
| **sin esquema** | Fila sin `esquemas` ni `ruta_esquemas_pos`. |
| **imagen huÃ©rfana** | Archivo presente en `fotos_articulos/` que ningÃºn PN referencia. |

**Regla**: estos estados son **derivados**. No convertirlos en campos persistidos en `engine_*.json` sin decisiÃ³n explÃ­cita y actualizaciÃ³n de este contrato.

## 4. Consumidores

| Consumidor | Comportamiento |
|---|---|
| [qa_imagenes.html](../../qa_imagenes.html) | **Solo lectura**. Muestra agregados, navega imÃ¡genes, no escribe en `engine_*.json`. |
| [qa_milu.html](../../qa_milu.html) (columna imÃ¡genes) | Solo lectura visual. La ediciÃ³n de imagen pasa por `/save-json` campo a campo. |
| Export WordPress | Usa `exp_imagenes` (y derivados) para construir el campo de imÃ¡genes del producto. |
| `/api/esquemas-pos-index` | Lee Ã­ndice de [esquemas_pos_circulos/](../../esquemas_pos_circulos/) cacheado al arranque del servidor. |

## 5. Reglas

1. **`qa_imagenes.html` es solo lectura.** Cualquier escritura debe ir vÃ­a endpoints `/save-json` o `/apply-revision-to-engines`.
2. **No introducir nuevos campos persistidos** para representar estados visuales/KPIs salvo decisiÃ³n explÃ­cita registrada aquÃ­.
3. **`exp_imagenes` es el campo canÃ³nico** para el listado final de imÃ¡genes de un PN.
4. **`ruta_foto` es fallback**, no sustituye a `exp_imagenes`.
5. **Las URLs de imagen son relativas al servidor estÃ¡tico** Express; no embeber rutas absolutas del filesystem.
6. Las carpetas de multimedia se tratan como **datos generados / activos**: no editar manualmente desde un editor; usar las herramientas correspondientes.

## 6. Validaciones recomendadas (futuras)

- Â¿Existe el archivo referenciado por `exp_imagenes`?
- Â¿Existe `ruta_esquemas_pos` fÃ­sico?
- Â¿Hay imÃ¡genes huÃ©rfanas en `fotos_articulos/`?
- Â¿Hay PN sin esquema asignado?

Estas validaciones deben implementarse como utilidades de auditorÃ­a (no persistir el resultado en `engine_*.json`).

## 7. Riesgos / pendientes

- **R1**: Convivencia de `exp_imagenes`, `ruta_foto`, `filename_foto` puede divergir. Falta un Ãºnico `images_normalize()` que las sincronice.
- **R2**: Algunos `exp_imagenes` histÃ³ricos pueden contener separadores mixtos (coma + salto de lÃ­nea). Mantener parser tolerante.
- **R3**: La detecciÃ³n de "ruta rota" requiere `fs.existsSync`, costoso en bulk; mantenerlo solo en endpoints de auditorÃ­a.

