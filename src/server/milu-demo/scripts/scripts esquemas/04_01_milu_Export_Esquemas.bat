@echo off
setlocal

cd /d "%~dp0"

set "INPUT_DIR=03-Libros_Marcos_modificados_a_mano"
set "OUTPUT_DIR=04-Esquemas"

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

for %%F in ("%INPUT_DIR%\*.pdf") do (
    echo Procesando %%~nxF...
    python 04_01_milu_Export_Esquemas.py "%%F" --out "%OUTPUT_DIR%"  --export-images --no-meta-filename --shrink 3
)

echo.
echo Terminado.
pause
endlocal
