> **PROPUESTA — PENDIENTE DE VALIDAR**
>
> Propuesta de pipeline visual para PDF. No implementada.
>
> Movido a `docs/proposals/` el 2026-05-12. **No representa el estado actual del código.**

---

# 08 - PDF Visual Pipeline (continuacion)

Fecha base: 2026-04-22

## Objetivo
Definir y ejecutar un pipeline de lectura PDF VISUAL separado del pipeline PDF AUTOMATICO actual.

## Decisiones cerradas
1. El pipeline PDF automatico actual NO se toca.
2. El pipeline visual sera distinto y separado.
3. El pipeline visual NO buscara valores por clave; leera texto visible de la pagina.
4. Se puede reutilizar codigo existente de extraccion en:
   - extraccion_de_pdf_a_excel/milu_export_datos_v6_2.py
   - extraccion_de_pdf_a_excel/milu_export_paginas_v1.py

## Contexto tecnico rapido
- Runtime web: Express en server.js + frontend modular en js/.
- Flujo automatico actual: endpoint /recompute-pdf-auto + scripts/qa_pdf_compare.js.
- La carpeta extraccion_de_pdf_a_excel ya tiene piezas para enfoque visual (tablas por geometria + export de paginas a imagen).

## Alcance de la siguiente fase
Implementar un carril nuevo llamado "PDF visual" que:
1. Lea contenido por pagina sin depender de campos objetivo.
2. Devuelva salida cruda (texto/bloques/filas) para inspeccion humana.
3. Permita fallback OCR si una pagina no trae texto estructurado usable.
4. No altere comportamiento ni resultados del carril automatico.

## Arquitectura propuesta (version 1)
1. Backend (Express)
   - Nuevo endpoint: POST /pdf-visual-read
   - Input minimo: { pdfPath o book, pageNumber opcional, mode }
   - Output: JSON con metadatos + contenido leido por pagina.

2. Motor visual
   - Paso A: Extraccion estructural (pdfplumber/tables) cuando sea posible.
   - Paso B: Extraccion de texto por bloques/lineas.
   - Paso C (fallback): OCR sobre imagen de pagina (si aplica).
   - Importante: no buscar claves concretas ni hacer matching contra campos.

3. Frontend
   - Nuevo panel o pestana "PDF visual".
   - Mostrar lectura por pagina en bruto (tabla + texto + confianza si existe).
   - Accion opcional: guardar snapshot JSON del resultado visual.

4. Persistencia
   - Archivo dedicado de salida visual (no mezclar con qa_revision_server_data.json ni engine_*.json).
   - Ejemplo: qa_pdf_visual_read_<engine>_<timestamp>.json

## Formato de salida recomendado (JSON)
{
  "runId": "uuid-o-timestamp",
  "source": {
    "pdf": "ruta o id",
    "engine": "opcional"
  },
  "mode": "visual",
  "pages": [
    {
      "page": 1,
      "method": "table|text|ocr",
      "blocks": [
        {
          "text": "texto leido",
          "bbox": [x1, y1, x2, y2],
          "confidence": 0.0
        }
      ],
      "rows": [
        ["col1", "col2", "col3"]
      ]
    }
  ],
  "warnings": [],
  "createdAt": "ISO-8601"
}

## Criterios de aceptacion
1. El endpoint /recompute-pdf-auto sigue funcionando igual (sin cambios funcionales).
2. El endpoint nuevo devuelve lectura visual sin buscar valores objetivo.
3. Existe salida JSON visual por ejecucion.
4. La UI puede lanzar la lectura visual y renderizar el resultado.

## Preguntas pendientes para cerrar antes de codificar
1. Ejecucion del motor visual:
   - Integrado dentro de Node
   - O invocado como proceso Python externo

2. Nivel de salida inicial:
   - Solo JSON crudo
   - JSON + export CSV/Excel

3. OCR:
   - Permitimos dependencia local (Tesseract/PaddleOCR)
   - O primera version sin OCR

4. UX:
   - Panel nuevo dedicado
   - O pestana dentro del flujo QA actual

## Plan de implementacion sugerido (iterativo)
1. Crear endpoint POST /pdf-visual-read en server.js.
2. Crear modulo nuevo scripts/pdf_visual_read.js (o wrapper Python).
3. Devolver JSON minimo por pagina (metadatos + texto/bloques).
4. Conectar boton en qa_milu.html/js para lanzar lectura visual.
5. Guardar snapshot en archivo qa_pdf_visual_read_*.json.
6. Validar con un PDF real y documentar limitaciones.

## Prompt listo para retomar otro dia
Copia y pega este prompt en una nueva sesion:

"""
Quiero continuar el trabajo del pipeline PDF VISUAL separado en MILU.

Reglas fijas:
1) NO tocar el pipeline automatico actual (/recompute-pdf-auto y scripts/qa_pdf_compare.js).
2) Implementar un pipeline distinto llamado PDF visual que lea texto visible por pagina sin buscar valores por clave.
3) Reutilizar cuando ayude el contenido de extraccion_de_pdf_a_excel/milu_export_datos_v6_2.py y extraccion_de_pdf_a_excel/milu_export_paginas_v1.py.
4) Añadir endpoint POST /pdf-visual-read y salida JSON por ejecucion qa_pdf_visual_read_<engine>_<timestamp>.json.
5) Integrar una UI minima para ejecutar lectura visual y ver resultado crudo por pagina.

Primero:
- revisa docs/08_pdf_visual_pipeline_prompt.md,
- propon un plan corto,
- y luego implementa en pasos pequenos con validacion al final.
"""

## Nota de continuidad
Si en la siguiente sesion hay duda entre ambos flujos:
- "automatico" = busqueda determinista de valores (actual, congelado).
- "visual" = lectura libre de contenido de pagina (nuevo, separado).
