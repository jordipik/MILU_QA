# Deteccion de Rectangulos en PDF

Esta nota documenta el proceso real que existe hoy en el repo para localizar zonas rectangulares dentro de PDFs relacionadas con esquemas.

Conclusion corta:

- No existe en el codigo actual un detector de rectangulos por color.
- El proceso implementado localiza rectangulos de imagen embebida dentro del PDF y los agrupa como esquemas.
- El runtime web no ejecuta esta deteccion; la usa un script offline en Python.
- El frontend si incluye ahora una ayuda para extraer y editar texto de highlights "azules", pero esos highlights se construyen desde texto OCR/tokenizado y overlays de UI, no desde segmentacion por color.

## Alcance real

Hay tres piezas distintas que conviene no mezclar:

1. `extraccion_de_pdf_a_excel/milu_export_esquemas_v6_2.py`
   - Es el proceso real de deteccion de rectangulos para esquemas.
   - Trabaja con PyMuPDF (`fitz`).
   - Detecta rectangulos de imagen, no colores.

2. `scripts/qa_pdf_compare.js`
   - No detecta rectangulos visuales.
   - Extrae texto con PDF.js y lo agrupa por lineas y clusters para rellenar campos `*_pdf`.

3. `js/pdf-viewer.js`
  - Renderiza el PDF y dibuja overlays de seleccion en frontend.
  - Genera highlights experimentales de fila/cabecera (`blue-token`, `violet-row`, etc.) para soporte visual de revision.
  - Expone `getPdfExperimentalBlueTexts(...)` para obtener solo el texto asociado a highlights azules actuales.
  - No decide que rectangulos existen dentro del PDF fuente.

4. `js/analista-02.js` + `analista_02.html`
  - Añaden una caja editable "Textos azules" en el panel PDF.
  - Permiten cargar texto desde highlights azules y copiarlo al portapapeles.
  - Es una utilidad de revision manual; no es deteccion geometrica del PDF base.

## Archivo responsable

El flujo documentado aqui vive en `extraccion_de_pdf_a_excel/milu_export_esquemas_v6_2.py`.

Su objetivo es:

- recorrer un PDF pagina a pagina,
- localizar bloques graficos que correspondan a esquemas,
- ampliar el recorte para incluir etiquetas cercanas,
- exportar un PNG por esquema,
- y guardar un CSV con metadatos del recorte.

## Idea general del algoritmo

El detector no analiza pixeles para buscar un color concreto. En su lugar usa la estructura interna del PDF:

1. Obtiene las imagenes embebidas de cada pagina.
2. Convierte cada imagen en uno o varios rectangulos `Rect` dentro de la pagina.
3. Filtra rectangulos demasiado pequenos por area.
4. Fusiona rectangulos cercanos o solapados para formar un esquema unico.
5. Busca textos cortos cercanos al esquema para incluir etiquetas numericas.
6. Calcula un rectangulo final ampliado.
7. Rasteriza solo esa zona y la exporta como PNG.

## Flujo paso a paso

### 1. Apertura del PDF y recorrido por paginas

La funcion `process_pdf(...)` abre el PDF con `fitz.open(pdf_path)` y recorre todas las paginas.

Por cada pagina:

- intenta extraer el BOM desde el texto de pagina,
- reutiliza el ultimo BOM conocido si la pagina actual no lo contiene,
- ejecuta la deteccion de esquemas,
- y exporta cada recorte con nombre estable.

## 2. Extraccion de BOM

Antes de recortar esquemas, el script intenta identificar el BOM con:

- `parse_bom(text)`
- `extract_bom(page)`

Este paso no afecta a la geometria del rectangulo. Sirve para:

- nombrar archivos de salida,
- enlazar esquemas con la pagina correcta,
- y rellenar el CSV de metadatos.

Si una pagina no trae BOM detectable, el script hereda el ultimo BOM valido visto en paginas anteriores.

