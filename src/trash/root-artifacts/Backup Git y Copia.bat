@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

:menu
cls
echo =====================================================
echo MILU - MENU BACKUP GIT + COPIA LOCAL
echo =====================================================
echo.
echo Ruta de copias zip: C:\Users\jordi\source\backup\milu\YYYY-MM\
echo El zip ignora por defecto carpetas pesadas (dist, esquemas, fotos, node_modules, etc.).
echo Frecuencia recomendada:
echo - Minimo: opcion 1 al final de cada jornada.
echo - Durante cambios grandes: opcion 3 antes de tocar engine_*.json masivamente.
echo - Cierre semanal: opcion 1 + tag git.
echo.
echo [1] Backup completo recomendado
echo     Que hace: stage + commit + push origin + push backup + zip local.
echo     Cuando usarla: al cierre de jornada, antes de apagar o antes de merge.
echo     Frecuencia: 1-3 veces al dia (obligatoria al final del dia).
echo.
echo [2] Commit y push sin zip
echo     Que hace: stage + commit + push origin + push backup.
echo     Cuando usarla: iteraciones rapidas del dia ya cubiertas por una copia previa.
echo     Frecuencia: tantas como necesites entre backups completos.
echo.
echo [3] Solo copia zip local
echo     Que hace: crea zip del repo sin commit ni push.
echo     Cuando usarla: justo antes de refactors grandes o cambios masivos de datos.
echo     Frecuencia: cada vez que haya riesgo alto de tener que volver atras.
echo.
echo [4] Solo commit local
echo     Que hace: stage + commit, sin pushes ni zip.
echo     Cuando usarla: trabajo con internet inestable o commit temporal de orden.
echo     Frecuencia: opcional, luego rematar con opcion 1 o 2.
echo.
echo [5] Validacion en seco
echo     Que hace: prueba el flujo sin commit, sin push y sin zip.
echo     Cuando usarla: despues de cambiar scripts/remotos o si algo falla.
echo     Frecuencia: solo diagnostico (no diaria).
echo.
echo [6] Salir
echo.
set /p "OPT=Elige una opcion [1-6]: "

if "%OPT%"=="1" goto run_full
if "%OPT%"=="2" goto run_push_nozip
if "%OPT%"=="3" goto run_zip_only
if "%OPT%"=="4" goto run_commit_only
if "%OPT%"=="5" goto run_dry
if "%OPT%"=="6" goto end

echo.
echo Opcion no valida.
pause
goto menu

:ask_message
set "MSG="
set /p "MSG=Mensaje de commit (vacio = automatico): "
goto :eof

:run_full
call :ask_message
if defined MSG (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\git-backup.ps1" -Message "%MSG%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\git-backup.ps1"
)
goto after_run

:run_push_nozip
call :ask_message
if defined MSG (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\git-backup.ps1" -NoZip -Message "%MSG%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\git-backup.ps1" -NoZip
)
goto after_run

:run_zip_only
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\git-backup.ps1" -NoCommit -NoPush
goto after_run

:run_commit_only
call :ask_message
if defined MSG (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\git-backup.ps1" -NoPush -NoZip -Message "%MSG%"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\git-backup.ps1" -NoPush -NoZip
)
goto after_run

:run_dry
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\git-backup.ps1" -NoCommit -NoPush -NoZip -NoStatus
goto after_run

:after_run
echo.
if errorlevel 1 (
    echo Resultado: ERROR. Revisa el mensaje anterior.
) else (
    echo Resultado: OK.
)
echo.
pause
goto menu

:end
echo Saliendo...
endlocal
exit /b 0
