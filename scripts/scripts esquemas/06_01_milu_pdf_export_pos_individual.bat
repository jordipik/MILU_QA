@echo off
cd /d "%~dp0"

echo ==========================================
echo   PASO 06 - EXPORT POS INDIVIDUAL (IMAGEN)
echo ==========================================

REM ------------------------------------------
REM Script:
REM   06_01_milu_pdf_export_pos_individual.py
REM
REM Salida:
REM   06-POS   (una imagen por cada POS)




python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\12V4000M40A_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 1-1 ^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85

python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\12V4000M53_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 365-834 ^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85

python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\16V4000M61_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 509-842 ^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85


python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\12V4000M70_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 364-1426 ^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85

python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\16V4000M73_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 364-1426 ^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85

python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\16V4000M73L_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 487-1683 ^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85

python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\16V4000M90_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 1-1^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85

python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\20V4000M93_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 1-1^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85

python 06_01_milu_pdf_export_pos_individual.py "03-Libros_Marcos_modificados_a_mano\20V4000M93L_clean_marcos_mod.pdf" ^
  --out "06-POS" ^
  --dpi 200 ^
  --shrink 1.0 ^
  --frame-pad-pt 0.5 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --dedup-px 16 ^
  --pages 1115-1877 ^
  --img-format webp ^
  --recolor-frames-white ^
  --quality 85

echo.
echo Exportacion POS individual terminada.
pause
