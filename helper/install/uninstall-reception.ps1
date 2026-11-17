# 접수 현황 따로 지우기 (specs/reception-phone/design.md 11절 '따로 설치', TASK-35)
# - install-reception.ps1이 만든 것만 지운다: 돌던 PrecheckReception을 끄고, 시작 항목(HKCU Run)·바탕 화면 "접수 현황 주소" 바로 가기·
#   자기 폴더 %LOCALAPPDATA%\Seoseungkwan\PrecheckReception\을 지운다
# - 도우미(PrecheckHelper)·도우미 data\(등록·설정·로고·고치던 메모·완료 표시·엑스레이 표시)·크롬 등록은 그대로 둔다. 다시 깔면 설정이 그대로다(AC-5707.4)
# - 관리자 권한이 필요 없다. 윈도우 PowerShell 5.1에서 돈다. 한글 문구가 깨지지 않게 이 파일은 UTF-8 BOM으로 저장한다
# - 부르는 법: zip을 푼 폴더에서 uninstall-reception.cmd를 누른다(설치 폴더의 이 파일은 오른쪽 클릭 → 'PowerShell에서 실행')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$receptionName = 'PrecheckReception'
# install-reception.ps1과 같은 이름·자리
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName = 'Seoseungkwan.PrecheckReception'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '접수 현황 주소.lnk'

$exitCode = 0
try {
    if (-not $env:LOCALAPPDATA) { throw '이 윈도우 사용자의 LOCALAPPDATA 폴더를 찾지 못했습니다.' }
    $installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\PrecheckReception'
    # 이 창이 설치 폴더 안에서 열렸어도 그 폴더를 지울 수 있게 다른 곳으로 옮겨 간다
    Set-Location -LiteralPath $env:TEMP
    [System.Environment]::CurrentDirectory = $env:TEMP

    # 1. 돌던 접수 현황을 끝낸다(켜져 있으면 exe를 지울 수 없다). 이 윈도우 로그인의 것만 끈다. 도우미는 끄지 않는다
    $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    $running = @(Get-Process -Name $receptionName -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
    if ($running.Count -gt 0) {
        Write-Host '켜져 있던 접수 현황을 끕니다.'
        $running | Stop-Process -Force
        $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    }

    # 2. 시작 항목(로그인 때 켜기)과 바탕 화면 바로 가기를 지운다. 없으면 그냥 지나간다
    if (Get-ItemProperty -LiteralPath $runKey -Name $runName -ErrorAction SilentlyContinue) {
        Remove-ItemProperty -LiteralPath $runKey -Name $runName -Force
    }
    if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath -Force }

    # 3. 자기 폴더만 지운다(도우미 폴더는 건드리지 않는다)
    if (Test-Path -LiteralPath $installDir) { Remove-Item -LiteralPath $installDir -Recurse -Force }

    Write-Host ''
    Write-Host '접수 현황을 지웠습니다.' -ForegroundColor Green
    Write-Host "시작 항목과 바탕 화면 '접수 현황 주소'도 지웠습니다."
    Write-Host '설정과 등록은 남겨 두었습니다. 다시 설치하면 그대로 씁니다.'
}
catch {
    $exitCode = 1
    Write-Host ''
    Write-Host '지우지 못했습니다.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host '잠시 뒤 다시 해 보세요. 그래도 안 되면 이 창을 사진으로 찍어 보내 주세요.'
}

Write-Host ''
[void](Read-Host '엔터를 누르면 이 창이 닫힙니다')
exit $exitCode
