@echo off
setlocal

set "PORT=8000"
set "ROOT=%~dp0"

cd /d "%ROOT%"

echo.
echo ===============================================
echo  ISAVAL CRM Historico - Servidor local
echo ===============================================
echo.
echo Carpeta: %ROOT%
echo Puerto:  %PORT%
echo.
echo Desde esta PC:
echo   http://localhost:%PORT%
echo.
echo Desde otras PCs de la misma red, abrir:
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
  for /f "tokens=* delims= " %%B in ("%%A") do echo   http://%%B:%PORT%
)
echo.
echo Deja esta ventana abierta mientras se use el CRM.
echo Para detener el servidor, presiona Ctrl+C.
echo.

start "" "http://localhost:%PORT%"

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server %PORT% --bind 0.0.0.0
  goto :end
)

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT% --bind 0.0.0.0
  goto :end
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%servidor-crm.ps1" -Port %PORT% -Root "%ROOT%"

:end
endlocal