## 3. Deteccion base de rectangulos de imagen

La deteccion geometrica empieza en `get_image_rects(page, min_area=0)`.

Proceso:

1. `page.get_images(full=True)` devuelve las imagenes embebidas de la pagina.
2. Para cada imagen, `page.get_image_rects(xref)` devuelve sus rectangulos de colocacion.
3. Solo se conservan rectangulos con `area >= min_area`.

Esto significa que el algoritmo parte de objetos imagen ya presentes en el PDF. No hace segmentacion por color ni por borde rectangular visible.

### Implicacion importante

Si un esquema esta dibujado como vector puro y no como imagen embebida, este flujo puede no detectarlo.

## 4. Fusion de rectangulos cercanos

Los rectangulos base pasan por `merge_overlapping(rects, pad=8)`.

Objetivo:

- unir imagenes cercanas que en realidad forman un mismo esquema,
- evitar exportar varios recortes fragmentados para una sola ilustracion.

Heuristica usada:

- cada rectangulo se expande virtualmente con `expand(rect, pad)`,
- si dos rectangulos expandidos se intersectan, se fusionan con union geometrica,
- se hace una segunda pasada iterativa hasta que ya no quedan grupos solapados.

El resultado es una lista de clusters de imagen, cada uno representando un esquema candidato.

## 5. Inclusion de etiquetas cercanas

Una vez obtenido cada cluster, el script inspecciona el texto de la pagina con `get_text_spans_rects(page)`.

Ese helper extrae todos los `spans` de texto con:

- `page.get_text("dict")`
- lectura de `blocks -> lines -> spans`
- conversión de cada `bbox` a `fitz.Rect`

Luego `crop_schemes_from_page(...)` decide que textos incluir alrededor del esquema.

Se incluye un texto si se cumplen estas condiciones:

- el texto es corto: `len(t) <= 8`, o
- coincide con la regex `NUM_RE`, orientada a etiquetas numericas o codigos breves,
- y su rectangulo cae dentro de una expansion del cluster (`nearby_pad`).

Con esto se intenta capturar:

- numeros de posicion,
- pequeñas etiquetas pegadas al dibujo,
- y anotaciones cortas que visualmente pertenecen al esquema.

## 6. Construccion del rectangulo final

Para cada cluster se construye una lista `include_rects` con:

- el rectangulo principal del cluster,
- mas los rectangulos de texto corto cercanos.

Despues:

1. `rect_union(include_rects)` calcula la union minima que contiene todo.
2. `expand(final_rect, pad)` añade margen exterior.

Ese `final_rect` es el recorte real que se exporta.

## 7. Rasterizacion y exportacion

Con el rectangulo ya decidido, el script rasteriza solo esa region:

- calcula `zoom = dpi / 72.0`,
- crea `mat = fitz.Matrix(zoom, zoom)`,
- llama a `page.get_pixmap(matrix=mat, clip=final_rect, alpha=False)`.

Salida por cada esquema detectado:

- un PNG recortado,
- y una fila CSV con:
  - nombre del PDF,
  - pagina,
  - indice del esquema,
  - BOM crudo y formateado,
  - nombre de archivo,
  - coordenadas del rectangulo en puntos PDF,
  - DPI,
  - ancho y alto en pixeles.

## Parametros que gobiernan la deteccion

Los principales parametros del detector son:

- `min_img_area`
  - area minima para aceptar un rectangulo de imagen.
  - subiendolo se reducen falsos positivos pequenos.
  - bajandolo se detectan mas fragmentos, con mas riesgo de ruido.

- `cluster_pad`
  - margen usado al fusionar rectangulos cercanos.
  - si es bajo, un esquema fragmentado puede salir dividido.
  - si es alto, esquemas vecinos pueden fusionarse por error.

- `pad`
  - margen final del recorte exportado.
  - afecta a cuanto aire y cuantas etiquetas adicionales quedan dentro del PNG.

