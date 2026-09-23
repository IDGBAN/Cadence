@echo off
setlocal
cd /d "%~dp0"
title Cadence

where node >nul 2>nul
if errorlevel 1 goto nonode
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>20||(a===20&&b>=19)?0:1)"
if errorlevel 1 goto oldnode

if not exist "node_modules\vite" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto failed
)

if not exist "dist\index.html" (
  echo Building...
  call npm run build
  if errorlevel 1 goto failed
)

echo.
echo   Starting Cadence at http://localhost:5180
echo   Leave this window open. Close it to stop.
echo.
call npm run preview -- --open
echo.
echo   The server stopped.
goto end

:nonode
echo Node.js isn't installed. Get it from https://nodejs.org and try again.
goto end

:oldnode
for /f %%v in ('node -v') do echo Cadence needs Node.js 20.19 or newer, but this PC has %%v.
echo Install the current LTS from https://nodejs.org, delete the node_modules folder, and try again.
goto end

:failed
echo.
echo   Something went wrong. The error is above.

:end
echo.
pause
