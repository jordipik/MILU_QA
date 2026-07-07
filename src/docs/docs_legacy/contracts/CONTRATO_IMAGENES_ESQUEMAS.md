# Contrato de imágenes y esquemas

> **CONTRATO MILU — v1** · Fase: CONTRATOS + ESTABILIDAD · No modifica código ni datos.
>
> Reglas oficiales para el manejo de imágenes (`exp_imagenes`, `ruta_foto`) y esquemas (`esquemas`, `ruta_esquemas_pos`).

## 1. Campos persistidos

| Campo | Tipo | Notas |
|---|---|---|
| `exp_imagenes` | string (CSV/multilínea) o array | **Fuente primaria** del export y de la UI de imágenes. |
| `ruta_foto` | string (URL) o null | Imagen principal del artículo. **Fallback** si `exp_imagenes` no aporta nada útil. |
| `filename_foto` | string o null | Basename del archivo en [fotos_articulos/](../../fotos_articulos/). |
| `esquemas` | string (PNG) | Esquema base del despiece. |
| `esquemas_circulos` | string | Esquema con círculos POS marcados. |
| `esquemas_circulos_all` | string (WebP) | Variante consolidada. |
| `ruta_esquemas_pos` | string (URL/path) | Esquema asociado al `pos` concreto de la fila. |

Las carpetas físicas son `fotos_articulos/`, `fotos_motores/`, `esquemas/`, `esquemas_pos_circulos/`. **No editar contenido manualmente.**

## 2. Prioridad de `exp_imagenes` (origen del valor)

Orden conceptual al construir/refrescar `exp_imagenes`:

1. `ruta_foto` (si existe y es URL válida).
2. `ruta_esquemas_pos` (si no hay `ruta_foto`).
3. `placeholder` / `sin_imagen` (cuando no hay nada disponible).

El valor canónico de placeholder en disco es `"sin_imagen.jpeg"`.

> **Nota**: `exp_imagenes` puede contener varias entradas separadas. El parseo se hace con `parseImagesFromValue` y de-dup con `uniq` ([server.js L163-L168](../../server.js)).

## 3. Categorías visuales (calculadas en runtime, NO persistir)

Estados que la UI deriva combinando los campos anteriores:

| Estado visual | Condición |
|---|---|
| **imagen real** | `exp_imagenes` contiene un nombre/URL real (≠ placeholder) y el archivo existe. |
| **solo esquema** | No hay imagen real, pero existe `esquemas` / `ruta_esquemas_pos`. |
| **placeholder** | `exp_imagenes` contiene `sin_imagen*`. |
| **ruta rota** | `exp_imagenes` o `ruta_foto` apunta a un archivo que no existe en disco. |
| **sin esquema** | Fila sin `esquemas` ni `ruta_esquemas_pos`. |
| **imagen huérfana** | Archivo presente en `fotos_articulos/` que ningún PN referencia. |

**Regla**: estos estados son **derivados**. No convertirlos en campos persistidos en `engine_*.json` sin decisión explícita y actualización de este contrato.

## 4. Consumidores

| Consumidor | Comportamiento |
|---|---|
| [qa_imagenes.html](../../qa_imagenes.html) | **Solo lectura**. Muestra agregados, navega imágenes, no escribe en `engine_*.json`. |
| [qa_milu.html](../../qa_milu.html) (columna imágenes) | Solo lectura visual. La edición de imagen pasa por `/save-json` campo a campo. |
| Export WordPress | Usa `exp_imagenes` (y derivados) para construir el campo de imágenes del producto. |
| `/api/esquemas-pos-index` | Lee índice de [esquemas_pos_circulos/](../../esquemas_pos_circulos/) cacheado al arranque del servidor. |

## 5. Reglas

1. **`qa_imagenes.html` es solo lectura.** Cualquier escritura debe ir vía endpoints `/save-json` o `/apply-revision-to-engines`.
2. **No introducir nuevos campos persistidos** para representar estados visuales/KPIs salvo decisión explícita registrada aquí.
3. **`exp_imagenes` es el campo canónico** para el listado final de imágenes de un PN.
4. **`ruta_foto` es fallback**, no sustituye a `exp_imagenes`.
5. **Las URLs de imagen son relativas al servidor estático** Express; no embeber rutas absolutas del filesystem.
6. Las carpetas de multimedia se tratan como **datos generados / activos**: no editar manualmente desde un editor; usar las herramientas correspondientes.

## 6. Validaciones recomendadas (futuras)

- ¿Existe el archivo referenciado por `exp_imagenes`?
- ¿Existe `ruta_esquemas_pos` físico?
- ¿Hay imágenes huérfanas en `fotos_articulos/`?
- ¿Hay PN sin esquema asignado?

Estas validaciones deben implementarse como utilidades de auditoría (no persistir el resultado en `engine_*.json`).

## 7. Riesgos / pendientes

- **R1**: Convivencia de `exp_imagenes`, `ruta_foto`, `filename_foto` puede divergir. Falta un único `images_normalize()` que las sincronice.
- **R2**: Algunos `exp_imagenes` históricos pueden contener separadores mixtos (coma + salto de línea). Mantener parser tolerante.
- **R3**: La detección de "ruta rota" requiere `fs.existsSync`, costoso en bulk; mantenerlo solo en endpoints de auditoría.
