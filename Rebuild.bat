@echo off
setlocal
cd /d "%~dp0"
title Cadence - rebuild

rem Your data lives in the browser, so rebuilding never touches it.
if not exist "node_modules" call npm install
call npm run build || (echo Build failed. & pause & exit /b 1)
echo.
echo   Done. Reload the Cadence tab to pick up the changes.
pause
