@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

REM --- Carpeta base = donde está este BAT ---
cd /d "%~dp0"

REM --- Configuración ---
set "INPUT_DIR=01-Libros_Sin_Marca_Agua"
set "OUTPUT_DIR=02-Libros_Marcos_automaticos"
set "MIN_WIDTH_RATIO=0.5"

echo =============================================
echo   MILU - FASE 2: MARCOS ROJOS AUTOMATICOS
echo   Origen : %INPUT_DIR%
echo   Salida : %OUTPUT_DIR%
echo   min-width-ratio = %MIN_WIDTH_RATIO%
echo =============================================
echo.

REM Crear carpeta de salida si no existe
if not exist "%OUTPUT_DIR%" (
    echo Creando carpeta %OUTPUT_DIR%
    mkdir "%OUTPUT_DIR%"
    echo.
)

REM Recorrer todos los PDF de la carpeta origen
for %%F in ("%INPUT_DIR%\*.pdf") do (
    set "NAME=%%~nF"
    set "OUT=%OUTPUT_DIR%\!NAME!_marcos.pdf"

    echo -----------------------------------------
    echo Procesando: %%F
    echo Salida:     !OUT!
    echo.

    python 02_02_Add_marcos_rojos.py ^
        --input "%%F" ^
        --output "!OUT!" ^
        --min-width-ratio %MIN_WIDTH_RATIO%

    echo.
)

echo =============================================
echo   FASE 2 COMPLETADA
echo =============================================
echo Pulsa una tecla para cerrar...
pause
ENDLOCAL
