#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MILU v6_2 – Batch PDF → Excel/CSV (WordPress) basado estrictamente en v3_4, con:
- Misma lógica de extracción/tablas/imagenes y mismos defaults, solo actualización de nombres/rutas a v6_2.
- Detección reforzada, dedupe por página, filtro estricto de Part No., y mapeo de imágenes por BOM.
- Progreso en consola con tqdm.
Uso:
  python milu_batch_extract_v6_2.py --input ./milu-pdfs_v6_2 --output ./milu-out_v6_2 --config ./config_v6_2.json
"""
import argparse, os, re, json, subprocess
from typing import List, Dict, Any, Tuple, Set
import pandas as pd

try:
    from tqdm import tqdm
except Exception as e:
    raise RuntimeError("Falta tqdm. Instala dependencias con: pip install -r requirements_v6_2.txt") from e

try:
    import pdfplumber
except Exception as e:
    raise RuntimeError("Falta pdfplumber. Instala dependencias con: pip install -r requirements_v6_2.txt") from e

DEFAULT_CONFIG = {
    "chunk_size": 80,
    "strategies": [
        {"vertical_strategy":"text","horizontal_strategy":"text","snap_tolerance":4,"join_tolerance":2},
        {"vertical_strategy":"lines","horizontal_strategy":"lines"},
        {"vertical_strategy":"text","horizontal_strategy":"lines"},
        {"vertical_strategy":"lines","horizontal_strategy":"text"}
    ],
    "min_header_hits": 2,
    "pdf_header_order": ["POS","PART NO.","DESIGNATION","MODEL/TYPE","QTY","UNITS","WEIGHT","FN","MEASUREMENT / STANDARD"],
    "wp_columns": [
        "SKU","Name","Description","Short description","Categories","Tags",
        "Regular price","Sale price","Images","Image alt text",
        "Stock status","Stock","Weight (kg)","Length (cm)","Width (cm)","Height (cm)",
        "Attribute 1 name","Attribute 1 value(s)",
        "Attribute 2 name","Attribute 2 value(s)",
        "Attribute 3 name","Attribute 3 value(s)",
        "Image 1","Image 2","Image 3","Image 4","Image 5","Image 6","Image count",
        "Source File","Source Page","FG/FGS","BOM-No.","FN","MODEL/TYPE","QTY","UNITS","MEASUREMENT / STANDARD","POS"
    ],
    "sheet_pdf_name": "CATALOGO_PDF",
    "sheet_wp_name": "WordPress",
    "category_prefix": "FG/FGS: ",
    "subcat_attribute_name": "Subcategoría (BOM-No.)",
    "attribute_2_name": "Modelo/Tipo",
    "attribute_3_name": "Medida/Norma",
    "skip_empty_rows": True,
    "extract_images": True,
    "footer_drop_patterns": ["Business\\s*Portal","MTU\\s*Friedrichshafen","\\b21012\\b","A\\s+Rolls-Royce"],
    "image_aware_crop": True,
    "image_crop_margin": 4,
    "grid_scan": True,
    "grid_rows": 2,
    "grid_cols": 2,
    "force_bboxes": [],
    # Imágenes
    "images_subdir": "images_v6_2",
    "max_images_per_page": 6
}

EXPECTED_COLS = ["POS","PART NO.","PART NO","PART","DESIGNATION","MODEL/TYPE","QTY","UNIT","UNITS","MEASUREMENT","MEASUREMENT / STANDARD","STANDARD","WEIGHT","FN"]
SYNONYMS = {
    "PART NO": "PART NO.",
    "PART": "PART NO.",
    "UNIT": "UNITS",
    "MEASUREMENT/ STANDARD": "MEASUREMENT / STANDARD",
    "MEASUREMENT/STANDARD": "MEASUREMENT / STANDARD",
    "STD": "MEASUREMENT / STANDARD",
    "STANDARD": "MEASUREMENT / STANDARD",
    "F/N": "FN"
}

NAN_LIKE_TOKENS = {"nan", "none", "null", "nat"}

# --- Validadores ---
PARTNO_RX = re.compile(r'^[A-Z]?\d{8,13}$')
def looks_like_part_no(s: str) -> bool:
    s = (s or "").strip()
    if " PC " in s or " KG " in s or " TO " in s:
        return False
    s2 = s.replace(" ", "").replace(",", "")
    return bool(PARTNO_RX.fullmatch(s2))

def normalize_header(cell):
    if cell is None: return ""
    c = str(cell).strip().upper()
    c = re.sub(r"\s+"," ",c)
    c = c.replace("N°","NO").replace("Nº","NO").replace("№","NO")
    return SYNONYMS.get(c, c)


def sanitize_cell_value(cell):
    if cell is None:
        return None
    try:
        if pd.isna(cell):
            return None
    except Exception:
        pass

    text = str(cell).strip()
    if not text:
        return None
    if text.lower() in NAN_LIKE_TOKENS:
        return None
    return text

def strip_footers(text, footer_patterns):
    if not text: return text
    lines = text.splitlines()
    pats = [re.compile(p, re.IGNORECASE) for p in footer_patterns]
    keep = [ln for ln in lines if not any(p.search(ln) for p in pats)]
    return "\n".join(keep)

def parse_fg(text):
    if not text: return None
    m2 = re.search(r"FG/FGS[:\s]+(\d{1,3})\s+(\d{1,3})", text, re.IGNORECASE)
    if m2:
        a,b = m2.group(1), m2.group(2)
        return f"{a.zfill(3)}-{b.zfill(2)}"
    m1 = re.search(r"FG/FGS[:\s]+(\d{1,3})", text, re.IGNORECASE)
    if m1:
        return m1.group(1).zfill(3)
    return None

def parse_bom(text):
    if not text:
        return None

    # 1) Formato clásico numérico: 123.12345
    m = re.search(r"BOM[-\s]?No\.?[:\s]+([0-9]{3}\.[0-9]{5})", text, re.IGNORECASE)
    if m:
        return m.group(1)

    # 2) Formato general alfanumérico
    m2 = re.search(r"BOM[-\s]?No\.?[:\s]+([A-Za-z0-9\.\-_]+)", text, re.IGNORECASE)
    return m2.group(1) if m2 else None


def header_score(row):
    headers = [normalize_header(c) for c in row]
    return sum(1 for h in headers for ec in EXPECTED_COLS if ec in h)

def best_header_row_and_mapping(table_rows, min_hits):
    best_idx, best_sc, best_map = None, -1, None
    max_check = min(6, len(table_rows))
    for i in range(max_check):
        row = table_rows[i]
        sc = header_score(row)
        if sc > best_sc:
            best_sc = sc; best_idx = i
            mapping = {}
            for idx,h in enumerate(row):
                H = normalize_header(h)
                if "PART" in H and "NO" in H: mapping[idx]="PART NO."
                elif H.startswith("POS"): mapping[idx]="POS"
                elif "DESIGNATION" in H or "DESCRIPTION" in H: mapping[idx]="DESIGNATION"
                elif "MODEL" in H or "TYPE" in H: mapping[idx]="MODEL/TYPE"
                elif "QTY" in H: mapping[idx]="QTY"
                elif "UNIT" in H: mapping[idx]="UNITS"
                elif "WEIGHT" in H: mapping[idx]="WEIGHT"
                elif "MEASUREMENT" in H or "STANDARD" in H: mapping[idx]="MEASUREMENT / STANDARD"
                elif re.fullmatch(r"FN|F/N", H): mapping[idx]="FN"
                else: mapping[idx]=H
            best_map = mapping
    if best_sc < min_hits:
        return None, best_sc, None
    return best_idx, best_sc, best_map

def coalesce(*vals):
    for v in vals:
        if v is None: continue
        s = str(v).strip()
        if s != "": return s
    return ""

def row_signature(page:int, rec:dict)->str:
    pos = coalesce(rec.get("POS"), rec.get("C1"))
    pno = coalesce(rec.get("PART NO."), rec.get("PART"), rec.get("PART NO"), rec.get("C2"))
    dsg = coalesce(rec.get("DESIGNATION"), rec.get("C3"), rec.get("C4"))
    sig = f"{page}|{pos.upper()}|{pno.upper()}|{dsg.upper()}"
    return re.sub(r"\s+"," ",sig)

def row_has_footer_noise(rec:dict, footer_patterns)->bool:
    pos_norm = re.sub(r"\s+", " ", str(rec.get("POS") or rec.get("C1") or "").strip()).lower()
    if pos_norm == "tu fri":
        return True

    pats = [re.compile(p, re.IGNORECASE) for p in footer_patterns]
    for v in rec.values():
        if v is None: continue
        if any(p.search(str(v)) for p in pats): return True
    return False

# --- Fusión de duplicados por POS en la misma página ---
def normalize_pos_value(v: Any) -> str:
    s = str(v or "").strip().upper()
    return re.sub(r"\s+", "", s)

def pick_best(values: List[Any], column: str) -> str:
    vals = [str(v).strip() for v in values if v is not None and str(v).strip() != ""]
    if not vals:
        return ""
    # PART NO: priorizar valores que cumplan el patrón
    if column in {"PART NO.", "PART", "PART NO", "C2"}:
        val_candidates = [v for v in vals if looks_like_part_no(v)]
        return val_candidates[0] if val_candidates else vals[0]
    # Campos de texto: quedarse con el más largo
    if column in {"DESIGNATION", "C3", "C4", "MODEL/TYPE", "MEASUREMENT / STANDARD", "FN"}:
        return max(vals, key=len)
    # Numéricos: priorizar el que pueda parsearse
    if column in {"QTY", "WEIGHT"}:
        for v in vals:
            try:
                float(v.replace(",", "."))
                return v
            except Exception:
                continue
        return vals[0]
    # POS: ya agrupamos por POS; conservar la primera
    if column == "POS":
        return vals[0]
    # Por defecto: primera no vacía
    return vals[0]

def merge_group_rows(df_group: pd.DataFrame) -> dict:
    merged = {}
    all_cols: Set[str] = set()
    for _, r in df_group.iterrows():
        all_cols.update(list(r.index))
    for c in all_cols:
        if c == "POS_norm":
            continue
        col_vals = df_group[c].tolist() if c in df_group.columns else []
        merged[c] = pick_best(col_vals, c)
    merged["Page"] = df_group["Page"].iloc[0]
    if "POS" in df_group.columns:
        merged["POS"] = pick_best(df_group["POS"].tolist(), "POS")
    return merged

def merge_duplicates_by_pos(df: pd.DataFrame) -> pd.DataFrame:
    """
    Fusiona filas duplicadas con misma (Page, POS). Mantiene una sola fila por POS y página,
    combinando la información útil de ambas.
    """
    if df.empty or "Page" not in df.columns or "POS" not in df.columns:
        return df
    df2 = df.copy()
    df2["POS_norm"] = df2["POS"].apply(normalize_pos_value)

    rows = []
    for (page, pos_norm), g in df2.groupby(["Page", "POS_norm"], dropna=False):
        g = g.drop(columns=["POS_norm"], errors="ignore")
        # POS vacío: no tocamos (se mantienen tal cual)
        if not pos_norm:
            rows.extend(g.to_dict("records"))
            continue
        # Duplicados reales por (Page, POS) -> fusionar
        if len(g) > 1:
            rows.append(merge_group_rows(g))
        else:
            rows.append(g.iloc[0].to_dict())
    return pd.DataFrame(rows)

# --- Extracción por región ---
def process_region(page, bbox, strategies, min_hits, footer_patterns, fg_val, bom_val, seen_rows:Set[str]):
    rows = []; captured = 0
    try:
        region = page.within_bbox(bbox) if bbox else page
    except Exception:
        return rows, captured

    for ts in strategies:
        try:
            tbls = region.extract_tables(table_settings=ts) or []
        except Exception:
            tbls = []
        for tbl in tbls:
            if not tbl or len(tbl) < 2: continue
            hdr_idx, hdr_sc, mapping = best_header_row_and_mapping(tbl, min_hits)
            if hdr_idx is None or mapping is None:
                mapping = {idx: normalize_header(h) for idx,h in enumerate(tbl[0])}
                data_rows = tbl[1:]
            else:
                data_rows = tbl[hdr_idx+1:]
            for r in data_rows:
                if r is None or all((c is None or str(c).strip()=="") for c in r): continue
                rec={"FG/FGS":fg_val,"BOM-No.":bom_val}
                for idx,cell in enumerate(r):
                    key = mapping.get(idx, f"C{idx+1}")
                    rec[key] = sanitize_cell_value(cell)
                if "POS" not in rec or rec.get("POS","")== "":
                    c1 = rec.get("C1","")
                    if re.fullmatch(r"\d+[A-Z]?", c1): rec["POS"]=c1
                # Filtro estricto por Part No. (se permite pasar si hay POS)
                pno_cand = coalesce(rec.get("PART NO."), rec.get("PART"), rec.get("PART NO"), rec.get("C2"))
                if not looks_like_part_no(pno_cand) and not rec.get("POS"):
                    continue
                if row_has_footer_noise(rec, footer_patterns): continue
                if not any(rec.get(k) for k in ["PART NO.","DESIGNATION","C2","C3","POS"]): continue
                sig = row_signature(page.page_number, rec)
                if sig in seen_rows: continue
                seen_rows.add(sig)
                rows.append(rec); captured += 1
    return rows, captured

def extract_all_pages(pdf_path, strategies, min_hits, footer_patterns, cfg):
    rows=[]; logs=[]
    with pdfplumber.open(pdf_path) as pdf:
        total_pages = len(pdf.pages)
        with tqdm(total=total_pages, desc=f"{os.path.basename(pdf_path)}", unit="page") as pbar:
            for p in range(1, total_pages+1):
                page = pdf.pages[p-1]
                text = strip_footers(page.extract_text() or "", footer_patterns)
                fg_val = parse_fg(text)
                bom_val = parse_bom(text)
                seen_rows=set()
                captured=0

                # Full page
                full_bbox = (0,0,float(page.width), float(page.height))
                rr, cc = process_region(page, full_bbox, strategies, min_hits, footer_patterns, fg_val, bom_val, seen_rows)
                rows.extend([dict(r, **{"Page":p}) for r in rr]); captured += cc

                # Image-aware bottom area
                if cfg.get("image_aware_crop", True):
                    try:
                        images = page.images or []
                    except Exception:
                        images = []
                    if images:
                        max_y = max((max(img.get("y0",0), img.get("y1",0)) for img in images), default=0)
                        margin = cfg.get("image_crop_margin", 4)
                        bottom_bbox = (0, max_y+margin, float(page.width), float(page.height))
                        rr, cc = process_region(page, bottom_bbox, strategies, min_hits, footer_patterns, fg_val, bom_val, seen_rows)
                        rows.extend([dict(r, **{"Page":p}) for r in rr]); captured += cc

                # Bottom-half & bottom-third
                H = float(page.height); W = float(page.width)
                half_bbox = (0, H*0.45, W, H)
                rr, cc = process_region(page, half_bbox, strategies, min_hits, footer_patterns, fg_val, bom_val, seen_rows)
                rows.extend([dict(r, **{"Page":p}) for r in rr]); captured += cc
                third_bbox = (0, H*0.66, W, H)
                rr, cc = process_region(page, third_bbox, strategies, min_hits, footer_patterns, fg_val, bom_val, seen_rows)
                rows.extend([dict(r, **{"Page":p}) for r in rr]); captured += cc

                # Grid scan
                if cfg.get("grid_scan", True):
                    gr = max(1, int(cfg.get("grid_rows",2))); gc = max(1, int(cfg.get("grid_cols",2)))
                    cell_h, cell_w = H/gr, W/gc
                    for r in range(gr):
                        for c in range(gc):
                            bbox=(c*cell_w, r*cell_h, (c+1)*cell_w, (r+1)*cell_h)
                            rr, cc2 = process_region(page, bbox, strategies, min_hits, footer_patterns, fg_val, bom_val, seen_rows)
                            if rr:
                                rows.extend([dict(x, **{"Page":p}) for x in rr])
                                captured += cc2

                # Forced bboxes
                for fb in cfg.get("force_bboxes", []):
                    if int(fb.get("page", -1)) == p and isinstance(fb.get("bbox"), list) and len(fb["bbox"])==4:
                        rr, cc = process_region(page, tuple(fb["bbox"]), strategies, min_hits, footer_patterns, fg_val, bom_val, seen_rows)
                        rows.extend([dict(r, **{"Page":p}) for r in rr]); captured += cc

                logs.append({"page":p,"rows":captured,"fg":fg_val,"bom":bom_val})
                pbar.update(1)
    return pd.DataFrame(rows), logs

# --------- IMAGENES ---------
def ensure_dir(path:str):
    os.makedirs(path, exist_ok=True); return path

def extract_images_with_pdfimages(pdf_path:str, out_images_dir:str, prefix:str) -> Dict[int, list]:
    cmd = ["pdfimages", "-p", "-all", pdf_path, os.path.join(out_images_dir, prefix)]
    try:
        subprocess.run(cmd, capture_output=True, text=True, check=False)
    except FileNotFoundError:
        return {}
    except Exception:
        return {}

    by_page = {}
    for name in sorted(os.listdir(out_images_dir)):
        if not name.startswith(prefix): continue
        m = re.search(rf"{re.escape(prefix)}-(\d+)-\d+\.", name)
        if not m: continue
        page_num = int(m.group(1))
        by_page.setdefault(page_num, []).append(os.path.join(out_images_dir, name))
    return by_page

def rename_images_by_bom(by_page: Dict[int, list], bom_by_page: Dict[int, str], out_images_dir:str, pdf_base:str, max_images:int=6) -> Dict[int, list]:
    mapped = {}
    for page, files in by_page.items():
        bom = bom_by_page.get(page, "") or "UNSPEC"
        bom_safe = bom.replace("/", "-").replace("\\", "-").replace(" ", "").replace(":", "")
        files = files[:max_images]
        new_list = []
        for idx, f in enumerate(files, start=1):
            root, ext = os.path.splitext(f)
            new_name = f"BOM{bom_safe}_p{page:03d}_img{idx}{ext}"
            new_path = os.path.join(out_images_dir, new_name)
            try:
                os.replace(f, new_path)
            except Exception:
                new_path = f
            new_list.append(new_path)
        mapped[page] = new_list
    return mapped

def build_bom_by_page(df_pdf: pd.DataFrame) -> Dict[int, str]:
    bom_by_page = {}
    if "Source Page" in df_pdf.columns and "BOM-No." in df_pdf.columns:
        for _, r in df_pdf.iterrows():
            p = r.get("Source Page")
            b = str(r.get("BOM-No.", "") or "").strip()
            if not p:
                continue
            try:
                p = int(p)
            except Exception:
                continue
            if p not in bom_by_page or not bom_by_page[p]:
                bom_by_page[p] = b
    return bom_by_page

# --------- TRANSFORMACIONES ---------
def to_pdf_order(df_all, cfg, source_file):
    cols = cfg.get("pdf_header_order")
    out=[]
    for _,r in df_all.iterrows():
        row={}
        row["POS"]=coalesce(r.get("POS"), r.get("C1"))
        row["PART NO."]=coalesce(r.get("PART NO."), r.get("PART"), r.get("PART NO"), r.get("C2"))
        row["DESIGNATION"]=coalesce(r.get("DESIGNATION"), r.get("C3"), r.get("C4"))
        row["MODEL/TYPE"]=coalesce(r.get("MODEL/TYPE"))
        row["QTY"]=coalesce(r.get("QTY"))
        row["UNITS"]=coalesce(r.get("UNITS"), r.get("UNIT"))
        row["WEIGHT"]=coalesce(r.get("WEIGHT"))
        row["FN"]=coalesce(r.get("FN"))
        row["MEASUREMENT / STANDARD"]=coalesce(r.get("MEASUREMENT / STANDARD"))
        row["FG/FGS"]=coalesce(r.get("FG/FGS"))
        row["BOM-No."]=coalesce(r.get("BOM-No."))
        row["Source Page"]=r.get("Page","")
        out.append(row)
    ordered = cols + ["FG/FGS","BOM-No.","Source Page"]
    df_pdf = pd.DataFrame(out, columns=ordered)
    df_pdf = df_pdf[~((df_pdf["PART NO."]=="") & (df_pdf["DESIGNATION"]=="") & (df_pdf["POS"]==""))].reset_index(drop=True)
    return df_pdf

def to_wp(df_all, cfg, source_file, images_by_page: Dict[int, list]):
    rows=[]
    max_imgs = int(cfg.get("max_images_per_page", 6))
    for _,r in df_all.iterrows():
        sku = coalesce(r.get("PART NO."), r.get("PART"), r.get("PART NO"), r.get("C2"))
        name= coalesce(r.get("DESIGNATION"), r.get("C3"), r.get("C4"))
        fg  = coalesce(r.get("FG/FGS"))
        cat = (cfg["category_prefix"] + fg) if fg else ""
        a1n = cfg["subcat_attribute_name"] if coalesce(r.get("BOM-No.")) else ""
        a1v = coalesce(r.get("BOM-No."))
        a2n = cfg["attribute_2_name"] if coalesce(r.get("MODEL/TYPE")) else ""
        a2v = coalesce(r.get("MODEL/TYPE"))
        a3n = cfg["attribute_3_name"] if coalesce(r.get("MEASUREMENT / STANDARD")) else ""
        a3v = coalesce(r.get("MEASUREMENT / STANDARD"))
        page = r.get("Page", None)
        imgs = images_by_page.get(int(page))[:max_imgs] if (page and int(page) in images_by_page) else []
        img_cols = {}
        for i in range(1, max_imgs+1):
            key = f"Image {i}"
            img_cols[key] = imgs[i-1] if i-1 < len(imgs) else ""
        rows.append({
            "SKU": sku, "Name": name, "Description": name, "Short description":"",
            "Categories": cat, "Tags":"",
            "Regular price":"", "Sale price":"",
            "Images": ",".join(imgs), "Image alt text": name,
            "Stock status": "instock" if sku else "", "Stock":"",
            "Weight (kg)": coalesce(r.get("WEIGHT")),
            "Length (cm)":"", "Width (cm)":"", "Height (cm)":"",
            "Attribute 1 name": a1n, "Attribute 1 value(s)": a1v,
            "Attribute 2 name": a2n, "Attribute 2 value(s)": a2v,
            "Attribute 3 name": a3n, "Attribute 3 value(s)": a3v,
            **img_cols,
            "Image count": len(imgs),
            "Source File": os.path.basename(source_file), "Source Page": r.get("Page",""),
            "FG/FGS": fg, "BOM-No.": a1v, "FN": coalesce(r.get("FN")),
            "MODEL/TYPE": coalesce(r.get("MODEL/TYPE")), "QTY": coalesce(r.get("QTY")),
            "UNITS": coalesce(r.get("UNITS"), r.get("UNIT")),
            "MEASUREMENT / STANDARD": coalesce(r.get("MEASUREMENT / STANDARD")),
            "POS": coalesce(r.get("POS"), r.get("C1"))
        })
    df_wp = pd.DataFrame(rows, columns=cfg["wp_columns"])
    if cfg.get("skip_empty_rows", True):
        df_wp = df_wp[~((df_wp["SKU"]=="") & (df_wp["Name"]==""))].reset_index(drop=True)
    return df_wp

# ---------------- MAIN ----------------
def main():
    ap = argparse.ArgumentParser(description="MILU v6_2 – PDF→Excel/CSV (WP) con progreso e imágenes/BOM (basado en v3_4)")
    ap.add_argument("--input", required=True, help="Carpeta con PDFs")
    ap.add_argument("--output", required=True, help="Carpeta de salida")
    ap.add_argument("--config", default="", help="Ruta config_v6_2.json (opcional)")
    args = ap.parse_args()

    cfg = DEFAULT_CONFIG.copy()
    if args.config and os.path.isfile(args.config):
        with open(args.config,"r",encoding="utf-8") as f:
            cfg.update(json.load(f) or {})

    os.makedirs(args.output, exist_ok=True)
    consolidated_pdf = os.path.join(args.output, "products_consolidated_PDFORDER.csv")
    consolidated_wp  = os.path.join(args.output, "products_consolidated_WP.csv")
    if not os.path.isfile(consolidated_pdf):
        pd.DataFrame(columns=cfg["pdf_header_order"] + ["FG/FGS","BOM-No.","Source Page"]).to_csv(consolidated_pdf, index=False, encoding="utf-8-sig")
    if not os.path.isfile(consolidated_wp):
        pd.DataFrame(columns=cfg["wp_columns"]).to_csv(consolidated_wp, index=False, encoding="utf-8-sig")

    pdf_names = [n for n in sorted(os.listdir(args.input)) if n.lower().endswith(".pdf")]
    with tqdm(total=len(pdf_names), desc="PDFs", unit="pdf") as master_bar:
        for name in pdf_names:
            pdf_path = os.path.join(args.input, name)
            pdf_base = os.path.splitext(os.path.basename(pdf_path))[0]

            # 1) Extraer todas las páginas con progreso
            df_all, logs = extract_all_pages(pdf_path, cfg["strategies"], cfg["min_header_hits"], cfg.get("footer_drop_patterns",[]), cfg)

            # 1.1) Fusionar duplicados por (Page, POS)
            df_all = merge_duplicates_by_pos(df_all)

            # 2) Hoja PDF
            df_pdf = to_pdf_order(df_all, cfg, pdf_path)

            # 3) Imágenes (si procede)
            images_by_page = {}
            if cfg.get("extract_images", True):
                out_images_dir = ensure_dir(os.path.join(args.output, cfg.get("images_subdir","images_v6_2"), pdf_base))
                raw_by_page = extract_images_with_pdfimages(pdf_path, out_images_dir, prefix=pdf_base)
                bom_by_page = build_bom_by_page(df_pdf)
                images_by_page = rename_images_by_bom(raw_by_page, bom_by_page, out_images_dir, pdf_base, max_images=int(cfg.get("max_images_per_page",6)))

            # 4) Hoja WP
            df_wp  = to_wp(df_all, cfg, pdf_path, images_by_page)

            # 5) Guardar por PDF
            xlsx_path = os.path.join(args.output, f"{pdf_base}.xlsx")
            with pd.ExcelWriter(xlsx_path, engine="xlsxwriter") as writer:
                df_pdf.to_excel(writer, sheet_name=cfg["sheet_pdf_name"], index=False)
                df_wp.to_excel(writer,  sheet_name=cfg["sheet_wp_name"],  index=False)
                wb = writer.book; txt = wb.add_format({"num_format":"@"})
                ws_pdf = writer.sheets[cfg["sheet_pdf_name"]]; ws_pdf.set_column(0, len(df_pdf.columns)-1, None, txt)
                ws_wp  = writer.sheets[cfg["sheet_wp_name"]]
                for col_name in ["Attribute 1 value(s)","BOM-No.","POS","Image 1","Image 2","Image 3","Image 4","Image 5","Image 6"]:
                    if col_name in df_wp.columns:
                        idx = list(df_wp.columns).index(col_name)
                        ws_wp.set_column(idx, idx, None, txt)
                pd.DataFrame(logs).to_excel(writer, sheet_name="LOG", index=False)

            # 6) Consolidados
            if not df_pdf.empty:
                df_pdf.to_csv(consolidated_pdf, mode="a", index=False, header=False, encoding="utf-8-sig")
            if not df_wp.empty:
                df_wp.to_csv(consolidated_wp, mode="a", index=False, header=False, encoding="utf-8-sig")

            master_bar.update(1)

if __name__ == "__main__":
    main()
