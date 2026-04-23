# MILU v6_2 (basado estrictamente en v3_4)

Este paquete es un _port_ 1:1 de **v3_4** con los mismos comportamientos y defaults, actualizando únicamente los nombres/rutas a **v6_2**:
- Script principal: `milu_batch_extract_v6_2.py`
- Configuración: `config_v6_2.json` (con `images_subdir: images_v6_2`)
- Requisitos: `requirements_v6_2.txt`
- Carpetas recomendadas: `milu-pdfs_v6_2` y `milu-out_v6_2`
- Carpeta de imágenes: `images_v6_2` (dentro de la salida)

## Uso
```bat
python milu_batch_extract_v6_2.py --input ./milu-pdfs_v6_2 --output ./milu-out_v6_2 --config ./config_v6_2.json
```

> Notas
> - Necesitas `pdfimages` (Poppler) en PATH si quieres la extracción de imágenes por página.
> - Los CSV consolidados se escriben en la carpeta de salida: 
>   - `products_consolidated_PDFORDER.csv`
>   - `products_consolidated_WP.csv`
> - El Excel por PDF incluye hojas: `CATALOGO_PDF`, `WordPress` y `LOG`.
