@echo off
setlocal DisableDelayedExpansion
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
set ERP_SETUP_CODE=%errorlevel%
if not "%ERP_SETUP_CODE%"=="0" if not "%ERP_SETUP_CODE%"=="2" pause
exit /b %ERP_SETUP_CODE%
