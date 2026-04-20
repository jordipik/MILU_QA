
@echo off
cd /d C:\Users\jordi\source\repos\milu

if not exist server.js (
	echo ERROR: No existe server.js en C:\Users\jordi\source\repos\milu
	pause
	exit /b 1
)

for %%A in (server.js) do set SERVER_SIZE=%%~zA
if %SERVER_SIZE% EQU 0 goto :SERVER_EMPTY

start http://localhost:3000/qa_milu.html
node server.js
goto :EOF

:SERVER_EMPTY
echo ERROR: server.js esta vacio. Restauralo antes de arrancar.
echo Sugerencia: git checkout -- server.js
pause
exit /b 1
