@echo off
chcp 65001 >nul
rem PtSlip uninstall (specs/pt-slip): stop it, delete the Startup shortcut and LOCALAPPDATA\PtSlip\app
rem - keeps LOCALAPPDATA\PtSlip\settings.json (a reinstall reuses the saved settings)
rem - saved as UTF-8 without BOM, CRLF. Korean text only on echo/set lines: cmd misreads some long UTF-8 rem lines
setlocal

if not defined LOCALAPPDATA goto :nofolder
if not defined APPDATA goto :nofolder

set "PTSLIP_APP=%LOCALAPPDATA%\PtSlip\app"
set "PTSLIP_SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\PT 후 진료 종이.lnk"

echo PT 후 진료 종이 프로그램을 지웁니다. 맞춰 둔 설정은 남겨 둡니다.
echo 지우려면 아무 키나 누르세요. 그만두려면 이 창을 닫으세요.
pause >nul

taskkill /F /IM PtSlip.exe /FI "USERNAME eq %USERNAME%" >nul 2>&1
ping -n 2 127.0.0.1 >nul

if exist "%PTSLIP_SHORTCUT%" del /f /q "%PTSLIP_SHORTCUT%"
if exist "%PTSLIP_APP%" rmdir /s /q "%PTSLIP_APP%"

if exist "%PTSLIP_APP%\PtSlip.exe" goto :fail

echo.
echo 지웠어요. 아무 키나 누르면 이 창이 닫혀요.
pause >nul
exit /b 0

:nofolder
echo 이 윈도우 사용자의 폴더를 찾지 못해 지우지 못했어요.
pause
exit /b 1

:fail
echo 다 지우지 못했어요. 컴퓨터를 다시 켠 뒤 지우기.cmd를 한 번 더 눌러 주세요.
pause
exit /b 1
