@if not exist "%~dp0speed-check.ps1" (echo Please unzip first: right click the zip, Extract All, then run speed-check.cmd in that folder. & pause & exit /b 1)
@powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0speed-check.ps1"
@if errorlevel 1 exit /b 1
@"%~dp0app\PrecheckHelper.exe" --diag-read-speed
@if errorlevel 1 pause
