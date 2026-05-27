import fitz  # PyMuPDF
import argparse

# Texto base que identifica la marca de agua central
WATERMARK_BASE = "Business Portal Online Print"

def remove_watermark_text(input_pdf, output_pdf, watermark_text):
    doc = fitz.open(input_pdf)
    removed_total = 0

    # Si te pasan "AUTO", ignoramos y usamos siempre la constante
    if watermark_text.upper() == "AUTO":
        target_text = WATERMARK_BASE
    else:
        target_text = watermark_text

    for page in doc:
        # Buscar el texto base en la página
        rects = page.search_for(target_text)

        new_rects = []
        for r in rects:
            # Ampliamos el rectángulo para cubrir toda la línea:
            # - horizontalmente: todo el ancho de la página
            # - verticalmente: un pequeño margen arriba/abajo
            pad_y = 2  # puedes subirlo a 3–4 si ves que corta demasiado justo
            big = fitz.Rect(0,
                            max(page.rect.y0, r.y0 - pad_y),
                            page.rect.width,
                            min(page.rect.y1, r.y1 + pad_y))
            new_rects.append(big)

        for r in new_rects:
            page.add_redact_annot(r)
            removed_total += 1

        if new_rects:
            page.apply_redactions()

    doc.save(output_pdf)
    doc.close()
    print(f"[OK] Eliminadas {removed_total} líneas de marca de agua. Guardado en {output_pdf}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=(
            "Eliminar la línea de marca de agua 'Business Portal Online Print <fecha>' "
            "en un PDF usando PyMuPDF."
        )
    )
    parser.add_argument("input_pdf", help="Ruta del PDF de entrada")
    parser.add_argument("output_pdf", help="Ruta del PDF de salida (PDF limpio)")
    parser.add_argument(
        "watermark_text",
        help="Texto a buscar o 'AUTO' (en AUTO usa siempre 'Business Portal Online Print').",
    )

    args = parser.parse_args()

    remove_watermark_text(
        input_pdf=args.input_pdf,
        output_pdf=args.output_pdf,
        watermark_text=args.watermark_text,
    )
