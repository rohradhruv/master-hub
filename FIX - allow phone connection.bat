@echo off
rem Master Hub — allow your phone to reach the database (run once, click Yes on the prompt)
net session >nul 2>&1
if errorlevel 1 (
  echo Asking for administrator permission...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit
)
netsh advfirewall firewall delete rule name="Master Hub" >nul 2>&1
netsh advfirewall firewall add rule name="Master Hub" dir=in action=allow protocol=TCP localport=8787
echo.
echo  ================================================
echo   Done! Your phone can now connect to Master Hub.
echo   (Both devices must be on the same Wi-Fi.)
echo  ================================================
echo.
pause
