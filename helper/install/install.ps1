# 청구 사전점검 도우미 설치 (specs/precheck/design.md 12절, REQ-002 AC-002.4)
# + 접수 현황 PrecheckReception.exe (specs/reception-phone/design.md 9·11절, REQ-1411·REQ-1412)
# - 관리자 권한이 필요 없다. 이 윈도우 사용자의 폴더(%LOCALAPPDATA%)·사용자 레지스트리(HKCU)·이 사용자의 바탕 화면만 쓴다
# - 돌던 도우미·접수 현황을 먼저 끝내고 프로그램 파일을 덮어쓴다. data\(고치던 메모·완료 표시·등록 병원)와 logs\는 건드리지 않는다
# - 접수 현황: 로그인 때 켜는 시작 항목(HKCU Run, 인자 없음)과 바탕 화면 "접수 현황 주소" 바로 가기(--link)를 만들고 바로 켠다
#   방화벽 규칙은 만들지 않는다(관리자 권한이 필요하다). 처음 켤 때 윈도우가 묻는 창에서 사용자가 [허용]을 누른다
# - 윈도우 PowerShell 5.1(윈도우 10·11 기본)에서 돈다. 한글 문구가 깨지지 않게 이 파일은 UTF-8 BOM으로 저장한다
# - 부르는 법: zip을 모두 푼 폴더에서 install.cmd를 누른다
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$hostName = 'com.seoseungkwan.precheck'
$helperName = 'PrecheckHelper'
$receptionName = 'PrecheckReception'
$regKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.seoseungkwan.precheck'
$appSource = Join-Path $PSScriptRoot 'app'
$template = Join-Path $PSScriptRoot 'host-manifest.json'
# 로그인 때 접수 현황을 켜는 사용자 레지스트리 시작 항목과 바탕 화면 바로 가기. uninstall.ps1이 같은 이름으로 지운다
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName = 'Seoseungkwan.PrecheckReception'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '접수 현황 주소.lnk'

$exitCode = 0
try {
    if (-not $env:LOCALAPPDATA) { throw '이 윈도우 사용자의 LOCALAPPDATA 폴더를 찾지 못했습니다.' }
    $installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\PrecheckHelper'
    if (-not (Test-Path -LiteralPath (Join-Path $appSource "$helperName.exe")) -or -not (Test-Path -LiteralPath (Join-Path $appSource "$receptionName.exe")) -or -not (Test-Path -LiteralPath $template)) {
        throw "설치할 파일이 없습니다. 받은 zip을 오른쪽 클릭 → '모두 압축 풀기'를 한 뒤, 푼 폴더에서 install.cmd를 누르세요."
    }

    # 1. 돌던 도우미와 접수 현황을 끝낸다(켜져 있으면 파일을 덮어쓸 수 없다). 이 윈도우 로그인의 것만 끈다
    #    접수 현황은 늘 켜져 기다리는 프로그램이라 스스로 끝나지 않는다
    $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    $running = @(Get-Process -Name $helperName, $receptionName -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
    if ($running.Count -gt 0) {
        Write-Host '켜져 있던 도우미·접수 현황을 끕니다.'
        $running | Stop-Process -Force
        $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    }

    # 2. 프로그램 파일을 덮어쓴다. zip의 app\ 안 파일만 옮긴다(폴더는 옮기지 않으므로 data\·logs\는 그대로 남는다)
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Get-ChildItem -LiteralPath $appSource -File | Copy-Item -Destination $installDir -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall.ps1') -Destination $installDir -Force
    # 인터넷에서 받은 파일 표시를 지워, 크롬이 도우미를 켤 때 윈도우가 막지 않게 한다
    Get-ChildItem -LiteralPath $installDir -File | Unblock-File

    # 3. 등록 파일: 틀(host-manifest.json)의 path를 실제 exe 경로로 채워 프로그램 폴더에 쓴다(UTF-8, BOM 없음)
    $exePath = Join-Path $installDir "$helperName.exe"
    $manifestPath = Join-Path $installDir "$hostName.json"
    $json = [System.IO.File]::ReadAllText($template, [System.Text.Encoding]::UTF8)
    if (-not $json.Contains('"__HELPER_EXE__"')) { throw '등록 파일 틀(host-manifest.json)이 틀렸습니다.' }
    $json = $json.Replace('"__HELPER_EXE__"', '"' + $exePath.Replace('\', '\\') + '"')
    [System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))

    # 4. 크롬이 도우미를 찾는 자리(사용자 레지스트리)의 기본값에 등록 파일 경로를 쓴다
    if (-not (Test-Path -LiteralPath $regKey)) { New-Item -Path $regKey -Force | Out-Null }
    Set-ItemProperty -LiteralPath $regKey -Name '(default)' -Value $manifestPath

    # 5. 접수 현황 시작 항목: 이 사용자가 윈도우에 로그인하면 PrecheckReception.exe를 인자 없이 켠다(47200번 문에서 기다린다)
    #    경로에 빈칸이 있어도 되게 따옴표로 감싼다
    $receptionExe = Join-Path $installDir "$receptionName.exe"
    if (-not (Test-Path -LiteralPath $runKey)) { New-Item -Path $runKey -Force | Out-Null }
    Set-ItemProperty -LiteralPath $runKey -Name $runName -Value ('"' + $receptionExe + '"')

    # 6. 바탕 화면 "접수 현황 주소" 바로 가기: 꺼져 있으면 켜고, 이 PC 브라우저로 주소 보내기 화면(127.0.0.1:47200/link)을 연다
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $receptionExe
    $shortcut.Arguments = '--link'
    $shortcut.WorkingDirectory = $installDir
    $shortcut.Description = '직원 휴대폰에 보낼 접수 현황 주소를 엽니다'
    $shortcut.Save()

    # 7. 접수 현황을 지금 켠다(창 없이 돈다). 처음 한 번 윈도우 방화벽이 묻는 창이 뜬다
    Start-Process -FilePath $receptionExe -WorkingDirectory $installDir

    Write-Host ''
    Write-Host '도우미를 설치했습니다.' -ForegroundColor Green
    Write-Host "설치한 곳: $installDir"
    Write-Host '크롬을 다시 켤 필요는 없습니다. 열어 둔 청구 화면이 있으면 새로고침(F5)하세요.'
    Write-Host ''
    Write-Host '접수 현황도 켰습니다. 앞으로 이 PC에 로그인하면 저절로 켜집니다.' -ForegroundColor Green
    Write-Host "'Windows 보안 경고' 창이 뜨면 '개인 네트워크'에 체크하고 [허용]을 누르세요."
    Write-Host "직원 휴대폰에 주소를 보내려면 바탕 화면의 '접수 현황 주소'를 누르세요."
}
catch {
    $exitCode = 1
    Write-Host ''
    Write-Host '설치하지 못했습니다.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host '크롬의 청구 화면을 닫고 다시 해 보세요. 그래도 안 되면 이 창을 사진으로 찍어 보내 주세요.'
}

Write-Host ''
[void](Read-Host '엔터를 누르면 이 창이 닫힙니다')
exit $exitCode
