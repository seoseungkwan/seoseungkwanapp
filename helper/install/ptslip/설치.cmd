@echo off
chcp 65001 >nul
rem PtSlip install (specs/pt-slip, specs/injection-memo AC-7504.2).
rem - asks for admin once (UAC), because Bit runs elevated and the memo button must type into it
rem - copies app\ next to this file into LOCALAPPDATA\PtSlip\app of the user who ran it
rem - registers a logon task (highest privileges, interactive, no password) instead of the old Startup shortcut, deletes that shortcut
rem - leaves LOCALAPPDATA\PtSlip\settings.json and memo-settings.json alone
rem - saved as UTF-8 without BOM, CRLF. Korean text only on echo/set lines: cmd misreads some long UTF-8 rem lines
setlocal

if /i "%~1"=="elevated" goto :elevated

if not defined LOCALAPPDATA goto :nofolder
if not defined APPDATA goto :nofolder
if not exist "%~dp0app\PtSlip.exe" goto :nofiles

fltmc >nul 2>&1
if not errorlevel 1 goto :adminnow

echo PT 후 진료 종이 프로그램을 설치합니다.
echo 곧 뜨는 "이 앱이 디바이스를 변경하도록 허용하시겠어요?" 창에서 [예]를 눌러 주세요.
echo (비트가 관리자 권한으로 돌아서, 주사 차수 단추가 비트 칸에 글을 넣으려면 한 번 필요해요)
set "PTSLIP_SELF=%~f0"
set "PTSLIP_USER=%USERDOMAIN%\%USERNAME%"
rem relaunch this file elevated; user folders and name go as arguments (an elevated process may belong to another admin)
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
goto :install

:elevated
set "PTSLIP_LOCAL=%~2"
set "PTSLIP_ROAMING=%~3"
set "PTSLIP_USER=%~4"
if "%PTSLIP_LOCAL%"=="" goto :nofolder
if "%PTSLIP_ROAMING%"=="" goto :nofolder
if "%PTSLIP_USER%"=="" goto :nofolder
if not exist "%~dp0app\PtSlip.exe" goto :nofiles

:install
set "PTSLIP_SRC=%~dp0app"
set "PTSLIP_DEST=%PTSLIP_LOCAL%\PtSlip\app"
set "PTSLIP_OLDLINK=%PTSLIP_ROAMING%\Microsoft\Windows\Start Menu\Programs\Startup\PT 후 진료 종이.lnk"

echo PT 후 진료 종이 프로그램을 설치하고 있어요.

rem 1. stop a running copy (old normal one or elevated one) so files can be replaced
schtasks /end /tn "PtSlip" >nul 2>&1
taskkill /F /IM PtSlip.exe /FI "USERNAME eq %PTSLIP_USER%" >nul 2>&1
ping -n 2 127.0.0.1 >nul

rem 2. mirror app\ (the app folder holds only this program)
robocopy "%PTSLIP_SRC%" "%PTSLIP_DEST%" /MIR /R:3 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 goto :copyfail

rem 3. clear the downloaded-file mark, register the logon task (highest, interactive token, no time limit, normal priority)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $d=$env:PTSLIP_DEST; Get-ChildItem -LiteralPath $d -File -Recurse | Unblock-File; $u=$env:PTSLIP_USER; $act=New-ScheduledTaskAction -Execute (Join-Path $d 'PtSlip.exe') -WorkingDirectory $d; $trg=New-ScheduledTaskTrigger -AtLogOn -User $u; $pri=New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive -RunLevel Highest; $set=New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -Priority 5; Register-ScheduledTask -TaskName 'PtSlip' -Action $act -Trigger $trg -Principal $pri -Settings $set -Description 'PT slip and injection memo button (seoseungkwanapp)' -Force | Out-Null"
if errorlevel 1 goto :taskfail

rem 4. the old Startup shortcut would start a second, non-elevated copy: remove it
if exist "%PTSLIP_OLDLINK%" del /f /q "%PTSLIP_OLDLINK%"

rem 5. start it now the same way it starts at logon
schtasks /run /tn "PtSlip" >nul 2>&1
if errorlevel 1 goto :runfail

echo.
echo 설치했어요. 비트 창 오른쪽 위에 노란 [PT 먼저] 버튼,
echo 비트 접수 화면 '접수메모(당일)' 칸 옆에 초록 [주사 차수] 버튼(단축키 F8)이 보이면 됩니다.
echo 컴퓨터를 다시 켜도 저절로 켜지고, 그때는 묻는 창이 뜨지 않아요. 아무 키나 누르면 이 창이 닫혀요.
pause >nul
exit /b 0

:denied
echo.
echo [예]를 누르지 않아 설치하지 않았어요. 설치.cmd를 다시 두 번 누르고 [예]를 눌러 주세요.
pause
exit /b 1

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

:taskfail
echo 컴퓨터를 켤 때 저절로 켜지게 하는 설정을 만들지 못했어요. 설치.cmd를 한 번 더 눌러 주세요.
pause
exit /b 1

:runfail
echo 설치는 했지만 지금 켜지 못했어요. 컴퓨터를 다시 켜면 저절로 켜집니다.
pause
exit /b 1

:otheradmin
echo 다른 관리자 계정으로 실행돼서 설치 작업을 하지 않았어요.
echo 설치.cmd를 오른쪽 클릭하지 말고, 이 PC를 쓰는 계정에서 그냥 두 번 눌러 주세요.
pause
exit /b 1
