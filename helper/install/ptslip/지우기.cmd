@echo off
chcp 65001 >nul
rem PtSlip uninstall (specs/pt-slip, specs/injection-memo AC-7504.2): stop it, delete the logon task, the old Startup shortcut and LOCALAPPDATA\PtSlip\app
rem - asks for admin once (UAC): the program and its task run elevated
rem - keeps LOCALAPPDATA\PtSlip\settings.json and memo-settings.json (a reinstall reuses the saved settings)
rem - saved as UTF-8 without BOM, CRLF. Korean text only on echo/set lines: cmd misreads some long UTF-8 rem lines
setlocal

if /i "%~1"=="elevated" goto :elevated

if not defined LOCALAPPDATA goto :nofolder
if not defined APPDATA goto :nofolder

echo PT 후 진료 종이 프로그램(주사 차수 버튼 포함)을 지웁니다. 맞춰 둔 설정은 남겨 둡니다.
echo 지우려면 아무 키나 누르세요. 그만두려면 이 창을 닫으세요.
pause >nul

fltmc >nul 2>&1
if not errorlevel 1 goto :adminnow

echo 곧 뜨는 "이 앱이 디바이스를 변경하도록 허용하시겠어요?" 창에서 [예]를 눌러 주세요.
set "PTSLIP_SELF=%~f0"
set "PTSLIP_USER=%USERDOMAIN%\%USERNAME%"
rem relaunch this file elevated; user folders and name go as arguments
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $q=[char]34; $a='/c '+$q+$q+$env:PTSLIP_SELF+$q+' elevated '+$q+$env:LOCALAPPDATA+$q+' '+$q+$env:APPDATA+$q+' '+$q+$env:PTSLIP_USER+$q+$q; Start-Process -FilePath $env:ComSpec -ArgumentList $a -Verb RunAs"
if errorlevel 1 goto :denied
exit /b 0

:adminnow
rem started as admin (right click, run as admin): fine only when this admin is the signed-in user,
rem otherwise the program would go to the other admin folders and logon
powershell -NoProfile -ExecutionPolicy Bypass -Command "$u=(Get-CimInstance Win32_ComputerSystem).UserName; if ($u -and ($u -ne ($env:USERDOMAIN + [char]92 + $env:USERNAME))) { exit 1 }"
if errorlevel 1 goto :otheradmin
set "PTSLIP_LOCAL=%LOCALAPPDATA%"
set "PTSLIP_ROAMING=%APPDATA%"
set "PTSLIP_USER=%USERDOMAIN%\%USERNAME%"
goto :remove

:elevated
set "PTSLIP_LOCAL=%~2"
set "PTSLIP_ROAMING=%~3"
set "PTSLIP_USER=%~4"
if "%PTSLIP_LOCAL%"=="" goto :nofolder
if "%PTSLIP_ROAMING%"=="" goto :nofolder
if "%PTSLIP_USER%"=="" goto :nofolder

:remove
set "PTSLIP_APP=%PTSLIP_LOCAL%\PtSlip\app"
set "PTSLIP_SHORTCUT=%PTSLIP_ROAMING%\Microsoft\Windows\Start Menu\Programs\Startup\PT 후 진료 종이.lnk"

schtasks /end /tn "PtSlip" >nul 2>&1
taskkill /F /IM PtSlip.exe /FI "USERNAME eq %PTSLIP_USER%" >nul 2>&1
ping -n 2 127.0.0.1 >nul

schtasks /delete /tn "PtSlip" /f >nul 2>&1
if exist "%PTSLIP_SHORTCUT%" del /f /q "%PTSLIP_SHORTCUT%"
if exist "%PTSLIP_APP%" rmdir /s /q "%PTSLIP_APP%"

if exist "%PTSLIP_APP%\PtSlip.exe" goto :fail
schtasks /query /tn "PtSlip" >nul 2>&1
if not errorlevel 1 goto :fail

echo.
echo 지웠어요. 아무 키나 누르면 이 창이 닫혀요.
pause >nul
exit /b 0

:denied
echo.
echo [예]를 누르지 않아 지우지 않았어요. 지우기.cmd를 다시 두 번 누르고 [예]를 눌러 주세요.
pause
exit /b 1

:nofolder
echo 이 윈도우 사용자의 폴더를 찾지 못해 지우지 못했어요.
pause
exit /b 1

:fail
echo 다 지우지 못했어요. 컴퓨터를 다시 켠 뒤 지우기.cmd를 한 번 더 눌러 주세요.
pause
exit /b 1

:otheradmin
echo 다른 관리자 계정으로 실행돼서 지우기 작업을 하지 않았어요.
echo 지우기.cmd를 오른쪽 클릭하지 말고, 이 PC를 쓰는 계정에서 그냥 두 번 눌러 주세요.
pause
exit /b 1
