@echo off
setlocal EnableExtensions
title Flight Hunter

rem Always run from this script's folder, so a desktop shortcut works
rem regardless of what its "Start in" directory happens to be.
cd /d "%~dp0"

set "PORT=4000"
set "URL=http://localhost:%PORT%"

echo.
echo   Flight Hunter
echo   ---------------------------------------------
echo.

rem ---------------------------------------------------------------- Node ---
where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js was not found.
  echo.
  echo   Install Node 20 or newer from https://nodejs.org
  echo   then run this file again.
  echo.
  pause
  exit /b 1
)

rem ------------------------------------------------------- Already running ---
netstat -ano | findstr /c:":%PORT%" | findstr /c:"LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo   Already running - opening %URL%
  start "" "%URL%"
  exit /b 0
)

rem -------------------------------------------------------- "dev" argument ---
rem  FlightHunter.bat dev   ->  hot-reloading dev servers on port 5173
if /i "%~1"=="dev" goto devmode

rem ------------------------------------------------------------ Dependencies ---
if not exist "node_modules\" (
  echo   Installing dependencies. First run only - this takes a minute.
  echo.
  call npm install
  if errorlevel 1 goto failed
  echo.
)

rem ------------------------------------------------------------------ Build ---
if not exist "packages\client\dist\index.html" goto build
if not exist "packages\server\dist\index.js" goto build
goto run

:build
echo   Building the app. This happens once, then launches are instant.
echo.
call npm run build
if errorlevel 1 goto failed
echo.

:run
echo   Starting on %URL%
echo   Your browser opens automatically in a few seconds.
echo.
echo   Keep this window open while you use the app.
echo   Press Ctrl+C or close it to stop the server.
echo   ---------------------------------------------
echo.

rem Open the browser once the server has had time to bind the port. A hidden
rem PowerShell does the waiting so this window can go straight into the server
rem and keep showing its log output.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process '%URL%'"

call npm start
goto ending

rem ------------------------------------------------------------------- Dev ---
:devmode
echo   Development mode - hot reload, UI on http://localhost:5173
echo.
if not exist "node_modules\" (
  echo   Installing dependencies...
  call npm install
  if errorlevel 1 goto failed
)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 10; Start-Process 'http://localhost:5173'"
call npm run dev
goto ending

rem ---------------------------------------------------------------- Failure ---
:failed
echo.
echo   ---------------------------------------------
echo   Startup failed. The error is above.
echo.
echo   Most common fix: delete the node_modules folder
echo   and run this file again.
echo.
pause
exit /b 1

:ending
echo.
echo   Flight Hunter has stopped.
echo.
endlocal
