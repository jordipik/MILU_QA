
@echo off
cd /d C:\Users\jordi\source\repos\milu

if not exist server.js (
	echo ERROR: No existe server.js en C:\Users\jordi\source\repos\milu
	pause
	exit /b 1
)

for %%A in (server.js) do set SERVER_SIZE=%%~zA
if %SERVER_SIZE% EQU 0 goto :SERVER_EMPTY

set PORT=3000

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
	for /f "tokens=1" %%I in ('tasklist /FI "IMAGENAME eq node.exe" /FI "PID eq %%P" /NH ^| findstr /I "node.exe"') do (
		echo Cerrando node.exe en puerto %PORT% ^(PID %%P^)...
		taskkill /PID %%P /F >nul 2>&1
	)
)

timeout /t 1 /nobreak >nul
start /b node server.js
timeout /t 2 /nobreak >nul
start http://localhost:%PORT%/qa_milu.html
goto :EOF

:SERVER_EMPTY
echo ERROR: server.js esta vacio. Restauralo antes de arrancar.
echo Sugerencia: git checkout -- server.js
pause
exit /b 1
