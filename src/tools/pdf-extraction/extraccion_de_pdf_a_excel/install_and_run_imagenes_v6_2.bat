@echo off
setlocal
REM MILU v6_2 + extracción de esquemas (para todos los PDFs en milu-pdfs_v6_2)

cd /d %~dp0

REM Crear venv si no existe
if not exist .venv\Scripts\python.exe (
  python -m venv .venv
)

REM Activar venv
call .venv\Scripts\activate

REM Actualizar pip y wheel
python -m pip install --upgrade pip wheel

REM Instalar requisitos
pip install -r requirements_v6_2.txt

REM Crear carpetas de trabajo
if not exist milu-pdfs_v6_2 mkdir milu-pdfs_v6_2
if not exist milu-out_v6_2 mkdir milu-out_v6_2
if not exist milu-out_v6_2\esquemas mkdir milu-out_v6_2\esquemas

echo.
echo [INFO] Listo. Coloca tus PDFs en .\milu-pdfs_v6_2
echo [INFO] Se generarán resultados en .\milu-out_v6_2
echo Ejecutando extracción normal...
echo.

echo. python milu_batch_extract_v6_2.py --input .\milu-pdfs_v6_2 --output .\milu-out_v6_2 --config .\config_v6_2.json

echo.
echo [INFO] Extracción normal finalizada.
echo Ejecutando extracción de ESQUEMAS recortados para todos los PDFs...
echo.

for %%F in (milu-pdfs_v6_2\*.pdf) do (
  echo [PDF] %%~nxF
  .venv\Scripts\python milu_export_esquemas_v6_2.py "%%F" --out ".\milu-out_v6_2\esquemas" --dpi 300 --min-img-area 20000 --pad 12 --cluster-pad 16
)

echo.
echo [INFO] Proceso COMPLETO finalizado.
echo Revisa la carpeta .\milu-out_v6_2\esquemas para los PNG recortados.
echo.
pause
