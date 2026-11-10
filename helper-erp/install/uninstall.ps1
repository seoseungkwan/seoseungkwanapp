# ERP 마감일지 도우미 지우기 (specs/erp-closing-fill/design.md 3-5, AC-3611.5)
# - ERP 도우미의 크롬 등록(사용자 레지스트리 열쇠 하나)과 %LOCALAPPDATA%\Seoseungkwan\ErpHelper 폴더(app·data·logs)만 지운다. 관리자 권한이 필요 없다
# - 다른 도우미의 폴더·크롬 등록은 건드리지 않는다. data\에는 이 PC 등록만 있다(다시 설치하면 install.cmd가 다시 등록한다)
# - 윈도우 PowerShell 5.1에서 돈다. 한글 문구가 깨지지 않게 이 파일은 UTF-8 BOM으로 저장한다
# - 부르는 법: 이 파일을 오른쪽 클릭 → 'PowerShell에서 실행'
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$helperName = 'SeoseungkwanErpHelper'
$regKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.seoseungkwan.erp_helper'

$exitCode = 0
try {
    if (-not $env:LOCALAPPDATA) { throw '이 윈도우 사용자의 LOCALAPPDATA 폴더를 찾지 못했어요.' }
    $helperDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\ErpHelper'
    # 이 창이 지울 폴더 안에서 열렸어도 그 폴더를 지울 수 있게 다른 곳으로 옮겨 간다
    Set-Location -LiteralPath $env:TEMP
    [System.Environment]::CurrentDirectory = $env:TEMP

    # 1. 돌던 ERP 도우미를 끝낸다(켜져 있으면 exe를 지울 수 없다). 이 윈도우 로그인의 것만 끈다
    $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    $running = @(Get-Process -Name $helperName -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
    if ($running.Count -gt 0) {
        Write-Host '켜져 있던 ERP 도우미를 끕니다.'
        $running | Stop-Process -Force
        $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    }

    # 2. 크롬 등록(ERP 도우미 열쇠)을 지운다
    if (Test-Path -LiteralPath $regKey) { Remove-Item -LiteralPath $regKey -Recurse -Force }

    # 3. ErpHelper 폴더(프로그램·등록·진단 기록)를 지운다
    if (Test-Path -LiteralPath $helperDir) { Remove-Item -LiteralPath $helperDir -Recurse -Force }

    Write-Host 'ERP 도우미와 크롬 등록을 지웠어요.' -ForegroundColor Green
}
catch {
    $exitCode = 1
    Write-Host ''
    Write-Host '지우지 못했어요.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host '크롬의 ERP 화면을 닫고 다시 해 보세요. 그래도 안 되면 이 창을 사진으로 찍어 보내 주세요.'
}

Write-Host ''
[void](Read-Host '엔터를 누르면 이 창이 닫힙니다')
exit $exitCode
