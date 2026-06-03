import json
import fitz
from generate_esquema_pos import resolve_pdf_path, get_scheme_boxes, expand_box_in_page, detect_pos_items_all

engine = "12V4000M40A"
pdf_path = resolve_pdf_path("", engine=engine, prefer_manual_framed_pdf=True)
doc = fitz.open(str(pdf_path))
page = doc.load_page(17)  # Source Page 18
boxes = get_scheme_boxes(page)
print(f"pdf={pdf_path}")
print(f"boxes={len(boxes)}")
if not boxes:
    raise SystemExit(1)
box = fitz.Rect(boxes[0])
clip_outer = expand_box_in_page(box, page.rect, 0.5)
clip_inner = fitz.Rect(clip_outer.x0 + 1.0, clip_outer.y0 + 1.0, clip_outer.x1 - 1.0, clip_outer.y1 - 1.0)
if clip_inner.x1 <= clip_inner.x0 or clip_inner.y1 <= clip_inner.y0:
    clip_inner = fitz.Rect(clip_outer)

print("box0", [round(v,2) for v in [box.x0, box.y0, box.x1, box.y1]])
print("clip_inner", [round(v,2) for v in [clip_inner.x0, clip_inner.y0, clip_inner.x1, clip_inner.y1]])

items_inner = detect_pos_items_all(page, clip_inner, dpi=200, enable_ocr=True)
print(f"items_inner={len(items_inner)}")
for it in items_inner:
    p = str(it.get("pos") or "")
    if p in {"50", "55"}:
        print("INNER_MATCH", it)

# wider probe around the same box
clip_wide = expand_box_in_page(clip_outer, page.rect, 160.0)
items_wide = detect_pos_items_all(page, clip_wide, dpi=200, enable_ocr=True)
print(f"items_wide={len(items_wide)}")
for it in items_wide:
    p = str(it.get("pos") or "")
    if p in {"50", "55"}:
        print("WIDE_MATCH", it)

# print text words equal to 50 or 55 with absolute pdf rect
for w in page.get_text("words"):
    x0,y0,x1,y1,word,*_ = w
    word = str(word).strip()
    if word in {"50", "55"}:
        r = fitz.Rect(x0,y0,x1,y1)
        print("WORD", word, [round(v,2) for v in [r.x0,r.y0,r.x1,r.y1]], "in_inner", bool(clip_inner.contains(r)), "in_wide", bool(clip_wide.contains(r)))
