@echo off
cd /d "%~dp0"
title BlockForge - build

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install it from https://nodejs.org/ and run this file again.
  start https://nodejs.org/
  pause
  exit /b 1
)

call npm install
if errorlevel 1 (
  echo npm install failed
  pause
  exit /b 1
)

call npm run dist
if errorlevel 1 (
  echo Build failed
  pause
  exit /b 1
)

echo.
echo Done! The installer and portable exe are in the dist folder.
start "" "%~dp0dist"
pause
