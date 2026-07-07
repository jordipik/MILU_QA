@echo off
setlocal
REM MILU v6_2 - Instalación y ejecución
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

echo.
echo Listo. Coloca tus PDFs en .\milu-pdfs_v6_2 y se generarán resultados en .\milu-out_v6_2
echo Ejecutando extracción...
echo.

python milu_export_datos_v6_2.py --input .\milu-pdfs_v6_2 --output .\milu-out_v6_2 --config .\config_v6_2.json

echo.
echo Proceso finalizado. Revisa la carpeta milu-out_v6_2.
