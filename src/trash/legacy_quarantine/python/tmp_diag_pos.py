import fitz
from generate_esquema_pos import get_scheme_boxes, detect_pos_items_all, token_matches_target_pos, expand_box_in_page, resolve_pdf_path

engine = '12V4000M40A'
source_page = 13
target = '50'
pdf = resolve_pdf_path(f'{engine}_clean_marcos_mod.pdf', engine=engine, prefer_manual_framed_pdf=True)
doc = fitz.open(pdf)
page = doc.load_page(source_page - 2)
boxes = get_scheme_boxes(page)
print('pdf', pdf)
print('boxes', len(boxes))
for i, box in enumerate(boxes, start=1):
    clip_outer = expand_box_in_page(fitz.Rect(box), page.rect, 0.5)
    clip_inner = fitz.Rect(clip_outer.x0 + 1, clip_outer.y0 + 1, clip_outer.x1 - 1, clip_outer.y1 - 1)
    if clip_inner.x1 <= clip_inner.x0 or clip_inner.y1 <= clip_inner.y0:
        clip_inner = fitz.Rect(clip_outer)

    items_inner = detect_pos_items_all(page, clip_inner, dpi=200, enable_ocr=False)
    match_inner = [it for it in items_inner if token_matches_target_pos(str(it.get('pos') or ''), target)]
    print(f'box {i:02d} inner items={len(items_inner)} match50={len(match_inner)}')

    for pad in [45.0, 120.0, 260.0]:
        clip_fb = expand_box_in_page(clip_outer, page.rect, pad)
        items_fb = detect_pos_items_all(page, clip_fb, dpi=200, enable_ocr=False)
        match_fb = [it for it in items_fb if token_matches_target_pos(str(it.get('pos') or ''), target)]
        print(f'  pad {pad:>5}: items={len(items_fb)} match50={len(match_fb)}')

doc.close()
