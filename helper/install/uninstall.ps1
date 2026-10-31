# 청구 사전점검 도우미 지우기 (specs/precheck/design.md 12절, REQ-002 AC-002.4)
# - 크롬 등록(사용자 레지스트리)과 프로그램 파일을 지운다. 관리자 권한이 필요 없다
# - data\(고치던 메모·완료 표시·등록 병원)는 물어보고 '예'일 때만 지운다
# - 윈도우 PowerShell 5.1에서 돈다. 한글 문구가 깨지지 않게 이 파일은 UTF-8 BOM으로 저장한다
# - 부르는 법: 이 파일을 오른쪽 클릭 → 'PowerShell에서 실행'
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$helperName = 'PrecheckHelper'
$regKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.seoseungkwan.precheck'

$exitCode = 0
try {
    if (-not $env:LOCALAPPDATA) { throw '이 윈도우 사용자의 LOCALAPPDATA 폴더를 찾지 못했습니다.' }
    $installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\PrecheckHelper'
    $dataDir = Join-Path $installDir 'data'
    # 이 창이 설치 폴더 안에서 열렸어도 그 폴더를 지울 수 있게 다른 곳으로 옮겨 간다
    Set-Location -LiteralPath $env:TEMP
    [System.Environment]::CurrentDirectory = $env:TEMP

    # 1. 돌던 도우미를 끝낸다(켜져 있으면 exe를 지울 수 없다). 이 윈도우 로그인의 것만 끈다
    $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
    $running = @(Get-Process -Name $helperName -ErrorAction SilentlyContinue | Where-Object { $_.SessionId -eq $session })
    if ($running.Count -gt 0) {
        Write-Host '켜져 있던 도우미를 끕니다.'
        $running | Stop-Process -Force
        $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    }

    # 2. 크롬 등록을 지운다
    if (Test-Path -LiteralPath $regKey) { Remove-Item -LiteralPath $regKey -Recurse -Force }

    # 3. 프로그램 파일(exe·DLL·등록 파일·진단 기록)을 지운다. data\는 여기서 빼고 아래에서 물어본다
    if (Test-Path -LiteralPath $installDir) {
        Get-ChildItem -LiteralPath $installDir -Force | Where-Object { $_.Name -ne 'data' } | Remove-Item -Recurse -Force
    }
    Write-Host '도우미 프로그램과 크롬 등록을 지웠습니다.'

    # 4. data\는 물어보고 '예'일 때만 지운다. 그냥 엔터면 남긴다
    if (Test-Path -LiteralPath $dataDir) {
        Write-Host ''
        Write-Host '고치던 메모·완료 표시가 지워집니다. 지울까요?' -ForegroundColor Yellow
        Write-Host '(남겨 두면 다시 설치했을 때 이어서 쓸 수 있습니다)'
        $answer = Read-Host '지우려면 Y를 누르고 엔터, 남기려면 그냥 엔터'
        if (@('Y', '예') -contains $answer.Trim()) {
            Remove-Item -LiteralPath $dataDir -Recurse -Force
            Write-Host '고치던 메모·완료 표시도 지웠습니다.'
        }
        else {
            Write-Host "고치던 메모·완료 표시는 남겨 두었습니다: $dataDir"
        }
    }

    # 5. 비어 있는 폴더만 치운다(data\를 남겼으면 남는다)
    foreach ($dir in @($installDir, (Split-Path -Parent $installDir))) {
        if ((Test-Path -LiteralPath $dir) -and -not (Get-ChildItem -LiteralPath $dir -Force | Select-Object -First 1)) {
            Remove-Item -LiteralPath $dir -Force
        }
    }
}
catch {
    $exitCode = 1
    Write-Host ''
    Write-Host '지우지 못했습니다.' -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host '크롬의 청구 화면을 닫고 다시 해 보세요. 그래도 안 되면 이 창을 사진으로 찍어 보내 주세요.'
}

Write-Host ''
[void](Read-Host '엔터를 누르면 이 창이 닫힙니다')
exit $exitCode