- `dpi`
  - resolucion de rasterizado.
  - no cambia la deteccion, solo la calidad y tamano del PNG exportado.

Valores por defecto actuales:

- `dpi=300`
- `min_img_area=20000`
- `pad=12`
- `cluster_pad=16`

## Que significa exactamente "rectangulo" aqui

En este flujo, un rectangulo es una caja geometrica del PDF (`fitz.Rect`) asociada a:

- la colocacion de una imagen embebida, o
- la caja de un span de texto.

No significa:

- un rectangulo rojo, azul o verde detectado por inspeccion de pixeles,
- una forma vectorial detectada por su color de relleno,
- ni una anotacion de color encontrada en un canvas del navegador.

## Relacion con el frontend

### `scripts/qa_pdf_compare.js`

Este script trabaja en otro carril:

- abre el PDF con PDF.js,
- extrae texto estructurado de una pagina,
- agrupa items por linea usando tolerancia vertical,
- fusiona tokens cercanos en clusters horizontales,
- y busca coincidencias para poblar campos `*_pdf`.

No usa color, no recorta imagenes y no detecta rectangulos visuales.

### `js/pdf-viewer.js`

El visor web:

- renderiza la pagina en canvas,
- mantiene overlays de seleccion,
- dibuja highlights para ayudar a la revision humana,
- y puede devolver el texto de highlights azules activos con `getPdfExperimentalBlueTexts({ dedupe })`.

Esos overlays son rectangulos de UI, no rectangulos detectados dentro del PDF de origen.

### `analista_02.html` + `js/analista-02.js`

En el panel derecho del modo Analista existe una seccion "Textos azules" con:

- boton `Cargar azules`,
- boton `Copiar`,
- y un `textarea` editable.

Flujo real:

1. Se marca fila/cabecera en PDF (highlights experimentales).
2. Se invoca `getPdfExperimentalBlueTexts(...)`.
3. Se vuelca el resultado en la caja editable.

Esto no altera el pipeline offline de deteccion de esquemas y no implica deteccion por color.

## Limitaciones actuales

Las limitaciones mas importantes del proceso son estas:

1. Depende de imagenes embebidas en el PDF.
2. Puede ignorar esquemas dibujados solo con primitivas vectoriales.
3. No diferencia por color del contenido.
4. Las etiquetas largas cercanas no se incluyen, porque el filtro prioriza textos cortos.
5. Un mal ajuste de `cluster_pad` puede separar o unir esquemas de forma incorrecta.

## Si realmente se quiere deteccion por color

Eso seria otro pipeline, distinto del actual. Haria falta una estrategia como una de estas:

- rasterizar la pagina completa,
- segmentar por color en espacio RGB/HSV,
- detectar componentes conectados o contornos,
- y convertir esas mascaras a bounding boxes.

Ese comportamiento no esta implementado hoy en el repo.

## Comando de uso

El script puede ejecutarse de forma offline sobre un PDF concreto con su CLI propia. La forma exacta depende del entorno Python local, pero el contrato del archivo es:

- entrada: PDF
- salida: carpeta con PNGs recortados y un CSV resumen

Los parametros relevantes son `--dpi`, `--min-img-area`, `--pad` y `--cluster-pad`.

## Resumen operativo

Si hoy en MILU se habla de "deteccion de rectangulos de PDF", tecnicamente significa esto:

- localizar rectangulos de imagen embebida en una pagina PDF,
- fusionarlos por proximidad,
- ampliar el recorte con etiquetas cortas cercanas,
- y exportar ese bounding box como esquema.

No significa deteccion por color.

## Nota de estado (2026-05)

Desde mayo de 2026, el runtime web incorpora utilidades de extraccion de texto sobre highlights azules para acelerar revision manual en Analista. Esa mejora convive con el proceso offline de PyMuPDF, pero no cambia la definicion tecnica de "deteccion de rectangulos" de este documento.