import fitz
from generate_esquema_pos import get_scheme_boxes, detect_pos_items_all, token_matches_target_pos, expand_box_in_page, resolve_pdf_path

engine='12V4000M40A'; source_page=13; target='70'
pdf=resolve_pdf_path(f'{engine}_clean_marcos_mod.pdf', engine=engine, prefer_manual_framed_pdf=True)
doc=fitz.open(pdf); page=doc.load_page(source_page-2); boxes=get_scheme_boxes(page)
for i,box in enumerate(boxes, start=1):
    clip_outer=expand_box_in_page(fitz.Rect(box), page.rect, 0.5)
    clip_inner=fitz.Rect(clip_outer.x0+1,clip_outer.y0+1,clip_outer.x1-1,clip_outer.y1-1)
    if clip_inner.x1<=clip_inner.x0 or clip_inner.y1<=clip_inner.y0: clip_inner=fitz.Rect(clip_outer)
    for pad in [0.0,45.0,120.0]:
        clip=clip_inner if pad==0 else expand_box_in_page(clip_outer,page.rect,pad)
        items=detect_pos_items_all(page, clip, dpi=200, enable_ocr=True)
        m=[it for it in items if token_matches_target_pos(str(it.get('pos') or ''),target)]
        print(f'box {i:02d} pad {pad:>5}: match70={len(m)}')
        if m:
            it=m[0]
            if it.get('source')=='OCR':
                print('  sample OCR px',it.get('px'))
            else:
                r=it.get('rect_pdf');print('  sample TEXT rect',round(r.x0,1),round(r.y0,1),round(r.x1,1),round(r.y1,1))

doc.close()
