# 접수 현황 따로 설치 (specs/reception-phone/design.md 11절 '따로 설치', TASK-35)
# - 공식 도우미는 그대로 두고 접수 현황 PrecheckReception.exe만 자기 폴더 %LOCALAPPDATA%\Seoseungkwan\PrecheckReception\에 둔다
#   도우미(PrecheckHelper)는 끄지도·덮어쓰지도·크롬 등록하지도 않는다. 도우미를 다시 설치해도 이 폴더는 그대로다
# - 도우미가 설치되고 이 PC에 의원 등록이 되어 있어야 한다(접수 현황은 도우미 data\의 등록 파일로 비트를 연다). 없으면 알리고 멈춘다
# - 관리자 권한이 필요 없다. 이 윈도우 사용자의 폴더(%LOCALAPPDATA%)·사용자 레지스트리(HKCU)·이 사용자의 바탕 화면만 쓴다
#   방화벽 규칙은 만들지 않는다(관리자 권한이 필요하다). 처음 켤 때 윈도우가 묻는 창에서 사용자가 [허용]을 누른다
# - 윈도우 PowerShell 5.1(윈도우 10·11 기본)에서 돈다. 한글 문구가 깨지지 않게 이 파일은 UTF-8 BOM으로 저장한다
# - 부르는 법: zip을 모두 푼 폴더에서 install-reception.cmd를 누른다
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$receptionName = 'PrecheckReception'
$appSource = Join-Path $PSScriptRoot 'app'
# 로그인 때 접수 현황을 켜는 사용자 레지스트리 시작 항목(도우미와 함께 까는 install.ps1과 같은 이름)과 바탕 화면 바로 가기
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName = 'Seoseungkwan.PrecheckReception'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '접수 현황 주소.lnk'

$exitCode = 0
try {
    if (-not $env:LOCALAPPDATA) { throw '이 윈도우 사용자의 LOCALAPPDATA 폴더를 찾지 못했습니다.' }
    $installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\PrecheckReception'
    $helperDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\PrecheckHelper'
    if (-not (Test-Path -LiteralPath (Join-Path $appSource "$receptionName.exe"))) {
        throw "설치할 파일이 없습니다. 받은 zip을 오른쪽 클릭 → '모두 압축 풀기'를 한 뒤, 푼 폴더에서 install-reception.cmd를 누르세요."
    }

    # 0. 도우미와 이 PC의 의원 등록이 먼저 있어야 한다. 없으면 아무것도 바꾸지 않고 멈춘다
    if (-not (Test-Path -LiteralPath (Join-Path $helperDir 'PrecheckHelper.exe')) -or -not (Test-Path -LiteralPath (Join-Path $helperDir 'data\registration.dat'))) {
        throw '도우미가 없거나 이 PC에 등록한 의원이 없습니다. 도우미를 먼저 설치하고, 사이트의 비트 PC 연결 화면에서 [처음 등록]을 마친 뒤 다시 눌러 주세요.'
    }

    # 1. 돌던 접수 현황을 끝낸다(켜져 있으면 덮어쓸 수 없다). 이 윈도우 로그인의 것만 끈다. 도우미는 끄지 않는다
    $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    $running = @(Get-Process -Name $receptionName -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
    if ($running.Count -gt 0) {
        Write-Host '켜져 있던 접수 현황을 끕니다.'
        $running | Stop-Process -Force
        $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    }

    # 2. 프로그램 파일을 자기 폴더에 덮어쓴다. zip의 app\ 안 파일만 옮긴다
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Get-ChildItem -LiteralPath $appSource -File | Copy-Item -Destination $installDir -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall-reception.ps1') -Destination $installDir -Force
    # 인터넷에서 받은 파일 표시를 지워, 윈도우가 프로그램을 막지 않게 한다
    Get-ChildItem -LiteralPath $installDir -File | Unblock-File

    # 3. 시작 항목: 이 사용자가 윈도우에 로그인하면 PrecheckReception.exe를 인자 없이 켠다(47200번 문에서 기다린다)
    #    경로에 빈칸이 있어도 되게 따옴표로 감싼다
    $receptionExe = Join-Path $installDir "$receptionName.exe"
    if (-not (Test-Path -LiteralPath $runKey)) { New-Item -Path $runKey -Force | Out-Null }
    Set-ItemProperty -LiteralPath $runKey -Name $runName -Value ('"' + $receptionExe + '"')

    # 4. 바탕 화면 "접수 현황 주소" 바로 가기: 꺼져 있으면 켜고, 이 PC 브라우저로 주소 보내기 화면(127.0.0.1:47200/link)을 연다
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $receptionExe
    $shortcut.Arguments = '--link'
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Description = '직원 휴대폰에 보낼 접수 현황 주소를 엽니다'
    $shortcut.Save()

    # 5. 접수 현황을 지금 켠다(창 없이 돈다). 처음 한 번 윈도우 방화벽이 묻는 창이 뜬다
    Start-Process -FilePath $receptionExe -WorkingDirectory $installDir

    Write-Host ''
    Write-Host '접수 현황을 설치하고 켰습니다. 도우미는 그대로 두었습니다.' -ForegroundColor Green
    Write-Host "설치한 곳: $installDir"
    Write-Host '앞으로 이 PC에 로그인하면 저절로 켜집니다.'
    Write-Host "'Windows 보안 경고' 창이 뜨면 '개인 네트워크'에 체크하고 [허용]을 누르세요."
    Write-Host "네트워크가 '공용'으로 되어 있으면 윈도우 설정에서 '개인'으로 바꾸세요."
    Write-Host "직원 휴대폰에 주소를 보내려면 바탕 화면의 '접수 현황 주소'를 누르세요."
}
catch {
    $exitCode = 1
    Write-Host ''
    Write-Host '설치하지 못했습니다.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host '그래도 안 되면 이 창을 사진으로 찍어 보내 주세요.'
}

Write-Host ''
[void](Read-Host '엔터를 누르면 이 창이 닫힙니다')
exit $exitCode
