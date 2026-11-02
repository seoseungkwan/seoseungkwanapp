# 비트 읽기 속도 측정 준비 (specs/diag-read-speed). speed-check.cmd가 부른다
# - 설치하지 않는다. 푼 폴더 app\의 인터넷 표시만 지운다(install.ps1과 같은 이유: 윈도우가 프로그램을 막지 않게)
# - 윈도우 PowerShell 5.1에서 돈다. 한글이 깨지지 않게 이 파일은 UTF-8 BOM으로 저장한다
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 3.0

$app = Join-Path $PSScriptRoot 'app'

try {
    if (-not (Test-Path -LiteralPath (Join-Path $app 'PrecheckHelper.exe'))) { throw 'app 폴더가 없습니다' }
    Get-ChildItem -LiteralPath $app -File | Unblock-File
}
catch {
    Write-Host ''
    Write-Host '측정을 시작하지 못했습니다.' -ForegroundColor Red
    Write-Host "받은 zip을 오른쪽 클릭 → '모두 압축 풀기'를 한 뒤, 푼 폴더에서 speed-check.cmd를 누르세요."
    Write-Host '그래도 안 되면 이 창을 사진으로 찍어 보내 주세요.'
    Write-Host ''
    [void](Read-Host '엔터를 누르면 이 창이 닫힙니다')
    exit 1
}
exit 0
