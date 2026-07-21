@echo off
title Master Hub setup
cd /d "%~dp0"
echo.
echo  Creating "Master Hub" shortcuts...

rem -- Desktop shortcut --
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\Master Hub.lnk');" ^
  "$s.TargetPath='%~dp0Master Hub.bat';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.IconLocation='%SystemRoot%\System32\shell32.dll,43';" ^
  "$s.Description='Master Hub - your personal command center';" ^
  "$s.Save()"

rem -- Start Menu shortcut --
powershell -NoProfile -Command ^
  "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('StartMenu')+'\Programs\Master Hub.lnk');" ^
  "$s.TargetPath='%~dp0Master Hub.bat';" ^
  "$s.WorkingDirectory='%~dp0';" ^
  "$s.IconLocation='%SystemRoot%\System32\shell32.dll,43';" ^
  "$s.Save()"

echo  Done! You now have:
echo    - "Master Hub" on your Desktop
echo    - "Master Hub" in the Start Menu
echo.
choice /M "  Also start Master Hub automatically when the PC turns on"
if %errorlevel%==1 (
  powershell -NoProfile -Command ^
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Master Hub.lnk');" ^
    "$s.TargetPath='%~dp0start-hidden.vbs';" ^
    "$s.WorkingDirectory='%~dp0';" ^
    "$s.Save()"
  echo  Auto-start enabled. The hub server will always be running.
)
echo.
echo  Tip: open http://localhost:8787 in Edge/Chrome and use
echo  "Install Master Hub" from the address bar / menu to get a real
echo  desktop app window with its own icon.
echo.
pause
