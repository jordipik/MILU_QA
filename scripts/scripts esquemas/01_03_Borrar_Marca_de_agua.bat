@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

REM --- Carpeta base = donde está este BAT ---
cd /d "%~dp0"

REM --- Configuración ---
set "INPUT_DIR=00-Libros_Originales"
set "OUTPUT_DIR=01-Libros_Sin_Marca_Agua"

echo =============================================
echo   MILU - BORRADO DE MARCA DE AGUA (AUTO)
echo   Origen : %INPUT_DIR%
echo   Salida : %OUTPUT_DIR%
echo =============================================
echo.

if not exist "%OUTPUT_DIR%" (
    echo Creando carpeta %OUTPUT_DIR%
    mkdir "%OUTPUT_DIR%"
    echo.
)

for %%F in ("%INPUT_DIR%\*.pdf") do (
    set "NAME=%%~nF"
    set "OUT=%OUTPUT_DIR%\!NAME!_clean.pdf"

    echo -----------------------------------------
    echo Procesando: %%F
    echo Salida:     !OUT!
    echo.

    REM Modo AUTO -> detecta la línea 'Business Portal Online Print <fecha>'
    python 01_03_Borrar_Marca_de_agua.py "%%F" "!OUT!" AUTO

    echo.
)

echo =============================================
echo   PROCESO COMPLETADO
echo =============================================
echo Pulsa una tecla para cerrar...
pause
ENDLOCAL
