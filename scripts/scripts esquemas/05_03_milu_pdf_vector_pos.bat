@echo off
cd /d "%~dp0"

echo ================================
echo   PASO 05 - REVISION POS
echo ================================


python 05_03_milu_pdf_vector_pos.py "03-Libros_Marcos_modificados_a_mano\12V4000M40A_clean_marcos_mod.pdf" ^
  --out "05-Revision_POS" ^
  --dpi 300 ^
  --shrink 1.0 ^
  --dedup-px 16 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --pages 1-486

python 05_03_milu_pdf_vector_pos.py "03-Libros_Marcos_modificados_a_mano\12V4000M53_clean_marcos_mod.pdf" ^
  --out "05-Revision_POS" ^
  --dpi 300 ^
  --shrink 1.0 ^
  --dedup-px 16 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --pages 1-364


python 05_03_milu_pdf_vector_pos.py "03-Libros_Marcos_modificados_a_mano\16V4000M61_clean_marcos_mod.pdf" ^
  --out "05-Revision_POS" ^
  --dpi 300 ^
  --shrink 1.0 ^
  --dedup-px 16 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --pages 1-508

python 05_03_milu_pdf_vector_pos.py "03-Libros_Marcos_modificados_a_mano\16V4000M73_clean_marcos_mod.pdf" ^
  --out "05-Revision_POS" ^
  --dpi 300 ^
  --shrink 1.0 ^
  --dedup-px 16 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --pages 1-363


python 05_03_milu_pdf_vector_pos.py "03-Libros_Marcos_modificados_a_mano\16V4000M73L_clean_marcos_mod_parcial.pdf" ^
  --out "05-Revision_POS" ^
  --dpi 300 ^
  --shrink 1.0 ^
  --dedup-px 16 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --pages 1-486


python 05_03_milu_pdf_vector_pos.py "03-Libros_Marcos_modificados_a_mano\16V4000M90_clean_marcos_mod.pdf" ^
  --out "05-Revision_POS" ^
  --dpi 300 ^
  --shrink 1.0 ^
  --dedup-px 16 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --pages 1-423

python 05_03_milu_pdf_vector_pos.py "03-Libros_Marcos_modificados_a_mano\16V4000M93_clean_marcos_mod_parcial.pdf" ^
  --out "05-Revision_POS" ^
  --dpi 300 ^
  --shrink 1.0 ^
  --dedup-px 16 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --pages 1-403

python 05_03_milu_pdf_vector_pos.py "03-Libros_Marcos_modificados_a_mano\16V4000M93_clean_marcos_mod_parcial.pdf" ^
  --out "05-Revision_POS" ^
  --dpi 300 ^
  --shrink 1.0 ^
  --dedup-px 16 ^
  --circle-width 6 ^
  --use-ocr-fallback ^
  --upscale 3 ^
  --min-conf 18 ^
  --psm-list 6,11 ^
  --blue-bmin 110 ^
  --blue-delta 35 ^
  --dilate 0 ^
  --pages 1-330

echo.
echo Revision terminada.
pause
