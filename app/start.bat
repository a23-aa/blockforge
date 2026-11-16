@echo off
cd /d "%~dp0"
title BlockForge

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found.
  echo A download page will open. Install the LTS version, then run this file again.
  start https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing components, this takes a few minutes...
  call npm install
  if errorlevel 1 (
    echo Install failed. Check your internet connection and run this file again.
    pause
    exit /b 1
  )
)

call npm start
