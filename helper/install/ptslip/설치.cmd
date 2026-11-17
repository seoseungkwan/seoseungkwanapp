@echo off
chcp 65001 >nul
rem PtSlip install (specs/pt-slip). No admin rights: writes only to this Windows user folders.
rem - copies app\ next to this file into LOCALAPPDATA\PtSlip\app, adds a Startup shortcut, starts it
rem - leaves LOCALAPPDATA\PtSlip\settings.json alone
rem - saved as UTF-8 without BOM, CRLF. Korean text only on echo/set lines: cmd misreads some long UTF-8 rem lines
setlocal

if not defined LOCALAPPDATA goto :nofolder
if not defined APPDATA goto :nofolder

set "PTSLIP_SRC=%~dp0app"
set "PTSLIP_DEST=%LOCALAPPDATA%\PtSlip\app"
set "PTSLIP_STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "PTSLIP_LINK=PT 후 진료 종이.lnk"

if not exist "%PTSLIP_SRC%\PtSlip.exe" goto :nofiles

echo PT 후 진료 종이 프로그램을 설치합니다.

rem 1. stop a running copy so files can be replaced (no error if none)
taskkill /F /IM PtSlip.exe /FI "USERNAME eq %USERNAME%" >nul 2>&1
ping -n 2 127.0.0.1 >nul

rem 2. mirror app\ (the app folder holds only this program)
robocopy "%PTSLIP_SRC%" "%PTSLIP_DEST%" /MIR /R:3 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :copyfail

rem 3. clear the downloaded-file mark and create the Startup shortcut (PowerShell keeps the Korean name)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $d=$env:PTSLIP_DEST; Get-ChildItem -LiteralPath $d -File -Recurse | Unblock-File; New-Item -ItemType Directory -Force -Path $env:PTSLIP_STARTUP | Out-Null; $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $env:PTSLIP_STARTUP $env:PTSLIP_LINK)); $s.TargetPath=(Join-Path $d 'PtSlip.exe'); $s.WorkingDirectory=$d; $s.Description='PT 후 진료 종이'; $s.Save()"
if errorlevel 1 goto :linkfail

rem 4. start it now
start "" "%PTSLIP_DEST%\PtSlip.exe"

echo.
echo 설치했어요. 비트 창 오른쪽 위에 노란 [PT 먼저] 버튼이 보이면 됩니다.
echo 컴퓨터를 다시 켜도 저절로 켜집니다. 아무 키나 누르면 이 창이 닫혀요.
pause >nul
exit /b 0

:nofolder
echo 이 윈도우 사용자의 폴더를 찾지 못해 설치하지 못했어요.
pause
exit /b 1

:nofiles
echo 설치할 파일이 없어요.
echo 받은 zip을 오른쪽 클릭 → '모두 압축 풀기'를 한 뒤, 푼 폴더에서 설치.cmd를 두 번 눌러 주세요.
pause
exit /b 1

:copyfail
echo 프로그램 파일을 옮기지 못했어요. 컴퓨터를 다시 켠 뒤 설치.cmd를 한 번 더 눌러 주세요.
pause
exit /b 1

:linkfail
echo 자동으로 켜지게 하는 바로가기를 만들지 못했어요. 설치.cmd를 한 번 더 눌러 주세요.
pause
exit /b 1
