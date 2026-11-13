@echo off
title AI Agency Dashboard
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Node.js is not installed yet.
  echo   Download the LTS version from https://nodejs.org, install it,
  echo   then double-click "Start Dashboard" again.
  echo.
  pause
  exit /b 1
)
node server.js --open
echo.
echo   The dashboard has stopped.
pause
