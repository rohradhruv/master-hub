@echo off
title Master Hub
cd /d "%~dp0"

rem ---- 1. start the database server if it isn't running ----
powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing http://localhost:8787/api/info -TimeoutSec 1 | Out-Null; exit 0}catch{exit 1}" >nul 2>&1
if errorlevel 1 (
  where pythonw >nul 2>nul
  if not errorlevel 1 (
    start "MasterHubServer" pythonw server.py
  ) else (
    start "MasterHubServer" /min python server.py
  )
  timeout /t 2 /nobreak >nul
)

rem ---- 2. open as a REAL app window (no browser bars) ----
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://localhost:8787 --window-size=1280,860
  exit
)
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --app=http://localhost:8787 --window-size=1280,860
  exit
)
start "" http://localhost:8787
exit
